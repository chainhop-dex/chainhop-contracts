// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.15;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "../lib/MessageSenderLib.sol";
import "../lib/MessageReceiverApp.sol";
import "../interfaces/IBridgeAdapter.sol";
import "../interfaces/ITransferSwapper.sol";
import "../interfaces/IIntermediaryOriginalToken.sol";

contract CBridgeAdapter is MessageReceiverApp, IBridgeAdapter {
    address public mainContract;

    event MainContractUpdated(address mainContract);

    modifier onlyMainContract() {
        require(msg.sender == mainContract, "caller is not main contract");
        _;
    }

    constructor(address _mainContract, address _messageBus) {
        mainContract = _mainContract;
        messageBus = _messageBus;
    }

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
    }

    function bridge(
        uint64 _dstChainId,
        address _receiver,
        uint256 _amount,
        address _token,
        bytes memory _bridgeParams,
        bytes memory _requestMessage
    ) external payable onlyMainContract returns (bytes memory bridgeResp) {
        CBridgeParams memory params = abi.decode((_bridgeParams), (CBridgeParams));
        IERC20(_token).transferFrom(msg.sender, address(this), _amount);
        if (params.wrappedBridgeToken != address(0)) {
            address canonical = IIntermediaryOriginalToken(params.wrappedBridgeToken).canonical();
            require(canonical == _token, "canonical != _token");
            // non-standard implementation: actual token wrapping is done inside the token contract's
            // transferFrom(). Approving the wrapper token contract to pull the token we intend to
            // send so that when bridge contract calls wrapper.transferFrom() it automatically pulls
            // the original token from this contract, wraps it, then transfer the wrapper token from
            // this contract to bridge.
            IERC20(_token).approve(params.wrappedBridgeToken, _amount);
            _token = params.wrappedBridgeToken;
        }
        bytes32 transferId = MessageSenderLib.sendMessageWithTransfer(
            _receiver,
            _token,
            _amount,
            _dstChainId,
            params.nonce,
            params.maxSlippage,
            _requestMessage,
            params.bridgeType,
            messageBus,
            msg.value
        );
        return abi.encodePacked(transferId);
    }

    function updateMainContract(address _mainContract) external onlyOwner {
        mainContract = _mainContract;
        emit MainContractUpdated(_mainContract);
    }

    function executeMessageWithTransferRefund(
        address _token,
        uint256 _amount,
        bytes calldata _message,
        address _executor
    ) external payable override onlyMessageBus returns (ExecutionStatus) {
        IERC20(_token).approve(mainContract, _amount);
        return ITransferSwapper(mainContract).executeMessageWithTransferRefundFromAdapter(_token, _amount, _message, _executor);
    }
}
