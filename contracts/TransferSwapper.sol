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
        bytes32 id = _computeId(_desc);
        // directly send the fund to receiver if there are no more steps
        if (_desc.dstChainId == uint64(block.chainid)) {
            _sendToken(nextTokenIn, nextAmountIn, _desc.receiver, _desc.nativeOut);
            _emitSrcExecuted(_desc, id, nextAmountIn, nextTokenIn, "", address(0), bytes(""));
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
        // fund is directly sent to user if there is no swaps needed on the destination chain. otherwise,
        // it's sent to a "pocket" contract addr to temporarily hold the fund before it is used for swapping.
        address bridgeOutReceiver = (_dstSwap.dex != address(0))
            ? _getPocketAddr(_id, _desc.dstTransferSwapper)
            : _desc.receiver;
        require(bridgeOutReceiver != address(0), "receiver is 0");

        uint256 refundMsgFee = 0;
        bytes memory bridgeResp;

        // send funds through the bridge of choice
        bytes32 bridgeHash = keccak256(bytes(_desc.bridgeProvider));
        IBridgeAdapter bridge = bridges[bridgeHash];
        if (bridgeHash == CBRIDGE_PROVIDER_HASH) {
            // special handling for dealing with cbridge's refund mechnism: cbridge adapter always
            // sends a message that contains only the receiver addr along with the transfer. this way
            // when refund happens we can execute the executeMessageWithTransferRefund function in
            // cbridge adapter to refund to the receiver
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

        // send a message separately containing the swap instruction
        if (_dstSwap.dex != address(0)) {
            _verifySig(_desc);
            uint256 msgFee = msg.value - refundMsgFee;
            if (_desc.nativeIn) {
                msgFee = msg.value - refundMsgFee - _desc.amountIn;
            }
            bytes memory req = _encodeRequestMessage(_id, _desc, _dstSwap);
            MessageSenderLib.sendMessage(_desc.dstTransferSwapper, _desc.dstChainId, req, messageBus, msgFee);
        }

        _emitSrcExecuted(
            _desc,
            _id,
            _bridgeAmountIn,
            _bridgeTokenIn,
            _desc.bridgeProvider,
            bridgeOutReceiver,
            bridgeResp
        );
    }

    function _getPocketAddr(bytes32 _salt, address _deployer) private pure returns (address) {
        bytes32 hash = keccak256(
            abi.encodePacked(bytes1(0xff), _deployer, _salt, keccak256(type(Pocket).creationCode))
        );
        return address(uint160(uint256(hash)));
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

        Pocket pocket = new Pocket{salt: req.id}();

        uint256 fallbackAmount;
        if (req.bridgeOutFallbackToken != address(0)) {
            fallbackAmount = IERC20(req.bridgeOutFallbackToken).balanceOf(address(pocket)); // e.g. hToken/anyToken
        }
        uint256 erc20Amount = IERC20(req.bridgeOutToken).balanceOf(address(pocket));
        uint256 nativeAmount = address(pocket).balance;

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
            pocket.claim(req.bridgeOutFallbackToken, fallbackAmount);

            (uint256 amount, uint256 realizedFee) = _deductFee(req.feeInBridgeOutFallbackToken, fallbackAmount);
            if (amount > 0) {
                IERC20(req.bridgeOutFallbackToken).safeTransfer(req.receiver, amount);
            }
            emit DstExecuted(
                req.id,
                0,
                amount,
                req.bridgeOutFallbackToken,
                realizedFee,
                Types.RequestStatus.Fallback,
                bytes("")
            );
        } else {
            pocket.claim(req.bridgeOutToken, erc20Amount);

            uint256 realizedFee;
            uint256 sentAmount;
            uint256 refundAmount;
            address tokenOut = req.bridgeOutToken;
            Types.RequestStatus status = Types.RequestStatus.Fallback;

            if (erc20Amount > 0) {
                uint256 amount;
                (amount, realizedFee) = _deductFee(req.feeInBridgeOutToken, erc20Amount);
                if (amount > 0) {
                    (sentAmount, refundAmount, tokenOut, status) = _swapAndSend(req, amount);
                }
            } else if (nativeAmount > 0) {
                require(req.bridgeOutToken == nativeWrap, "bridgeOutToken not nativeWrap");
                uint256 amount;
                (amount, realizedFee) = _deductFee(req.feeInBridgeOutToken, nativeAmount);
                if (amount > 0) {
                    IWETH(req.bridgeOutToken).deposit{value: amount}();
                    (sentAmount, refundAmount, tokenOut, status) = _swapAndSend(req, amount);
                }
            }
            emit DstExecuted(req.id, sentAmount, refundAmount, tokenOut, realizedFee, status, bytes(""));
        }
        return ExecutionStatus.Success;
    }

    function _swapAndSend(Types.Request memory _req, uint256 _amountIn)
        private
        returns (
            uint256 sentAmount,
            uint256 refundAmount,
            address token,
            Types.RequestStatus status
        )
    {
        (bool ok, uint256 amountOut, address tokenOut) = _executeSwap(_req.swap, _amountIn, _req.bridgeOutToken);
        if (!ok) {
            // swap failed, send refund
            IERC20(_req.bridgeOutToken).safeTransfer(_req.receiver, _amountIn);
            refundAmount = _amountIn;
            token = _req.bridgeOutToken;
            status = Types.RequestStatus.Fallback;
        } else {
            _sendToken(tokenOut, amountOut, _req.receiver, _req.nativeOut);
            sentAmount = amountOut;
            token = tokenOut;
            status = Types.RequestStatus.Succeeded;
        }
    }

    function _deductFee(uint256 _fee, uint256 _amount) private pure returns (uint256 amount, uint256 fee) {
        // handle the case where amount received is not enough to pay fee
        if (_amount < _fee) {
            fee = _amount;
        } else {
            fee = _fee;
            amount = _amount - _fee;
        }
    }

    // the receiver of a swap is entitled to all the funds in the pocket. as long as someone can prove
    // that they are the receiver of a swap, they can always recreate the pocket contract and claim the
    // funds inside.
    function claimPocketFund(
        address _srcSender,
        uint64 _srcChainId,
        uint64 _nonce,
        address _token
    ) external {
        // only the designated receiver of a swap can claim funds from the designated pocket of a swap
        address receiver = msg.sender;
        bytes32 id = keccak256(abi.encodePacked(_srcSender, msg.sender, _srcChainId, uint64(block.chainid), _nonce));

        Pocket pocket = new Pocket{salt: id}();
        uint256 erc20Amount = IERC20(_token).balanceOf(address(pocket));
        uint256 nativeAmount = address(pocket).balance;
        require(erc20Amount > 0 || nativeAmount > 0, "pocket is empty");

        // this claims both _token and native
        pocket.claim(_token, erc20Amount);

        if (erc20Amount > 0) {
            IERC20(_token).safeTransfer(receiver, erc20Amount);
        }
        if (nativeAmount > 0) {
            (bool ok, ) = receiver.call{value: nativeAmount, gas: 50000}("");
            require(ok, "failed to send native");
        }
        emit PocketFundClaimed(receiver, erc20Amount, _token, nativeAmount);
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

    function _computeId(Types.TransferDescription memory _desc) private view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(msg.sender, _desc.receiver, uint64(block.chainid), _desc.dstChainId, _desc.nonce)
            );
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
        if (_swap.dex == address(0)) {
            // nop swap
            return (true, _amountIn, _tokenIn);
        }
        bytes4 selector = bytes4(_swap.data);
        ICodec codec = getCodec(_swap.dex, selector);
        address tokenIn;
        (, tokenIn, tokenOut) = codec.decodeCalldata(_swap);
        require(tokenIn == _tokenIn, "swap info mismatch");

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
        return (true, amountOut, tokenOut);
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
                nativeOut: _desc.nativeOut,
                bridgeOutToken: _desc.bridgeOutToken,
                bridgeOutFallbackToken: _desc.bridgeOutFallbackToken,
                feeInBridgeOutToken: _desc.feeInBridgeOutToken,
                feeInBridgeOutFallbackToken: _desc.feeInBridgeOutFallbackToken,
                bridgeOutMin: _desc.bridgeOutMin,
                bridgeOutFallbackMin: _desc.bridgeOutFallbackMin
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
            require(_token == nativeWrap, "token is not nativeWrap");
            IWETH(nativeWrap).withdraw(_amount);
            (bool sent, ) = _receiver.call{value: _amount, gas: 50000}("");
            require(sent, "send fail");
        } else {
            IERC20(_token).safeTransfer(_receiver, _amount);
        }
    }

    function _verifySig(Types.TransferDescription memory _desc) private view {
        bytes32 hash = keccak256(
            abi.encodePacked(
                "chainhop quote",
                uint64(block.chainid),
                _desc.dstChainId,
                _desc.amountIn,
                _desc.tokenIn,
                _desc.deadline,
                _desc.feeInBridgeOutToken,
                _desc.feeInBridgeOutFallbackToken
            )
        );
        bytes32 signHash = hash.toEthSignedMessageHash();
        verifySig(signHash, _desc.quoteSig);
        require(_desc.deadline > block.timestamp, "deadline exceeded");
    }

    function _emitSrcExecuted(
        Types.TransferDescription memory _desc,
        bytes32 _id,
        uint256 _srcAmountOut,
        address _srcTokenOut,
        string memory _bridgeProvider,
        address _bridgeOutReceiver,
        bytes memory _bridgeResp
    ) private {
        emit SrcExecuted(
            _id,
            _desc.dstChainId,
            _desc.amountIn,
            _desc.tokenIn,
            _srcAmountOut,
            _srcTokenOut,
            _desc.dstTokenOut,
            _bridgeProvider,
            _bridgeOutReceiver,
            _bridgeResp
        );
    }
}
