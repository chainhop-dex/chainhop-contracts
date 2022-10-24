// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.15;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./lib/Types.sol";
import "./lib/MessageSenderLib.sol";
import "./lib/MessageReceiverApp.sol";
import "./lib/Pauser.sol";
import "./BridgeRegistry.sol";
import "./FeeOperator.sol";
import "./SigVerifier.sol";
import "./Swapper.sol";
import "./Pocket.sol";
import "./interfaces/IBridgeAdapter.sol";
import "./interfaces/ICodec.sol";

/**
 * @author Chainhop Dex Team
 * @author Padoriku
 * @title An app that enables swapping on a chain, transferring to another chain and swapping
 * another time on the destination chain before sending the result tokens to a user
 */
contract TransferSwapper is
    MessageReceiverApp,
    Swapper,
    SigVerifier,
    FeeOperator,
    ReentrancyGuard,
    BridgeRegistry,
    Pauser
{
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    bytes32 public immutable CBRIDGE_PROVIDER_HASH;

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
        CBRIDGE_PROVIDER_HASH = keccak256(bytes("cbridge"));
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
     * @param bridgeResp arbitrary response data returned by bridge
     * @param dstChainId destination chain id
     * @param srcAmount input amount approved by the sender
     * @param srcToken the input token approved by the sender
     * @param dstToken the final output token (after bridging and swapping) desired by the sender
     * @param bridgeOutReceiver the receiver (user or dst TransferSwapper) of the bridge token
     * @param bridgeToken the token used for bridging
     * @param bridgeAmount the amount of the bridgeToken to bridge
     * @param bridgeProvider the bridge provider
     */
    event RequestSent(
        bytes32 id,
        bytes bridgeResp,
        uint64 dstChainId,
        uint256 srcAmount,
        address srcToken,
        address dstToken,
        address bridgeOutReceiver,
        address bridgeToken,
        uint256 bridgeAmount,
        string bridgeProvider
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
        Types.RequestStatus status,
        bytes forwardResp
    );

    /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
     * Source chain functions
     * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

    /**
     * @notice swaps if needed, then transfer the token to another chain along with an instruction on how to swap
     * on that chain
     */
    function transferWithSwap(
        Types.TransferDescription calldata _desc,
        ICodec.SwapDescription calldata _srcSwap,
        ICodec.SwapDescription calldata _dstSwap
    ) external payable nonReentrant whenNotPaused {
        // a request needs to incur a swap, a transfer, or both. otherwise it's a nop and we revert early to save gas
        require(_srcSwap.dex != address(0) || _desc.dstChainId != uint64(block.chainid), "nop");
        require(_srcSwap.dex != address(0) || (_desc.amountIn != 0 && _desc.tokenIn != address(0)), "nop");

        IBridgeAdapter bridge = bridges[keccak256(bytes(_desc.bridgeProvider))];
        // if not DirectSwap, the bridge provider should be a valid one
        require(_desc.dstChainId == uint64(block.chainid) || address(bridge) != address(0), "unsupported bridge");

        _pullFund(_desc.tokenIn, _desc.amountIn, _desc.nativeIn);

        uint256 nextAmountIn = _desc.amountIn;
        address nextTokenIn = _desc.tokenIn;
        if (_srcSwap.dex != address(0)) {
            bool success;
            (success, nextAmountIn, nextTokenIn) = executeSwap(_srcSwap, _desc.amountIn, _desc.tokenIn);
            require(success, "swap fail");
        }
        bytes32 id = _computeId(_desc.receiver, _desc.nonce);
        // directly send the fund to receiver if there are no more steps
        if (_desc.dstChainId == uint64(block.chainid)) {
            emit DirectSwap(id, _desc.amountIn, _desc.tokenIn, nextAmountIn, nextTokenIn);
            _sendToken(nextTokenIn, nextAmountIn, _desc.receiver, _desc.nativeOut);
            return;
        }
        _transfer(id, nextTokenIn, nextAmountIn, _desc, _dstSwap);
    }

    function _transfer(
        bytes32 _id,
        address _bridgeTokenIn,
        uint256 _bridgeAmountIn,
        Types.TransferDescription memory _desc,
        ICodec.SwapDescription memory _dstSwap
    ) private {
        // fund is directly to user if there is no swaps needed on the destination chain. otherwise, it's sent
        // to a "pocket" contract addr to temporarily hold the fund before it is used for swapping.
        address bridgeOutReceiver = (_dstSwap.length > 0 || _desc.forward.length > 0) ? _desc.pocket : _desc.receiver;
        require(bridgeOutReceiver != address(0), "receiver is 0");

        uint256 refundMsgFee = 0;
        bytes memory bridgeResp;

        // send funds through the bridge of choice
        {
            _verifyFee(_desc, _desc.amountIn, _desc.tokenIn);
            bytes32 bridgeHash = keccak256(bytes(_desc.bridgeProvider));
            IBridgeAdapter bridge = bridges[bridgeHash];
            if (bridgeHash == CBRIDGE_PROVIDER_HASH) {
                refundMsgFee = IMessageBus(messageBus).calcFee(abi.encode(bridge));
            }
            IERC20(_bridgeTokenIn).safeIncreaseAllowance(address(bridge), _bridgeAmountIn);
            bridgeResp = bridge.bridge{value: refundMsgFee}(
                _desc.dstChainId,
                bridgeOutReceiver,
                _bridgeAmountIn,
                _bridgeTokenIn,
                _desc.bridgeParams
            );
        }

        // send a message separately containing the swap instruction
        {
            uint256 msgFee = msg.value - refundMsgFee;
            if (_desc.nativeIn) {
                msgFee = msg.value - refundMsgFee - _desc.amountIn;
            }
            bytes memory req = _encodeRequestMessage(_id, _desc, _dstSwap);
            MessageSenderLib.sendMessage(_desc.dstTransferSwapper, _desc.dstChainId, req, messageBus, msgFee);
        }

        _emitRequestSent(_id, bridgeResp, _desc, bridgeOutReceiver, _bridgeTokenIn, _bridgeAmountIn);
    }

    /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
     * Destination chain functions
     * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

    function executeMessage(
        address, // _sender
        uint64, // _srcChainId
        bytes memory _message,
        address _executor
    ) external payable override onlyMessageBus nonReentrant returns (ExecutionStatus) {
        Types.Request req = abi.decode((_message), (Types.Request));
        uint256 erc20Amount = IERC20(req.bridgeOutToken).balanceOf(req.pocket);
        uint256 nativeAmount = address(req.pocket).balance;
        // if the pocket is empty, it means the transfer has not arrived yet. in this case we tell
        // the msgbus to revert the outter tx using the MSGBUS::REVERT opcode so that our executor
        // will retry sending this tx later.
        require(erc20Amount > 0 || nativeAmount > 0, "MSGBUS::REVERT");

        // fetch fund from the pocket
        new Pocket{salt: req.id}(req.bridgeOutToken);

        if (erc20Amount > 0) {
            IERC20(req.bridgeOutToken).safeTransferFrom(req.pocket, address(this), erc20Amount);
            uint256 amount = _deductFee(req, erc20Amount);
            if (amount == 0) return ExecutionStatus.Success;

            (bool ok, uint256 amountOut, address tokenOut) = executeSwap(req.swap, amount, req.bridgeOutToken);
            if (!ok) {
                _sendRefund(req, erc20Amount);
                return ExecutionStatus.Success;
            }
        }

        if (nativeAmount > 0) {
            uint256 amount = _deductFee(req, nativeAmount);
            if (amount == 0) return ExecutionStatus.Success;

            IWETH(req.bridgeOutToken).deposit{value: amount}();
            (bool ok, uint256 amountOut, address tokenOut) = executeSwap(req.swap, amount, req.bridgeOutToken);
            if (!ok) {
                _sendRefund(req, amount);
                return ExecutionStatus.Success;
            }
        }
    }

    function _deductFee(Types.Request _req, uint256 _amount) private returns (uint256 amount) {
        // handle the case where amount received is not enough to pay fee
        if (_amount < _req.fee) {
            emit RequestDone(_req.id, 0, 0, _req.bridgeOutToken, _amount, Types.RequestStatus.Succeeded, bytes(""));
        } else {
            amount = _amount - _req.fee;
        }
    }

    function _sendRefund(Types.Request _req, uint256 _amount) private {
        IERC20(_req.bridgeOutToken).safeTransfer(_req.receiver, _amount);
        emit RequestDone(_req.id, 0, _amount, _req.bridgeOutToken, _req.fee, Types.RequestStatus.Fallback, bytes(""));
    }

    event PocketFundClaimed(address receiver, uint256 erc20Amount, address token, uint256 nativeAmount);

    // the system depends on whether the pocket has a balance to determine if the bridge has sent funds. since the
    // counterfactual contract's address is public, a malicious user can deposit a tiny fund to the address before the
    // bridge does so. when the request message is executed, the victim would only receive the tiny fund.
    // to circumvent this issue, the receiver of a swap is entitled to all the funds in the pocket. as long as someone
    // can prove that they are the receiver of a swap, they can always recreate the pocket contract and claim the
    // bridge out token as refund.
    function claimPocketFund(
        address _srcSender,
        uint64 _srcChainId,
        uint64 _nonce,
        address _pocket,
        address _token
    ) external {
        // only the designated receiver of a swap can claim funds from the designated pocket of a swap
        address receiver = msg.sender;
        bytes32 swapId = keccak256(abi.encodePacked(_srcSender, msg.sender, _srcChainId, _nonce));
        require(receiver != 0, "no receiver found");
        uint256 erc20Amount = IERC20(_token).balanceOf(_pocket);
        uint256 nativeAmount = address(_pocket).balance;
        require(erc20Amount > 0 || nativeAmount > 0, "pocket is empty");
        new Pocket{salt: swapId}(_token);
        if (erc20Amount > 0) {
            IERC20(_token).safeTransfer(receiver, erc20Amount);
        }
        if (nativeAmount > 0) {
            receiver.call{value: nativeAmount, gas: 50000}("");
        }
        emit PocketFundClaimed(receiver, erc20Amount, _token, nativeAmount);
    }

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
        address _executor
    ) external payable override onlyMessageBus nonReentrant returns (ExecutionStatus) {
        if (paused()) {
            return ExecutionStatus.Retry;
        }
        Types.Request memory m = abi.decode((_message), (Types.Request));

        // handle the case where amount received is not enough to pay fee
        if (_amount < m.fee) {
            m.fee = _amount;
            emit RequestDone(m.id, 0, 0, _token, m.fee, Types.RequestStatus.Succeeded, bytes(""));
            return ExecutionStatus.Success;
        } else {
            _amount = _amount - m.fee;
        }

        uint256 sumAmtOut = _amount;
        uint256 sumAmtFailed;
        bytes memory forwardResp;
        {
            // Note if to wrap, the NATIVE used to convert is from the ones sent by upstream in advance, but not part of the `msg.value`
            // `msg.value` here is only used to pay for msg fee
            _wrapBridgeOutToken(_token, _amount);

            address tokenOut = _token;
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

            if (m.forward.length > 0) {
                Types.Forward memory f = abi.decode(m.forward, (Types.Forward));
                IBridgeAdapter cBridge = bridges[CBRIDGE_PROVIDER_HASH];
                require(address(cBridge) != address(0), "cbridge not set");
                IERC20(tokenOut).safeIncreaseAllowance(address(cBridge), sumAmtOut);
                bytes memory requestMessage = _encodeRequestMessage(m.id, m.receiver);
                forwardResp = cBridge.bridge{value: msg.value}(
                    f.dstChain,
                    m.receiver,
                    sumAmtOut,
                    tokenOut,
                    f.params,
                    requestMessage
                );
            } else {
                // msg.value is not used in this code branch, pay back to sender
                if (msg.value > 0) {
                    (bool sent, ) = _executor.call{value: msg.value}("");
                    require(sent, "send fail");
                }
                _sendToken(tokenOut, sumAmtOut, m.receiver, m.nativeOut);
            }
        }
        // status is always success as long as this function call doesn't revert. partial fill is also considered success
        emit RequestDone(m.id, sumAmtOut, sumAmtFailed, _token, m.fee, Types.RequestStatus.Succeeded, forwardResp);
        return ExecutionStatus.Success;
    }

    /**
     * TODO DELETE
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
        if (paused()) {
            return ExecutionStatus.Retry;
        }
        Types.Request memory m = abi.decode((_message), (Types.Request));
        _wrapBridgeOutToken(_token, _amount);
        uint256 refundAmount = _amount - m.fee; // no need to check amount >= fee as it's already checked before
        _sendToken(_token, refundAmount, m.receiver, false);

        emit RequestDone(m.id, 0, refundAmount, _token, m.fee, Types.RequestStatus.Fallback, bytes(""));
        return ExecutionStatus.Success;
    }

    /**
     * @notice Marks the request as done
     * @dev only cbridge adapter can call this function
     * @param _id the id of the swap request
     * @param _token the token refunded to the user
     * @param _amount the amount of token refunded to the user
     */
    function refundCallback(
        bytes32 _id,
        address _token,
        uint256 _amount
    ) external {
        require(address(msg.sender) == address(bridges[CBRIDGE_PROVIDER_HASH]), "only cbridge");
        emit RequestDone(_id, 0, _amount, _token, 0, Types.RequestStatus.Fallback, bytes(""));
    }

    /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
     * Misc
     * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
    function _pullFund(
        address _token,
        uint256 _amount,
        bool _nativeIn
    ) private {
        if (_nativeIn) {
            require(_token == nativeWrap, "tokenIn not nativeWrap");
            require(msg.value >= _amount, "insufficient native amount");
            IWETH(nativeWrap).deposit{value: _amount}();
        } else {
            IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        }
    }

    function _computeId(address _receiver, uint64 _nonce) private view returns (bytes32) {
        return keccak256(abi.encodePacked(msg.sender, _receiver, uint64(block.chainid), _nonce));
    }

    function _encodeRequestMessage(
        bytes32 _id,
        Types.TransferDescription memory _desc,
        ICodec.SwapDescription memory _swaps,
        address _bridgeOutToken,
        uint256 _bridgeOutMin
    ) internal pure returns (bytes memory message) {
        message = abi.encode(
            Types.Request({
                id: _id,
                swaps: _swaps,
                receiver: _desc.receiver,
                bridgeOutToken: _bridgeOutToken,
                nativeOut: _desc.nativeOut,
                fee: _desc.fee,
                bridgeOutMin: _bridgeOutMin,
                forward: _desc.forward
            })
        );
    }

    function _encodeRequestMessage(
        bytes32 _id,
        address _receiver,
        address _bridgeOutToken
    ) internal pure returns (bytes memory message) {
        ICodec.SwapDescription memory emptySwaps;
        bytes memory empty;
        message = abi.encode(
            Types.Request({
                id: _id,
                swaps: emptySwaps,
                receiver: _receiver,
                bridgeOutToken: _bridgeOutToken,
                nativeOut: false,
                fee: 0,
                forward: empty
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
            if (IBridgeCeler(bridge).nativeWrap() == nativeWrap) {
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

    function _emitRequestSent(
        bytes32 _id,
        bytes memory _bridgeResp,
        Types.TransferDescription _desc,
        address _bridgeOutReceiver,
        address _bridgeTokenIn,
        uint256 _bridgeAmountIn
    ) private {
        emit RequestSent(
            _id,
            _bridgeResp,
            _desc.dstChainId,
            _desc.amountIn,
            _desc.tokenIn,
            _desc.dstTokenOut,
            _bridgeOutReceiver,
            _bridgeTokenIn,
            _bridgeAmountIn,
            _desc.bridgeProvider
        );
    }

    function setNativeWrap(address _nativeWrap) external onlyOwner {
        nativeWrap = _nativeWrap;
        emit NativeWrapUpdated(_nativeWrap);
    }

    // This is needed to receive ETH when calling `IWETH.withdraw`
    receive() external payable {}
}
