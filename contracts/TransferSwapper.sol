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
import "./lib/NativeWrap.sol";

import "./interfaces/IBridgeAdapter.sol";
import "./interfaces/ICodec.sol";
import "./interfaces/ITransferSwapperEvents.sol";
import "./interfaces/IWETH.sol";

import "./BridgeRegistry.sol";
import "./FeeOperator.sol";
import "./SigVerifier.sol";
import "./Pocket.sol";
import "./DexRegistry.sol";

/**
 * @author Chainhop Dex Team
 * @author Padoriku
 * @title An app that enables swapping on a chain, transferring to another chain and swapping
 * another time on the destination chain before sending the result tokens to a user
 */
contract TransferSwapper is
    ITransferSwapperEvents,
    MessageReceiverApp,
    DexRegistry,
    BridgeRegistry,
    SigVerifier,
    FeeOperator,
    NativeWrap,
    ReentrancyGuard,
    Pauser
{
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    bytes32 public immutable CBRIDGE_PROVIDER_HASH;

    constructor(
        address _messageBus,
        address _nativeWrap,
        address _signer,
        address _feeCollector,
        bool _testMode
    )
        MessageReceiverApp(_testMode, _messageBus)
        SigVerifier(_signer)
        FeeOperator(_feeCollector)
        NativeWrap(_nativeWrap)
    {
        messageBus = _messageBus;
        nativeWrap = _nativeWrap;
        CBRIDGE_PROVIDER_HASH = keccak256(bytes("cbridge"));
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
            (success, nextAmountIn, nextTokenIn) = _executeSwap(_srcSwap, _desc.amountIn, _desc.tokenIn);
            require(success, "swap fail");
        }
        bytes32 id = _computeId(_desc.receiver, _desc.nonce);
        // directly send the fund to receiver if there are no more steps
        if (_desc.dstChainId == uint64(block.chainid)) {
            _sendToken(nextTokenIn, nextAmountIn, _desc.receiver, _desc.nativeOut);
            emit DirectSwap(id, _desc.amountIn, _desc.tokenIn, nextAmountIn, nextTokenIn);
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
        address bridgeOutReceiver = (_dstSwap.dex != address(0) || _desc.forward.length > 0)
            ? _desc.pocket
            : _desc.receiver;
        require(bridgeOutReceiver != address(0), "receiver is 0");

        uint256 refundMsgFee = 0;
        bytes memory bridgeResp;

        // send funds through the bridge of choice
        {
            _verifyFee(_desc, _desc.amountIn, _desc.tokenIn);
            bytes32 bridgeHash = keccak256(bytes(_desc.bridgeProvider));
            IBridgeAdapter bridge = bridges[bridgeHash];
            if (bridgeHash == CBRIDGE_PROVIDER_HASH) {
                // special handling for dealing with cbridge's refund mechnism: always send a message
                // that contains only the receiver addr along with the transfer. this way when refund
                // happens we can execute the executeMessageWithTransferRefund function in cbridge
                // adapter to refund to the receiver
                refundMsgFee = IMessageBus(messageBus).calcFee(abi.encode(_desc.receiver));
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
        address // _executor
    ) external payable override onlyMessageBus nonReentrant returns (ExecutionStatus) {
        Types.Request memory req = abi.decode((_message), (Types.Request));

        uint256 fallbackAmount = IERC20(req.bridgeOutFallbackToken).balanceOf(req.pocket); // e.g. hToken/anyToken
        uint256 erc20Amount = IERC20(req.bridgeOutToken).balanceOf(req.pocket);
        uint256 nativeAmount = address(req.pocket).balance;

        // if the pocket does not have bridgeOutMin, we consider the transfer not arrived yet. in
        // this case we tell the msgbus to revert the outter tx using the MSGBUS::REVERT opcode so
        // that our executor will retry sending this tx later.
        // this is a counter-measure to a DoS attack vector. an attacker can deposit a small amount
        // of fund into the pocket and confuse this contract that the bridged fund has arrived,
        // denying the dst swap for the victim. bridgeOutMin is determined by the server before
        // sending out the transfer. bridgeOutMin = R * bridgeAmountIn where R is an arbitrary ratio
        // that we feel effective in raising the attacker's attack cost.
        // note that in cases where the bridging actually has a huge slippage, the user can always call
        // claimPocketFund to collect the bridge out tokens as a refund.
        require(
            erc20Amount > req.bridgeOutMin ||
                nativeAmount > req.bridgeOutMin ||
                fallbackAmount > req.bridgeOutFallbackMin,
            "MSGBUS::REVERT"
        );

        if (fallbackAmount > 0) {
            _claimPocketFund(req.bridgeOutFallbackToken, req.id);
            IERC20(req.bridgeOutToken).safeTransferFrom(req.pocket, address(this), fallbackAmount);
            (uint256 amount, uint256 realizedFee) = _deductFee(req, req.feeInBridgeOutFallbackToken, fallbackAmount);
            if (amount == 0) return ExecutionStatus.Success;
            IERC20(req.bridgeOutFallbackToken).safeTransfer(req.receiver, fallbackAmount);
            emit RequestDone(
                req.id,
                0,
                fallbackAmount,
                req.bridgeOutFallbackToken,
                realizedFee,
                Types.RequestStatus.Fallback,
                bytes("")
            );
        } else if (erc20Amount > 0) {
            _claimPocketFund(req.bridgeOutToken, req.id);
            IERC20(req.bridgeOutToken).safeTransferFrom(req.pocket, address(this), erc20Amount);
            (uint256 amount, uint256 realizedFee) = _deductFee(req, req.feeInBridgeOutToken, erc20Amount);
            if (amount == 0) return ExecutionStatus.Success;
            _swapAndSend(req, amount, realizedFee);
        } else if (nativeAmount > 0) {
            _claimPocketFund(req.bridgeOutToken, req.id);
            require(req.bridgeOutToken == nativeWrap, "bridgeOutToken not nativeWrap");
            (uint256 amount, uint256 realizedFee) = _deductFee(req, req.feeInBridgeOutToken, nativeAmount);
            if (amount == 0) return ExecutionStatus.Success;
            IWETH(req.bridgeOutToken).deposit{value: amount}();
            _swapAndSend(req, amount, realizedFee);
        }

        return ExecutionStatus.Success;
    }

    function _swapAndSend(
        Types.Request memory _req,
        uint256 _amountIn,
        uint256 _realizedFee
    ) private returns (uint256 sentAmount, uint256 refundAmount) {
        (bool ok, uint256 amountOut, address tokenOut) = _executeSwap(_req.swap, _amountIn, _req.bridgeOutToken);
        // RequestStatus status
        if (!ok) {
            _sendRefund(_req, _amountIn);
            refundAmount = _amountIn;
        } else {
            _sendToken(tokenOut, amountOut, _req.receiver, _req.nativeOut);
            sentAmount = amountOut;
        }
        emit RequestDone(
            _req.id,
            sentAmount,
            refundAmount,
            _req.bridgeOutToken,
            _realizedFee,
            Types.RequestStatus.Succeeded,
            bytes("")
        );
    }

    function _deductFee(
        Types.Request memory _req,
        uint256 _fee,
        uint256 _amount
    ) private returns (uint256 amount, uint256 fee) {
        // handle the case where amount received is not enough to pay fee
        if (_amount < _fee) {
            fee = _amount;
            emit RequestDone(_req.id, 0, 0, _req.bridgeOutToken, _amount, Types.RequestStatus.Succeeded, bytes(""));
        } else {
            fee = _fee;
            amount = _amount - _fee;
        }
    }

    function _sendRefund(Types.Request memory _req, uint256 _amount) private {
        IERC20(_req.bridgeOutToken).safeTransfer(_req.receiver, _amount);
        emit RequestDone(
            _req.id,
            0,
            _amount,
            _req.bridgeOutToken,
            _req.feeInBridgeOutToken,
            Types.RequestStatus.Fallback,
            bytes("")
        );
    }

    // the receiver of a swap is entitled to all the funds in the pocket. as long as someone can prove
    // that they are the receiver of a swap, they can always recreate the pocket contract and claim the
    // funds inside.
    function claimPocketFund(
        address _srcSender,
        uint64 _srcChainId,
        uint64 _nonce,
        address _pocket,
        address _token
    ) external {
        // only the designated receiver of a swap can claim funds from the designated pocket of a swap
        address receiver = msg.sender;
        bytes32 id = keccak256(abi.encodePacked(_srcSender, msg.sender, _srcChainId, _nonce));

        uint256 erc20Amount = IERC20(_token).balanceOf(_pocket);
        uint256 nativeAmount = address(_pocket).balance;
        require(erc20Amount > 0 || nativeAmount > 0, "pocket is empty");

        _claimPocketFund(_token, id);

        if (erc20Amount > 0) {
            IERC20(_token).safeTransfer(receiver, erc20Amount);
        }
        if (nativeAmount > 0) {
            (bool ok, ) = receiver.call{value: nativeAmount, gas: 50000}("");
            require(ok, "failed to send native");
        }
        emit PocketFundClaimed(receiver, erc20Amount, _token, nativeAmount);
    }

    function _claimPocketFund(address _token, bytes32 _id) private {
        // fetch fund from the pocket
        Pocket pocket = new Pocket{salt: _id}();
        // this claims both _token and native
        pocket.claim(_token);
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

    function _executeSwap(
        ICodec.SwapDescription memory _swap,
        uint256 _amountIn,
        address _tokenIn
    )
        private
        returns (
            bool ok,
            uint256 amountOut,
            address tokenOut
        )
    {
        bytes4 selector = bytes4(_swap.data);
        ICodec codec = getCodec(_swap.dex, selector);
        uint256 amountIn;
        address tokenIn;
        (amountIn, tokenIn, tokenOut) = codec.decodeCalldata(_swap);
        require(amountIn == _amountIn && tokenIn == _tokenIn, "swap info mismatch");

        bytes memory data = codec.encodeCalldataWithOverride(_swap.data, _amountIn, address(this));
        IERC20(tokenIn).safeIncreaseAllowance(_swap.dex, _amountIn);
        uint256 balBefore = IERC20(tokenOut).balanceOf(address(this));
        (bool success, ) = _swap.dex.call(data);
        if (!success) {
            return (false, 0, tokenOut);
        }
        uint256 balAfter = IERC20(tokenOut).balanceOf(address(this));

        amountOut = balAfter - balBefore;
        if (amountOut < _swap.amountOutMin) {
            return (false, 0, tokenOut);
        }
    }

    function _encodeRequestMessage(
        bytes32 _id,
        Types.TransferDescription memory _desc,
        ICodec.SwapDescription memory _swap
    ) internal pure returns (bytes memory message) {
        message = abi.encode(
            Types.Request({
                id: _id,
                swap: _swap,
                receiver: _desc.receiver,
                pocket: _desc.pocket,
                nativeOut: _desc.nativeOut,
                bridgeOutToken: _desc.bridgeOutToken,
                bridgeOutFallbackToken: _desc.bridgeOutFallbackToken,
                feeInBridgeOutToken: _desc.feeInBridgeOutToken,
                feeInBridgeOutFallbackToken: _desc.feeInBridgeOutFallbackToken,
                bridgeOutMin: _desc.bridgeOutMin,
                bridgeOutFallbackMin: _desc.bridgeOutFallbackMin,
                forward: _desc.forward
            })
        );
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
                _desc.feeInBridgeOutToken,
                _desc.feeInBridgeOutFallbackToken
            )
        );
        bytes32 signHash = hash.toEthSignedMessageHash();
        verifySig(signHash, _desc.feeSig);
        require(_desc.feeDeadline > block.timestamp, "deadline exceeded");
    }

    function _emitRequestSent(
        bytes32 _id,
        bytes memory _bridgeResp,
        Types.TransferDescription memory _desc,
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
}
