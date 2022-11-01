// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.15;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import "./lib/Types.sol";
import "./lib/MessageSenderLib.sol";
import "./lib/MessageReceiver.sol";
import "./lib/Pauser.sol";
import "./lib/NativeWrap.sol";
import "./lib/Bytes.sol";

import "./interfaces/IBridgeAdapter.sol";
import "./interfaces/ICodec.sol";
import "./interfaces/IExecutionNodeEvents.sol";
import "./interfaces/IWETH.sol";

import "./BridgeRegistry.sol";
import "./FeeOperator.sol";
import "./SigVerifier.sol";
import "./Pocket.sol";
import "./DexRegistry.sol";

/**
 * @author Chainhop Dex Team
 * @author Padoriku
 * @title a route execution contract
 * @notice
 * a few key concepts about how the chain of execution works:
 * - a "swap-bridge execution combo" (Types.ExecutionInfo) is a node in the execution chain
 * - a node be swap-only, bridge-only, or swap-bridge
 * - a message is an edge in the execution chain, it carries the remaining swap-bridge combos to the next node
 * - execute() executes a swap-bridge combo and determines if the current node is the final one by looking at Types.DestinationInfo
 * - executeMessage() is called on the intermediate nodes by chainhop's executor. it simply calls execute() to advance the execution chain
 * - a "pocket" is a counterfactual contract of which the address is determined at quote-time by chainhop's pathfinder server with using the id as salt
 * the actual pocket contract deployment is done at execution time by the the ExecutionNode on that chain
 * these concepts are there to make bridge-agnostic multi-hop execution possible and to help keep the code sane
 */
