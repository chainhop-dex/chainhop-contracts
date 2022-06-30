// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.12;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./lib/Types.sol";
import "./lib/MessageSenderLib.sol";
import "./lib/MessageReceiverApp.sol";
import "./BridgeRegistry.sol";
import "./FeeOperator.sol";
import "./SigVerifier.sol";
import "./Swapper.sol";
import "./interfaces/IBridgeAdapter.sol";
import "./interfaces/ICodec.sol";

/**
 * @author Chainhop Dex Team
 * @author Padoriku
 * @title An app that enables swapping on a chain, transferring to another chain and swapping
 * another time on the destination chain before sending the result tokens to a user
 */
contract TransferSwapper is MessageReceiverApp, Swapper, SigVerifier, FeeOperator, ReentrancyGuard, BridgeRegistry {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    /// @notice erc20 wrap of the gas token of this chain, e.g. WETH
    address public nativeWrap;

    constructor(
        address _messageBus,
        address _nativeWrap,
        address _signer,
        address _feeCollector,
        string[] memory _funcSigs,
        address[] memory _codecs,
        address[] memory _supportedDexList,
        string[] memory _supportedDexFuncs,
        bool _testMode
    )
        Swapper(_funcSigs, _codecs, _supportedDexList, _supportedDexFuncs)
        FeeOperator(_feeCollector)
        SigVerifier(_signer)
    {
        messageBus = _messageBus;
        nativeWrap = _nativeWrap;
        testMode = _testMode;
    }

    struct AddrsInfo {
        address tokenIn;
        address tokenOut; 
        address bridge;
    }

    /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
     * Source chain functions
     * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

    /**
     * @notice swaps if needed, then transfer the token to another chain along with an instruction on how to swap
     * on that chain
     */
    function transferWithSwap(
        Types.TransferDescription calldata _desc,
        ICodec.SwapDescription[] calldata _srcSwaps,
        ICodec.SwapDescription[] calldata _dstSwaps
    ) external payable nonReentrant {
        // a request needs to incur a swap, a transfer, or both. otherwise it's a nop and we revert early to save gas
        require(_srcSwaps.length != 0 || _desc.dstChainId != uint64(block.chainid), "nop");
        require(_srcSwaps.length != 0 || (_desc.amountIn != 0 && _desc.tokenIn != address(0)), "nop");

        IBridgeAdapter bridge = bridges[keccak256(bytes(_desc.bridgeProvider))];
        // if not DirectSwap, the bridge provider should be a valid one
        require(_desc.dstChainId == uint64(block.chainid) || address(bridge) != address(0), "not supported bridge");

        uint256 amountIn = _desc.amountIn;
        ICodec[] memory codecs;
        AddrsInfo memory addrsInfo; // using one variable to store related addrs, to avoid "stack too deep" error
        {
            address tokenIn = _desc.tokenIn;
            address tokenOut = _desc.tokenIn;
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
            addrsInfo = AddrsInfo(tokenIn, tokenOut, address(bridge));
        }

        _swapAndSend(addrsInfo, amountIn, _desc, _srcSwaps, _dstSwaps, codecs);
    }

    function _swapAndSend(
        AddrsInfo memory _addrsInfo, // [tokenIn, tokenOut, bridge]
        uint256 _amountIn,
        Types.TransferDescription memory _desc,
        ICodec.SwapDescription[] memory _srcSwaps,
        ICodec.SwapDescription[] memory _dstSwaps,
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
            emit Types.DirectSwap(id, _amountIn, _addrsInfo.tokenIn, amountOut, _addrsInfo.tokenOut);
            _sendToken(_addrsInfo.tokenOut, amountOut, _desc.receiver, _desc.nativeOut);
            return;
        }
        _verifyFee(_desc, _amountIn, _addrsInfo.tokenIn);
        uint256 msgFee = msg.value;
        if (_desc.nativeIn) {
            msgFee = msg.value - _amountIn;
        }

        _transfer(id, _addrsInfo, _desc, _dstSwaps, _amountIn, amountOut, msgFee);
    }

    function _transfer(
        bytes32 _id,
        AddrsInfo memory _addrsInfo, // [tokenIn, tokenOut, bridge]
        Types.TransferDescription memory _desc,
        ICodec.SwapDescription[] memory _dstSwaps,
        uint256 _amountIn,
        uint256 _amountOut,
        uint256 _msgFee
    ) private {
        // fund is directly to user if there is no swaps needed on the destination chain
        address bridgeOutReceiver = _dstSwaps.length > 0 ? _desc.dstTransferSwapper : _desc.receiver;

        IERC20(_addrsInfo.tokenOut).safeIncreaseAllowance(_addrsInfo.bridge, _amountOut);
        bytes memory requestMessage = _encodeRequestMessage(_id, _desc, _dstSwaps);
        bytes32 transferId = (IBridgeAdapter(_addrsInfo.bridge)).bridge{value: _msgFee}(
            _desc.dstChainId,
            bridgeOutReceiver,
            _amountOut,
            _addrsInfo.tokenOut,
            _desc.bridgeParams,
            requestMessage
        );
        emit Types.RequestSent(
            _id,
            transferId,
            _desc.dstChainId,
            _amountIn,
            _addrsInfo.tokenIn,
            _desc.dstTokenOut,
            bridgeOutReceiver
        );
    }

    /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
     * Destination chain functions
     * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

    /**
     * @notice Executes a swap if needed, then sends the output token to the receiver
     * @dev If allowPartialFill is off, this function reverts as soon as one swap in swap routes fails
     * @dev This function is called and is only callable by MessageBus. The transaction of such call is triggered by executor.
     * @dev Bridge contract *always* sends native token to its receiver (this contract) even though the _token field is always an ERC20 token
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
        Types.Request memory m = abi.decode((_message), (Types.Request));

        // handle the case where amount received is not enough to pay fee
        if (_amount < m.fee) {
            m.fee = _amount;
            emit Types.RequestDone(m.id, 0, 0, _token, m.fee, Types.RequestStatus.Succeeded);
            return ExecutionStatus.Success;
        } else {
            _amount = _amount - m.fee;
        }

        _wrapBridgeOutToken(_token, _amount);

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
            if (sumAmtFailed > 0) {
                _sendToken(_token, sumAmtFailed, m.receiver, false);
            }
        }

        _sendToken(tokenOut, sumAmtOut, m.receiver, nativeOut);
        // status is always success as long as this function call doesn't revert. partial fill is also considered success
        emit Types.RequestDone(m.id, sumAmtOut, sumAmtFailed, _token, m.fee, Types.RequestStatus.Succeeded);
        return ExecutionStatus.Success;
    }

    /**
     * @notice Sends the received token to the receiver
     * @dev Only called if executeMessageWithTransfer reverts
     * @dev Bridge contract *always* sends native token to its receiver (this contract) even though the _token field is always an ERC20 token
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
        Types.Request memory m = abi.decode((_message), (Types.Request));
        _wrapBridgeOutToken(_token, _amount);
        uint256 refundAmount = _amount - m.fee; // no need to check amount >= fee as it's already checked before
        _sendToken(_token, refundAmount, m.receiver, false);

        emit Types.RequestDone(m.id, 0, refundAmount, _token, m.fee, Types.RequestStatus.Fallback);
        return ExecutionStatus.Success;
    }

    /**
     * @notice Used to trigger refund when bridging fails due to large slippage
     * @dev only MessageBus can call this function, this requires the user to get sigs of the message from SGN
     * @dev Bridge contract *always* sends native token to its receiver (this contract) even though the _token field is always an ERC20 token
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
        Types.Request memory m = abi.decode((_message), (Types.Request));
        _wrapBridgeOutToken(_token, _amount);
        _sendToken(_token, _amount, m.receiver, false);
        emit Types.RequestDone(m.id, 0, _amount, _token, m.fee, Types.RequestStatus.Fallback);
        return ExecutionStatus.Success;
    }

    /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
     * Misc
     * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
    function _computeId(address _receiver, uint64 _nonce) private view returns (bytes32) {
        return keccak256(abi.encodePacked(msg.sender, _receiver, uint64(block.chainid), _nonce));
    }

    function _encodeRequestMessage(
        bytes32 _id,
        Types.TransferDescription memory _desc,
        ICodec.SwapDescription[] memory _swaps
    ) internal pure returns (bytes memory message) {
        message = abi.encode(
            Types.Request({
                id: _id,
                swaps: _swaps,
                receiver: _desc.receiver,
                nativeOut: _desc.nativeOut,
                fee: _desc.fee,
                allowPartialFill: _desc.allowPartialFill
            })
        );
    }

    function _wrapBridgeOutToken(address _token, uint256 _amount) private {
        // Wrapping the bridge token before doing anything. There is inefficiency in this function and _sendToken() only if the received the token
        // is native and the user wants native out. The wrapping then unwrapping process could be skipped. This inefficiency is tolerated for logic tidiness
        if (_token == nativeWrap) {
            // If the bridge out token is a native wrap, we need to check whether the actual received token is native token
            // Note Assumption: only the liquidity bridge is capable of sending a native wrap
            address bridge = IMessageBus(messageBus).liquidityBridge();
            // If bridge's nativeWrap is set, then bridge automatically unwraps the token and send it to this contract
            // Otherwise the received token in this contract is ERC20
            if (IBridge(bridge).nativeWrap() == nativeWrap) {
                IWETH(nativeWrap).deposit{value: _amount}();
            }
        }
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

    function _verifyFee(
        Types.TransferDescription memory _desc,
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
        emit Types.NativeWrapUpdated(_nativeWrap);
    }

    // This is needed to receive ETH when calling `IWETH.withdraw`
    receive() external payable {}
}
