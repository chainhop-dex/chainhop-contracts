// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.15;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import "./lib/Types.sol";
import "./lib/MessageReceiver.sol";
import "./lib/Pauser.sol";
import "./lib/NativeWrap.sol";
import "./lib/Bytes.sol";

import "./interfaces/IBridgeAdapter.sol";
import "./interfaces/ICodec.sol";
import "./interfaces/IExecutionNodeEvents.sol";
import "./interfaces/IWETH.sol";
import "./interfaces/IMessageBus.sol";

import "./registries/BridgeRegistry.sol";
import "./registries/DexRegistry.sol";
import "./registries/RemoteExecutionNodeRegistry.sol";
import "./registries/FeeVaultRegistry.sol";
import "./SigVerifier.sol";
import "./Pocket.sol";

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
 * - a "pocket" is a counterfactual contract of which the address is determined at quote-time by chainhop's pathfinder server with using
 * the id as salt. the actual pocket contract deployment is done at execution time by the the ExecutionNode on that chain
 */
contract ExecutionNode is
    IExecutionNodeEvents,
    MessageReceiver,
    DexRegistry,
    BridgeRegistry,
    SigVerifier,
    FeeVaultRegistry,
    NativeWrap,
    ReentrancyGuard,
    Pauser,
    RemoteExecutionNodeRegistry
{
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using Bytes for bytes;

    constructor(
        bool _testMode,
        address _messageBus,
        address _nativeWrap
    ) MessageReceiver(_testMode, _messageBus) NativeWrap(_nativeWrap) {}

    // init() can only be called once during the first deployment of the proxy contract.
    // any subsequent changes to the proxy contract's state must be done through their respective set methods via owner key.
    function init(
        bool _testMode,
        address _messageBus,
        address _nativeWrap,
        address _signer,
        address _feeVault,
        address[] memory _dexList,
        string[] memory _funcs,
        address[] memory _codecs,
        string[] memory _bridgeProviders,
        address[] memory _bridgeAdapters,
        uint64[] memory _remoteChainIds,
        address[] memory _remotes
    ) external initializer {
        initOwner();
        initMessageReceiver(_testMode, _messageBus);
        initDexRegistry(_dexList, _funcs, _codecs);
        initBridgeRegistry(_bridgeProviders, _bridgeAdapters);
        initFeeVaultRegistry(_feeVault);
        initSigVerifier(_signer);
        initNativeWrap(_nativeWrap);
        initRemotes(_remoteChainIds, _remotes);
    }

    /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
     * Core
     * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

    /**
     * @notice executes a swap-bridge combo and relays the next swap-bridge combo to the next chain (if any)
     * @param _execs contains info that tells this contract how to collect a part of the bridge token
     * received as fee and how to swap can be omitted on the source chain if there is no swaps to execute
     * @param _src info that is processed on the source chain. only required on the source chain and should not be populated on subsequent hops
     * @param _dst the receiving info of the entire operation
     */
    function execute(
        uint64 _remoteCallerChainId,
        address _remoteCaller,
        Types.ExecutionInfo[] memory _execs,
        Types.SourceInfo memory _src,
        Types.DestinationInfo memory _dst
    ) public payable nonReentrant whenNotPaused returns (uint256 remainingValue) {
        require(_execs.length > 0, "nop");
        bytes32 id = _computeId(_dst.receiver, _dst.nonce);
        remainingValue = msg.value;

        Types.ExecutionInfo memory exec = _execs[0];

        // pull funds
        uint256 amountIn;
        address tokenIn;
        if (_src.chainId == _chainId()) {
            // if there are more executions on other chains, verify sig so that we are sure the fees
            // to be collected will not be tempered with when we run those executions
            // note that quote sig verification is only done on the src chain. the security of each
            // subsequent execution's fee collection is dependant on the security of cbridge's IM
            if (_execs.length > 0) {
                _verify(_execs, _src, _dst);
            }
            (amountIn, tokenIn) = _pullFundFromSender(_src);
            if (_src.nativeIn) {
                remainingValue -= amountIn;
            }
        } else {
            // execution is not on the src chain. the following two checks ensures that no remote
            // contracts that are not an ExecutionNode can call this contract
            requireMessageBus();
            requireRemoteExecutionNode(_remoteCallerChainId, _remoteCaller);
            (amountIn, tokenIn) = _pullFundFromPocket(id, exec);
            // if amountIn is 0 after deducting fee, this contract keeps all amountIn as fee and
            // ends the execution
            if (amountIn == 0) {
                emit StepExecuted(id, 0, tokenIn);
                return remainingValue;
            }
            // refund immediately if receives bridge out fallback token
            if (tokenIn == exec.bridgeOutFallbackToken) {
                _sendToken(tokenIn, amountIn, _dst.receiver, false);
                emit StepExecuted(id, amountIn, tokenIn);
                return remainingValue;
            }
        }

        _execs = _removeFirst(_execs);

        // process swap if any
        uint256 nextAmount = amountIn;
        address nextToken = tokenIn;
        if (exec.swap.dex != address(0)) {
            bool success = true;
            (success, nextAmount, nextToken) = _executeSwap(exec.swap, amountIn, tokenIn);
            if (_src.chainId == _chainId()) require(success, "swap fail");
            // refund immediately if swap fails
            if (!success) {
                _sendToken(tokenIn, amountIn, _dst.receiver, false);
                emit StepExecuted(id, amountIn, tokenIn);
                return remainingValue;
            }
        }

        // pay receiver if there is no more swaps or bridges
        if (_dst.chainId == _chainId()) {
            _sendToken(nextToken, nextAmount, _dst.receiver, _dst.nativeOut);
            emit StepExecuted(id, nextAmount, nextToken);
            return remainingValue;
        }

        // funds are bridged directly to the receiver if there are no subsequent executions on the destination chain.
        // otherwise, it's sent to a "pocket" contract addr to temporarily hold the fund before it is used for swapping.
        address bridgeOutReceiver = _dst.receiver;

        // if there are more execution steps left, pack them and send to the next chain
        if (_execs.length > 0) {
            address remote = remotes[exec.bridge.toChainId];
            require(remote != address(0), "remote not found");
            bridgeOutReceiver = _getPocketAddr(id, remote);

            bytes memory message = abi.encode(Types.Message({execs: _execs, dst: _dst}));
            uint256 msgFee = IMessageBus(messageBus).calcFee(message);
            remainingValue -= msgFee;
            IMessageBus(messageBus).sendMessage{value: msgFee}(remote, exec.bridge.toChainId, message);
        }

        _bridgeSend(exec.bridge, bridgeOutReceiver, nextToken, nextAmount);
        remainingValue -= exec.bridge.nativeFee;

        emit StepExecuted(id, nextAmount, nextToken);
    }

    /**
     * @notice called by cBridge MessageBus and then simply calls execute() to carry on the executions
     * @param _message the message that contains the remaining swap-bridge combos to be executed
     * @return executionStatus always success if no reverts to let the MessageBus know that the message is processed
     */
    function executeMessage(
        address _sender,
        uint64 _srcChainId,
        bytes memory _message,
        address // _executor
    ) external payable override onlyMessageBus returns (ExecutionStatus) {
        Types.Message memory message = abi.decode((_message), (Types.Message));
        uint256 remainingValue = execute(_srcChainId, _sender, message.execs, Types.emptySourceInfo(), message.dst);
        // chainhop executor would always send a set amount of native token when calling messagebus's executeMessage().
        // these tokens cover the fee introduced by chaining another message when there are more bridging.
        // refunding the unspent native tokens back to the executor
        if (remainingValue > 0) {
            (bool ok, ) = tx.origin.call{value: remainingValue}("");
            require(ok, "failed to refund remaining native token");
        }
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
        require(msg.sender == _receiver, "only receiver can claim");
        // id ensures that only the designated receiver of a swap can claim funds from the designated pocket of a swap
        bytes32 id = _computeId(_receiver, _nonce);

        Pocket pocket = new Pocket{salt: id}();
        uint256 erc20Amount = IERC20(_token).balanceOf(address(pocket));
        uint256 nativeAmount = address(pocket).balance;
        require(erc20Amount > 0 || nativeAmount > 0, "pocket is empty");

        // this claims both _token and native
        _claimPocketERC20(pocket, _token, erc20Amount);

        if (erc20Amount > 0) {
            IERC20(_token).safeTransfer(_receiver, erc20Amount);
        }
        if (nativeAmount > 0) {
            (bool ok, ) = _receiver.call{value: nativeAmount, gas: 50000}("");
            require(ok, "failed to send native");
        }
        emit PocketFundClaimed(_receiver, erc20Amount, _token, nativeAmount);
    }

    function resecueFund(address _token, uint256 _amount) external onlyOwner {
        _sendToken(_token, _amount, msg.sender, false);
    }

    /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
     * Misc
     * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
    function _computeId(address _dstReceiver, uint64 _nonce) private pure returns (bytes32) {
        // the main purpose of this id is to uniquely identify a user-swap.
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
        // this case we tell the msgbus to revert the outter tx using the MSG::ABORT: prefix and
        // our executor will retry sending this tx later.
        //
        // this bridgeOutMin is also a counter-measure to a DoS attack vector. if we assume the bridge
        // funds have arrived once we see a balance in the pocket, an attacker can deposit a small
        // amount of fund into the pocket and confuse this contract that the bridged fund has arrived.
        // this triggers the refund logic branch and thus denying the dst swap for the victim.
        // bridgeOutMin is determined by the server before sending out the transfer.
        // bridgeOutMin = R * bridgeAmountIn where R is an arbitrary ratio that we feel effective in
        // raising the attacker's attack cost.
        require(
            erc20Amount > _exec.bridgeOutMin ||
                nativeAmount > _exec.bridgeOutMin ||
                fallbackAmount > _exec.bridgeOutFallbackMin,
            "MSG::ABORT:pocket is empty"
        );
        if (fallbackAmount > 0) {
            _claimPocketERC20(pocket, _exec.bridgeOutFallbackToken, fallbackAmount);
            amount = _deductFee(fallbackAmount, _exec.feeInBridgeOutFallbackToken);
            token = _exec.bridgeOutFallbackToken;
        } else {
            if (erc20Amount > 0) {
                _claimPocketERC20(pocket, _exec.bridgeOutToken, erc20Amount);
                amount = _deductFee(erc20Amount, _exec.feeInBridgeOutToken);
            } else if (nativeAmount > 0) {
                // no need to check before/after balance here since selfdestruct is guaranteed to
                // send all native tokens from the pocket to this contract.
                pocket.claim(address(0), 0);
                require(_exec.bridgeOutToken == nativeWrap, "bridgeOutToken not nativeWrap");
                amount = _deductFee(nativeAmount, _exec.feeInBridgeOutToken);
                IWETH(_exec.bridgeOutToken).deposit{value: amount}();
            }
            token = _exec.bridgeOutToken;
        }
    }

    // since the call result of the transfer function in the pocket contract is not checked, we check
    // the before and after balance of this contract to ensure that the amount is indeed received.
    function _claimPocketERC20(
        Pocket _pocket,
        address _token,
        uint256 _amount
    ) private {
        uint256 balBefore = IERC20(_token).balanceOf(address(this));
        _pocket.claim(_token, _amount);
        uint256 balAfter = IERC20(_token).balanceOf(address(this));
        require(balAfter - balBefore >= _amount, "insufficient fund claimed");
    }

    function _getPocketAddr(bytes32 _salt, address _deployer) private pure returns (address) {
        // how to predict a create2 address:
        // https://docs.soliditylang.org/en/v0.8.17/control-structures.html?highlight=create2#salted-contract-creations-create2
        bytes32 hash = keccak256(
            abi.encodePacked(bytes1(0xff), _deployer, _salt, keccak256(type(Pocket).creationCode))
        );
        return address(uint160(uint256(hash)));
    }

    function _deductFee(uint256 _amount, uint256 _fee) private pure returns (uint256 amount) {
        uint256 fee;
        // handle the case where amount received is not enough to pay fee
        if (_amount > _fee) {
            amount = _amount - _fee;
            fee = _fee;
        } else {
            fee = _amount;
        }
        // feeAccount
    }

    function _bridgeSend(
        Types.BridgeInfo memory _bridge,
        address _receiver,
        address _token,
        uint256 _amount
    ) private {
        IBridgeAdapter bridge = bridges[keccak256(bytes(_bridge.bridgeProvider))];
        IERC20(_token).safeIncreaseAllowance(address(bridge), _amount);
        bridge.bridge{value: _bridge.nativeFee}(_bridge.toChainId, _receiver, _amount, _token, _bridge.bridgeParams);
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
        return (true, balAfter - balBefore, tokenOut);
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

    function _removeFirst(Types.ExecutionInfo[] memory _execs)
        private
        pure
        returns (Types.ExecutionInfo[] memory rest)
    {
        require(_execs.length > 0, "empty execs");
        rest = new Types.ExecutionInfo[](_execs.length - 1);
        for (uint256 i = 1; i < _execs.length; i++) {
            rest[i - 1] = _execs[i];
        }
    }

    function _verify(
        Types.ExecutionInfo[] memory _execs,
        Types.SourceInfo memory _src,
        Types.DestinationInfo memory _dst
    ) private view {
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
            Types.BridgeInfo memory prevBridge = _execs[i - 1].bridge;
            // bridged tokens and the chain id of the execution are encoded in the sig data so that
            // no malicious user can temper the fee they have to pay on any execution steps
            bytes memory execData = abi.encodePacked(
                prevBridge.toChainId,
                e.feeInBridgeOutToken,
                e.bridgeOutToken,
                e.feeInBridgeOutFallbackToken,
                e.bridgeOutFallbackToken,
                // native fee also needs to be agreed upon by chainhop for any subsequent bridge
                // since the fee is provided by chainhop's executor
                e.bridge.nativeFee
            );
            data = data.concat(execData);
        }
        bytes32 signHash = keccak256(data).toEthSignedMessageHash();
        verifySig(signHash, _src.quoteSig);
    }

    function _chainId() private view returns (uint64) {
        return uint64(block.chainid);
    }
}
