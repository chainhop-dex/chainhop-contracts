// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.12;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./lib/MessageSenderLib.sol";
import "./lib/MessageReceiverApp.sol";
import "./lib/MsgDataTypes.sol";
import "./FeeOperator.sol";
import "./SigVerifier.sol";
import "./Swapper.sol";
import "./interfaces/ICodec.sol";

/**
 * @author Chainhop Dex Team
 * @author Padoriku
 * @title An app that enables swapping on a chain, transferring to another chain and swapping
 * another time on the destination chain before sending the result tokens to a user
 */
contract TransferSwapper is MessageReceiverApp, Swapper, SigVerifier, FeeOperator, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    struct TransferDescription {
        address receiver; // the receiving party (the user) of the final output token
        uint64 dstChainId; // destination chain id
        uint32 maxBridgeSlippage; // user defined maximum allowed slippage (pip) at bridge
        MsgDataTypes.BridgeSendType bridgeType; // type of the bridge to use
        uint64 nonce; // nonce is needed for de-dup tx at this contract and bridge
        bool nativeIn; // whether to check msg.value and wrap token before swapping/sending
        bool nativeOut; // whether to unwrap before sending the final token to user
        uint256 fee; // this fee is only executor fee. it does not include msg bridge fee
        uint256 feeDeadline; // the unix timestamp before which the fee is valid
        // sig of sha3("executor fee", srcChainId, dstChainId, amountIn, tokenIn, feeDeadline, fee)
        // see _verifyFee()
        bytes feeSig;
        // IMPORTANT: amountIn and tokenIn are completely ignored if src chain has a swap
        // these two fields are only meant for the scenario where no swaps are needed on src chain
        uint256 amountIn;
        address tokenIn;
        address dstTokenOut; // the final output token, emitted in event for display purpose only
        // in case of multi route swaps, whether to allow the successful swaps to go through
        // and sending the amountIn of the failed swaps back to user
        bool allowPartialFill;
    }

    struct Request {
        bytes32 id; // see _computeId()
        ICodec.SwapDescription[] swaps; // the swaps need to happen on the destination chain
        address receiver; // see TransferDescription.receiver
        bool nativeOut; // see TransferDescription.nativeOut
        uint256 fee; // see TransferDescription.fee
        bool allowPartialFill; // see TransferDescription.allowPartialFill
    }

    /**
     * @notice Denotes the status of a cross-chain transfer/swap request
     * @dev Partially filled requests are considered 'Succeeded'. There is no 'Failed' state as
     * it's only possible if everything reverts and there is no successful transaction
     * @param Null An empty status that should never be reached
     * @param Succeeded Transfer/swap has succeeded and funds are received by the receiver
     * @param Fallback Swaps have failed on the dst chain, and bridge tokens are refunded to receiver
     */
    enum RequestStatus {
        Null,
        Succeeded,
        Fallback
    }

    event NativeWrapUpdated(address nativeWrap);

    /**
     * @notice Emitted when requested dstChainId == srcChainId, no bridging
     * @param id see _computeId()
     * @param amountIn the input amount approved by the sender
     * @param tokenIn the input token approved by the sender
     * @param amountOut the output amount gained after swapping using the input tokens
     * @param tokenOut the output token gained after swapping using the input tokens
     */
    event DirectSwap(bytes32 id, uint256 amountIn, address tokenIn, uint256 amountOut, address tokenOut);

    /**
     * @notice Emitted when operations on src chain is done, the transfer is sent through the bridge
     * @param id see _computeId()
     * @param transferId the src transfer id produced by MessageSenderLib.sendMessageWithTransfer()
     * @param dstChainId destination chain id
     * @param srcAmount input amount approved by the sender
     * @param srcToken the input token approved by the sender
     * @param dstToken the final output token (after bridging and swapping) desired by the sender
     * @param bridgeOutReceiver the receiver (user or dst TransferSwapper) of the bridge token
     */
    event RequestSent(
        bytes32 id,
        bytes32 transferId,
        uint64 dstChainId,
        uint256 srcAmount,
        address srcToken,
        address dstToken,
        address bridgeOutReceiver
    );
    // emitted when operations on dst chain is done.
    // dstAmount is denominated by dstToken, refundAmount is denominated by bridge out token.
    // if refundAmount is a non-zero number, it means the "allow partial fill" option is turned on.

    /**
     * @notice Emitted when operations on dst chain is done.
     * @param id see _computeId()
     * @param dstAmount the final output token (after bridging and swapping) desired by the sender
     * @param refundAmount the amount refunded to the receiver in bridge token
     * @dev refundAmount may be fill by either a complete refund or when allowPartialFill is on and
     * some swaps fails in the swap routes
     * @param refundToken bridge out token
     * @param feeCollected the fee chainhop deducts from bridge out token
     * @param status see RequestStatus
     */
    event RequestDone(
        bytes32 id,
        uint256 dstAmount,
        uint256 refundAmount,
        address refundToken,
        uint256 feeCollected,
        RequestStatus status
    );

    /// @notice erc20 wrap of the gas token of this chain, e.g. WETH
    address public nativeWrap;

    /// @dev saves the sender addresses of direct bridge transfers so that when refund happens, this contract
    /// knows who to refund the tokens to
    mapping(bytes32 => address) public directBridgeSenders;

    constructor(
        address _messageBus,
        address _nativeWrap,
        address _signer,
        address _feeCollector,
        string[] memory _funcSigs,
        address[] memory _codecs,
        address[] memory _supportedDexList,
        string[] memory _supportedDexFuncs
    )
        Swapper(_funcSigs, _codecs, _supportedDexList, _supportedDexFuncs)
        FeeOperator(_feeCollector)
        SigVerifier(_signer)
    {
        messageBus = _messageBus;
        nativeWrap = _nativeWrap;
    }

    /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
     * Source chain functions
     * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

    /**
     * @notice swaps if needed, then transfer the token to another chain along with an instruction on how to swap
     * on that chain
     * @param _dstTransferSwapper the address of the receiving party of the bridge token (TransferSwapper) on the destination chain
     * @dev this field has no effect if the there is no dst swaps as the bridged tokens are sent directly to _desc.receiver
     */
    function transferWithSwap(
        address _dstTransferSwapper,
        TransferDescription calldata _desc,
        ICodec.SwapDescription[] calldata _srcSwaps,
        ICodec.SwapDescription[] calldata _dstSwaps
    ) external payable nonReentrant {
        // a request needs to incur a swap, a transfer, or both. otherwise it's a nop and we revert early to save gas
        require(_srcSwaps.length != 0 || _desc.dstChainId != uint64(block.chainid), "nop");
        require(_srcSwaps.length != 0 || (_desc.amountIn != 0 && _desc.tokenIn != address(0)), "nop");

        uint256 amountIn = _desc.amountIn;
        address tokenIn = _desc.tokenIn;
        address tokenOut = _desc.tokenIn;
        ICodec[] memory codecs;

        if (_srcSwaps.length != 0) {
            (amountIn, tokenIn, tokenOut, codecs) = sanitizeSwaps(_srcSwaps);
            require(tokenIn == _desc.tokenIn, "tkin mm");
        }
        if (_desc.nativeIn) {
            require(tokenIn == nativeWrap, "tkin no nativeWrap");
            require(msg.value >= amountIn, "insfcnt amt"); // insufficient amount
            IWETH(nativeWrap).deposit{value: amountIn}();
        } else {
            IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        }
        _swapAndSend(_dstTransferSwapper, amountIn, tokenIn, tokenOut, _srcSwaps, _dstSwaps, _desc, codecs);
    }

    function _swapAndSend(
        address _dstTransferSwapper,
        uint256 _amountIn,
        address _tokenIn,
        address _tokenOut,
        ICodec.SwapDescription[] memory _srcSwaps,
        ICodec.SwapDescription[] memory _dstSwaps,
        TransferDescription memory _desc,
        ICodec[] memory _codecs
    ) private {
        // swap if needed
        uint256 amountOut = _amountIn;
        if (_srcSwaps.length != 0) {
            bool ok;
            (ok, amountOut) = executeSwaps(_srcSwaps, _codecs);
            require(ok, "swap fail");
        }

        bytes32 id = _computeId(_desc.receiver, _desc.nonce);
        // direct send if needed
        if (_desc.dstChainId == uint64(block.chainid)) {
            emit DirectSwap(id, _amountIn, _tokenIn, amountOut, _tokenOut);
            _sendToken(_tokenOut, amountOut, _desc.receiver, _desc.nativeOut);
            return;
        }

        _verifyFee(_desc, _amountIn, _tokenIn);
        uint256 msgFee = msg.value;
        if (_desc.nativeIn) {
            msgFee = msg.value - _amountIn;
        }
        // transfer through bridge
        address bridgeOutReceiver = _dstSwaps.length > 0 ? _dstTransferSwapper : _desc.receiver;
        bytes32 transferId = _transfer(id, bridgeOutReceiver, _desc, _dstSwaps, amountOut, _tokenOut, msgFee);
        emit RequestSent(id, transferId, _desc.dstChainId, _amountIn, _tokenIn, _desc.dstTokenOut, bridgeOutReceiver);
    }

    function _transfer(
        bytes32 _id,
        address _bridgeOutReceiver,
        TransferDescription memory _desc,
        ICodec.SwapDescription[] memory _dstSwaps,
        uint256 _amount,
        address _token,
        uint256 _msgFee
    ) private returns (bytes32 transferId) {
        bytes memory requestMessage = _encodeRequestMessage(_id, _desc, _dstSwaps);
        transferId = MessageSenderLib.sendMessageWithTransfer(
            _bridgeOutReceiver,
            _token,
            _amount,
            _desc.dstChainId,
            _desc.nonce,
            _desc.maxBridgeSlippage,
            requestMessage,
            _desc.bridgeType,
            messageBus,
            _msgFee
        );
    }

    /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
     * Destination chain functions
     * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

    /**
     * @notice Executes a swap if needed, then sends the output token to the receiver
     * @dev If allowPartialFill is off, this function reverts as soon as one swap in swap routes fails
     * @dev This function is called and is only callable by MessageBus. The transaction of such call is triggered by executor.
     * @param _token the token received by this contract
     * @param _amount the amount of token received by this contract
     * @return ok whether the processing is successful
     */
    function executeMessageWithTransfer(
        address, // _sender
        address _token,
        uint256 _amount,
        uint64, // _srcChainId
        bytes memory _message,
        address // _executor
    ) external payable override onlyMessageBus nonReentrant returns (ExecutionStatus) {
        Request memory m = abi.decode((_message), (Request));

        // handle the case where amount received is not enough to pay fee
        if (_amount < m.fee) {
            m.fee = _amount;
            emit RequestDone(m.id, 0, 0, _token, m.fee, RequestStatus.Succeeded);
            return ExecutionStatus.Success;
        } else {
            _amount = _amount - m.fee;
        }

        address tokenOut = _token;
        bool nativeOut = m.nativeOut;
        uint256 sumAmtOut = _amount;
        uint256 sumAmtFailed;

        if (m.swaps.length != 0) {
            ICodec[] memory codecs;
            address tokenIn;
            // swap first before sending the token out to user
            (, tokenIn, tokenOut, codecs) = sanitizeSwaps(m.swaps);
            require(tokenIn == _token, "tkin mm"); // tokenIn mismatch
            (sumAmtOut, sumAmtFailed) = executeSwapsWithOverride(m.swaps, codecs, _amount, m.allowPartialFill);
            // if at this stage the tx is not reverted, it means at least 1 swap in routes succeeded
        }
        if (sumAmtFailed > 0) {
            _sendToken(_token, sumAmtFailed, m.receiver, false);
        }
        _sendToken(tokenOut, sumAmtOut, m.receiver, nativeOut);
        // status is always success as long as this function call doesn't revert. partial fill is also considered success
        emit RequestDone(m.id, sumAmtOut, sumAmtFailed, _token, m.fee, RequestStatus.Succeeded);
        return ExecutionStatus.Success;
    }

    /**
     * @notice Sends the received token to the receiver
     * @dev Only called if executeMessageWithTransfer reverts
     * @param _token the token received by this contract
     * @param _amount the amount of token received by this contract
     * @return ok whether the processing is successful
     */
    function executeMessageWithTransferFallback(
        address, // _sender
        address _token,
        uint256 _amount,
        uint64, // _srcChainId
        bytes memory _message,
        address // _executor
    ) external payable override onlyMessageBus nonReentrant returns (ExecutionStatus) {
        Request memory m = abi.decode((_message), (Request));

        uint256 refundAmount = _amount - m.fee; // no need to check amount >= fee as it's already checked before
        _sendToken(_token, refundAmount, m.receiver, false);

        emit RequestDone(m.id, 0, refundAmount, _token, m.fee, RequestStatus.Fallback);
        return ExecutionStatus.Success;
    }

    /**
     * @notice Used to trigger refund when bridging fails due to large slippage
     * @dev only MessageBus can call this function, this requires the user to get sigs of the message from SGN
     * @param _token the token received by this contract
     * @param _amount the amount of token received by this contract
     * @return ok whether the processing is successful
     */
    function executeMessageWithTransferRefund(
        address _token,
        uint256 _amount,
        bytes calldata _message,
        address // _executor
    ) external payable override onlyMessageBus nonReentrant returns (ExecutionStatus) {
        Request memory m = abi.decode((_message), (Request));
        _sendToken(_token, _amount, m.receiver, false);
        emit RequestDone(m.id, 0, _amount, _token, m.fee, RequestStatus.Fallback);
        return ExecutionStatus.Success;
    }

    /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
     * Misc
     * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
    function _computeId(address _receiver, uint64 _nonce) private view returns (bytes32) {
        return keccak256(abi.encodePacked(msg.sender, _receiver, uint64(block.chainid), _nonce));
    }

    function _sendToken(
        address _token,
        uint256 _amount,
        address _receiver,
        bool _nativeOut
    ) private {
        if (_nativeOut) {
            require(_token == nativeWrap, "tk no native");
            IWETH(nativeWrap).withdraw(_amount);
            (bool sent, ) = _receiver.call{value: _amount, gas: 50000}("");
            require(sent, "send fail");
        } else {
            IERC20(_token).safeTransfer(_receiver, _amount);
        }
    }

    function _encodeRequestMessage(
        bytes32 _id,
        TransferDescription memory _desc,
        ICodec.SwapDescription[] memory _swaps
    ) private pure returns (bytes memory message) {
        message = abi.encode(
            Request({
                id: _id,
                swaps: _swaps,
                receiver: _desc.receiver,
                nativeOut: _desc.nativeOut,
                fee: _desc.fee,
                allowPartialFill: _desc.allowPartialFill
            })
        );
    }

    function _verifyFee(
        TransferDescription memory _desc,
        uint256 _amountIn,
        address _tokenIn
    ) private view {
        bytes32 hash = keccak256(
            abi.encodePacked(
                "executor fee",
                uint64(block.chainid),
                _desc.dstChainId,
                _amountIn,
                _tokenIn,
                _desc.feeDeadline,
                _desc.fee
            )
        );
        bytes32 signHash = hash.toEthSignedMessageHash();
        verifySig(signHash, _desc.feeSig);
        require(_desc.feeDeadline > block.timestamp, "deadline exceeded");
    }

    function setNativeWrap(address _nativeWrap) external onlyOwner {
        nativeWrap = _nativeWrap;
        emit NativeWrapUpdated(_nativeWrap);
    }

    // This is needed to receive ETH when calling `IWETH.withdraw`
    receive() external payable {}
}
