// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "../lib/MessageSenderLib.sol";
import "../lib/MessageBusAddress.sol";
import "../interfaces/IBridgeAdapter.sol";
import "../interfaces/IIntermediaryOriginalToken.sol";

contract CBridgeAdapter is MessageBusAddress, IBridgeAdapter {
    address public mainContract;

    event MainContractUpdated(address mainContract);

    modifier onlyMainContract() {
        require(msg.sender == mainContract, "caller is not main contract");
        _;
    }

    constructor(
        address _mainContract
    ) {
        mainContract = _mainContract;
    }

    function bridge(
        bytes32 _id,
        address _bridgeOutReceiver,
        Common.TransferDescription memory _desc,
        ICodec.SwapDescription[] memory _dstSwaps,
        uint256 _amount,
        address _token,
        uint256 _msgFee
    ) external onlyMainContract returns (bytes32 transferId) {
        bytes memory requestMessage = Common.encodeRequestMessage(_id, _desc, _dstSwaps);
        if (_desc.wrappedBridgeToken != address(0)) {
            address canonical = IIntermediaryOriginalToken(_desc.wrappedBridgeToken).canonical();
            require(canonical == _token, "canonical != _token");
            // non-standard implementation: actual token wrapping is done inside the token contract's
            // transferFrom(). Approving the wrapper token contract to pull the token we intend to
            // send so that when bridge contract calls wrapper.transferFrom() it automatically pulls
            // the original token from this contract, wraps it, then transfer the wrapper token from
            // this contract to bridge.
            IERC20(_token).approve(_desc.wrappedBridgeToken, _amount);
            _token = _desc.wrappedBridgeToken;
        }
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

    function updateMainContract(address _mainContract) external onlyOwner {
        mainContract = _mainContract;
        emit MainContractUpdated(_mainContract);
    }
}