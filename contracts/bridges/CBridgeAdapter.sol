// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.15;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../lib/Ownable.sol";
import "../lib/Pauser.sol";
import "../lib/MessageSenderLib.sol";
import "../lib/MessageReceiver.sol";
import "../lib/NativeWrap.sol";
import "../lib/Types.sol";
import "../interfaces/IBridgeAdapter.sol";
import "../interfaces/IIntermediaryOriginalToken.sol";
import "../interfaces/IWETH.sol";

contract CBridgeAdapter is MessageReceiver, IBridgeAdapter, NativeWrap, Pauser {
    using SafeERC20 for IERC20;

    constructor(address _nativeWrap, address _messageBus) NativeWrap(_nativeWrap) MessageReceiver(false, _messageBus) {}

    event CBridgeRefunded(uint256 amount, address token, address receiver);

    struct CBridgeParams {
        // type of the bridge in cBridge to use (i.e. liquidity bridge, pegged token bridge, etc.)
        MsgDataTypes.BridgeSendType bridgeType;
        // user defined maximum allowed slippage (pip) at bridge
        uint32 maxSlippage;
        // if this field is set, this contract attempts to wrap the input OR src bridge out token
        // (as specified in the tokenIn field OR the output token in src SwapDescription[]) before
        // sending to the bridge. This field is determined by the backend when searching for routes
        address wrappedBridgeToken;
        // a unique identifier that cBridge uses to dedup transfers
        // this value is the a timestamp sent from frontend, but in theory can be any unique number
        uint64 nonce;
        // because of the unique mechanism of cbridge that it refunds on src chain if bridge fails,
        // we need to record a refund receiver, typically the end user's address.
        address refundReceiver;
    }

    function bridge(
        uint64 _dstChainId,
        address _receiver,
        uint256 _amount,
        address _token,
        bytes memory _bridgeParams
    ) external payable returns (bytes memory bridgeResp) {
        CBridgeParams memory params = abi.decode((_bridgeParams), (CBridgeParams));
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        if (params.wrappedBridgeToken != address(0)) {
            address canonical = IIntermediaryOriginalToken(params.wrappedBridgeToken).canonical();
            require(canonical == _token, "canonical != _token");
            // non-standard implementation: actual token wrapping is done inside the token contract's
            // transferFrom(). Approving the wrapper token contract to pull the token we intend to
            // send so that when bridge contract calls wrapper.transferFrom() it automatically pulls
            // the original token from this contract, wraps it, then transfer the wrapper token from
            // this contract to bridge.
            IERC20(_token).safeApprove(params.wrappedBridgeToken, _amount);
            _token = params.wrappedBridgeToken;
        }

        // the message sent here is purely used in the face of transfer refund. only the
        // receiver's address is saved in the message.
        require(params.refundReceiver != address(0), "0 refund receiver");
        bytes32 transferId = MessageSenderLib.sendMessageWithTransfer(
            _receiver,
            _token,
            _amount,
            _dstChainId,
            params.nonce,
            params.maxSlippage,
            abi.encode(params.refundReceiver), // used for refund only
            params.bridgeType,
            messageBus,
            msg.value
        );
        if (params.wrappedBridgeToken != address(0)) {
            IERC20(IIntermediaryOriginalToken(params.wrappedBridgeToken).canonical()).safeApprove(
                params.wrappedBridgeToken,
                0
            );
        }
        return abi.encode(transferId);
    }

    /**
     * @notice Used to trigger refund when bridging fails due to large slippage
     * @dev only MessageBus can call this function, this requires the user to get sigs of the message from SGN
     * @dev Bridge contract *always* sends native token to its receiver (this contract) even though
     * the _token field is always an ERC20 token
     * @param _token the token received by this contract
     * @param _amount the amount of token received by this contract
     * @return ExecutionStatus a status indicates whether the processing is successful
     */
    function executeMessageWithTransferRefund(
        address _token,
        uint256 _amount,
        bytes calldata _message,
        address // _executor
    ) external payable onlyMessageBus returns (ExecutionStatus) {
        require(!paused(), "MSG::ABORT:paused"); // revert outter tx
        address receiver = abi.decode((_message), (address));
        _wrapBridgeOutToken(_token, _amount);
        _sendToken(_token, _amount, receiver, false);
        emit CBridgeRefunded(_amount, _token, receiver);
        return ExecutionStatus.Success;
    }

    function _wrapBridgeOutToken(address _token, uint256 _amount) private {
        if (_token == nativeWrap) {
            // If the bridge out token is a native wrap, we need to check whether the actual received
            // token is native token.
            // Note Assumption: only the liquidity bridge is capable of sending a native wrap
            address liqBridge = IMessageBus(messageBus).liquidityBridge();
            // If bridge's nativeWrap is set, then bridge automatically unwraps the token and send
            // it to this contract. Otherwise the received token in this contract is ERC20
            if (IBridgeCeler(liqBridge).nativeWrap() == nativeWrap) {
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
}