contract ExecutionNode is
    IExecutionNodeEvents,
    MessageReceiver,
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
    using Bytes for bytes;

    constructor(
        bool _testMode,
        address _messageBus,
        address _nativeWrap
    ) MessageReceiver(_testMode, _messageBus) NativeWrap(_nativeWrap) {}

    function init(
        bool _testMode,
        address _messageBus,
        address _nativeWrap,
        address _signer,
        address _feeCollector,
        address[] calldata _dexList,
        string[] calldata _funcs,
        address[] calldata _codecs,
        string[] calldata _bridgeProviders,
        address[] calldata _bridgeAdapters
    ) external initializer {
        initMessageReceiver(_testMode, _messageBus);
        initDexRegistry(_dexList, _funcs, _codecs);
        initBridgeRegistry(_bridgeProviders, _bridgeAdapters);
        initSigVerifier(_signer);
        initFeeOperator(_feeCollector);
        initNativeWrap(_nativeWrap);
    }

    /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
     * Core
     * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

    /**
     * @notice executes a swap-bridge combo and relays the next swap-bridge combo to the next chain (if any)
     * @notice nop nodes are allowed. execute() simply sends the output token (wrap/unwrap native if needed) to the receiver
     * @param _id an id that is unique enough per user-swap. persistent for the entire operation. also used as salt for the pocket contract
     * id = keccak256(abi.encodePacked(_dstReceiver, _nonce));
     * @param _execs contains info that tells this contract how to collect a part of the bridge token
     * received as fee and how to swap can be omitted on the source chain if there is no swaps to execute
     * @param _src only required on the source chain and should not be populated on subsequent hops
     * @param _dst the receiving info of the entire operation
     */
    function execute(
        bytes32 _id,
        Types.ExecutionInfo[] memory _execs,
        Types.SourceInfo memory _src,
        Types.DestinationInfo memory _dst
    ) public payable nonReentrant whenNotPaused {
        require(_execs.length > 0, "nop");
        IBridgeAdapter bridge = bridges[keccak256(bytes(_execs[0].bridge.bridgeProvider))];
        // if the current execution is not the destination, the bridge provider must be a valid one
        require(_dst.chainId == _chainId() || address(bridge) != address(0), "unsupported bridge");

        // pull funds
        uint256 amountIn;
        address tokenIn;
        if (_src.chainId == _chainId()) {
            _verify(_execs, _src, _dst);
            (amountIn, tokenIn) = _pullFundFromSender(_src);
        } else {
            (amountIn, tokenIn) = _pullFundFromPocket(_id, _execs[0]);
        }

        // process the current execution
        Types.ExecutionInfo memory exec = _popFirst(_execs);
        uint256 nextAmount = amountIn;
        address nextToken = tokenIn;
        bool execSuccess = true;
        if (exec.swap.dex != address(0)) {
            (execSuccess, nextAmount, nextToken) = _executeSwap(exec.swap, amountIn, tokenIn);
            if (_src.chainId == _chainId()) require(execSuccess, "swap fail");
        }

        // pay receiver if this is the last execution step or if the swap fails on a middle chain
        if (_dst.chainId == _chainId() || !execSuccess) {
            _sendToken(nextToken, nextAmount, _dst.receiver, _dst.nativeOut);
            emit StepExecuted(_id, nextAmount, nextToken);
            return;
        }

        // fund is bridged directly to receiver if there is no swaps needed on the destination chain. otherwise,
        // it's sent to a "pocket" contract addr to temporarily hold the fund before it is used for swapping.
        address bridgeOutReceiver = (_execs.length > 0) ? _getPocketAddr(_id, exec.remoteExecutionNode) : _dst.receiver;
        uint256 refundMsgFee = _bridgeSend(
            exec.bridge.toChainId,
            keccak256(bytes(exec.bridge.bridgeProvider)),
            exec.bridge.bridgeParams,
            bridgeOutReceiver,
            nextToken,
            nextAmount
        );

        // initiate the next hop
        if (_execs.length > 0) {
            bytes memory message = abi.encode(Types.Message({id: _id, execs: _execs, dst: _dst}));
            uint256 msgFee = msg.value - refundMsgFee;
            MessageSenderLib.sendMessage(exec.remoteExecutionNode, exec.bridge.toChainId, message, messageBus, msgFee);
        }

        emit StepExecuted(_id, nextAmount, nextToken);
    }

    /**
     * @notice call by cBridge MessageBus and then simply calls execute() to carry on the executions
     * @param _message the message that contains the remaining swap-bridge combos to be executed
     * @return executionStatus always success if no reverts to let the MessageBus know that the message is processed
     */
    function executeMessage(
        address, // _sender
        uint64, // _srcChainId
        bytes memory _message,
        address // _executor
    ) external payable override onlyMessageBus nonReentrant returns (ExecutionStatus) {
        Types.Message memory message = abi.decode((_message), (Types.Message));
        execute(message.id, message.execs, Types.emptySourceInfo(), message.dst);
        return ExecutionStatus.Success;
    }

    // the receiver of a swap is entitled to all the funds in the pocket. as long as someone can prove
    // that they are the receiver of a swap, they can always recreate the pocket contract and claim the
    // funds inside.
    function claimPocketFund(
        address _receiver,
        uint64 _nonce,
        address _token
    ) external {
        // id ensures that only the designated receiver of a swap can claim funds from the designated pocket of a swap
        bytes32 id = _computeId(_receiver, _nonce);

        Pocket pocket = new Pocket{salt: id}();
        uint256 erc20Amount = IERC20(_token).balanceOf(address(pocket));
        uint256 nativeAmount = address(pocket).balance;
        require(erc20Amount > 0 || nativeAmount > 0, "pocket is empty");

        // this claims both _token and native
        pocket.claim(_token, erc20Amount);

        if (erc20Amount > 0) {
            IERC20(_token).safeTransfer(_receiver, erc20Amount);
        }
        if (nativeAmount > 0) {
            (bool ok, ) = _receiver.call{value: nativeAmount, gas: 50000}("");
            require(ok, "failed to send native");
        }
        emit PocketFundClaimed(_receiver, erc20Amount, _token, nativeAmount);
    }

    /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
     * Misc
     * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
    function _computeId(address _dstReceiver, uint64 _nonce) private pure returns (bytes32) {
        // the main purpose of this id is to uniquely identify a receiver on a per-swap basis.
        return keccak256(abi.encodePacked(_dstReceiver, _nonce));
    }

    function _pullFundFromSender(Types.SourceInfo memory _src) private returns (uint256 amount, address token) {
        if (_src.nativeIn) {
            require(_src.tokenIn == nativeWrap, "tokenIn not nativeWrap");
            require(msg.value >= _src.amountIn, "insufficient native amount");
            IWETH(nativeWrap).deposit{value: _src.amountIn}();
        } else {
            IERC20(_src.tokenIn).safeTransferFrom(msg.sender, address(this), _src.amountIn);
        }
        return (_src.amountIn, _src.tokenIn);
    }

    function _pullFundFromPocket(bytes32 _id, Types.ExecutionInfo memory _exec)
        private
        returns (uint256 amount, address token)
    {
        Pocket pocket = new Pocket{salt: _id}();

        uint256 fallbackAmount;
        if (_exec.bridgeOutFallbackToken != address(0)) {
            fallbackAmount = IERC20(_exec.bridgeOutFallbackToken).balanceOf(address(pocket)); // e.g. hToken/anyToken
        }
        uint256 erc20Amount = IERC20(_exec.bridgeOutToken).balanceOf(address(pocket));
        uint256 nativeAmount = address(pocket).balance;

        // if the pocket does not have bridgeOutMin, we consider the transfer not arrived yet. in
        // this case we tell the msgbus to revert the outter tx using the MSGBUS::REVERT opcode so
        // that our executor will retry sending this tx later.
        // this is a counter-measure to a DoS attack vector. an attacker can deposit a small amount
        // of fund into the pocket and confuse this contract that the bridged fund has arrived,
        // denying the dst swap for the victim. bridgeOutMin is determined by the server before
        // sending out the transfer. bridgeOutMin = R * bridgeAmountIn where R is an arbitrary ratio
        // that we feel effective in raising the attacker's attack cost.
        // note that in case the bridging actually has a huge slippage, the user can always call
        // claimPocketFund to collect the bridge out tokens as a refund.
        require(
            erc20Amount > _exec.bridgeOutMin ||
                nativeAmount > _exec.bridgeOutMin ||
                fallbackAmount > _exec.bridgeOutFallbackMin,
            "MSGBUS::REVERT"
        );
        if (fallbackAmount > 0) {
            pocket.claim(_exec.bridgeOutFallbackToken, fallbackAmount);
            amount = _deductFee(_exec.feeInBridgeOutFallbackToken, fallbackAmount);
            token = _exec.bridgeOutFallbackToken;
        } else {
            pocket.claim(_exec.bridgeOutToken, erc20Amount);
            if (erc20Amount > 0) {
                amount = _deductFee(_exec.feeInBridgeOutToken, erc20Amount);
            } else if (nativeAmount > 0) {
                require(_exec.bridgeOutToken == nativeWrap, "bridgeOutToken not nativeWrap");
                amount = _deductFee(_exec.feeInBridgeOutToken, nativeAmount);
                IWETH(_exec.bridgeOutToken).deposit{value: amount}();
            }
        }
    }

    function _getPocketAddr(bytes32 _salt, address _deployer) private pure returns (address) {
        bytes32 hash = keccak256(
            abi.encodePacked(bytes1(0xff), _deployer, _salt, keccak256(type(Pocket).creationCode))
        );
        return address(uint160(uint256(hash)));
    }

    function _deductFee(uint256 _fee, uint256 _amount) private pure returns (uint256 amount) {
        // handle the case where amount received is not enough to pay fee
        if (_amount >= _fee) {
            amount = _amount - _fee;
        }
    }

    function _bridgeSend(
        uint64 _dstChainId,
        bytes32 _bridgeProvider,
        bytes memory _bridgeParams,
        address _receiver,
        address _token,
        uint256 _amount
    ) private returns (uint256 refundMsgFee) {
        IBridgeAdapter bridge = bridges[_bridgeProvider];
        if (_bridgeProvider == CBRIDGE_PROVIDER_HASH) {
            // special handling for dealing with cbridge's refund mechnism: cbridge adapter always
            // sends a message that contains only the receiver addr along with the transfer. this way
            // when refund happens we can execute the executeMessageWithTransferRefund function in
            // cbridge adapter to refund to the receiver
            refundMsgFee = IMessageBus(messageBus).calcFee(abi.encode(_receiver));
        }
        IERC20(_token).safeIncreaseAllowance(address(bridge), _amount);
        bridge.bridge{value: refundMsgFee}(_dstChainId, _receiver, _amount, _token, _bridgeParams);
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

    function _popFirst(Types.ExecutionInfo[] memory _execs) private pure returns (Types.ExecutionInfo memory exec) {
        exec = _execs[0];
        for (uint256 i = 0; i < _execs.length - 1; i++) {
            _execs[i] = _execs[i + 1];
        }
        delete _execs[_execs.length - 1];
    }

    function _verify(
        Types.ExecutionInfo[] memory _execs,
        Types.SourceInfo memory _src,
        Types.DestinationInfo memory _dst
    ) private view {
        if (_execs.length == 1) {
            // no chainhop delegated executions, no need to verify sig
            return;
        }
        require(_src.deadline > block.timestamp, "deadline exceeded");
        bytes memory data = abi.encodePacked(
            "chainhop quote",
            uint64(block.chainid),
            _dst.chainId,
            _src.amountIn,
            _src.tokenIn,
            _src.deadline
        );
        for (uint256 i = 1; i < _execs.length; i++) {
            Types.ExecutionInfo memory e = _execs[i];
            data = data.concat(
                abi.encodePacked(
                    e.chainId,
                    e.feeInBridgeOutToken,
                    e.bridgeOutToken,
                    e.feeInBridgeOutFallbackToken,
                    e.bridgeOutFallbackToken
                )
            );
        }
        bytes32 signHash = keccak256(data).toEthSignedMessageHash();
        verifySig(signHash, _src.quoteSig);
    }

    function _chainId() private view returns (uint64) {
        return uint64(block.chainid);
    }

    function executeMessageWithTransferRefund(
        address _token,
        uint256 _amount,
        bytes calldata _message
    ) external payable override returns (bool) {}
}
