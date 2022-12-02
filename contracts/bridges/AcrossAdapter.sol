// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.15;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../interfaces/IBridgeAdapter.sol";
import "../interfaces/ISpokePool.sol";

import "../lib/Ownable.sol";

contract AcrossAdapter is IBridgeAdapter, Ownable {
    using SafeERC20 for IERC20;

    address public spokePool;

    event SpokePoolUpdated(address spokePool);

    constructor(address _spokePool) {
        spokePool = _spokePool;
    }

    struct BridgeParams {
        uint64 relayerFeePct;
        uint32 quoteTimestamp;
    }

    function bridge(
        uint64 _dstChainId,
        address _receiver,
        uint256 _amount,
        address _token,
        bytes memory _bridgeParams
    ) external payable returns (bytes memory bridgeResp) {
        BridgeParams memory params = abi.decode(_bridgeParams, (BridgeParams));
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        IERC20(_token).safeApprove(spokePool, _amount);
        uint32 depositId = ISpokePool(spokePool).numberOfDeposits();
        ISpokePool(spokePool).deposit(
            _receiver,
            _token,
            _amount,
            _dstChainId,
            params.relayerFeePct,
            params.quoteTimestamp
        );
        IERC20(_token).safeApprove(spokePool, 0);
        return abi.encode(depositId);
    }

    function setSpokePool(address _spokePool) external onlyOwner {
        spokePool = _spokePool;
        emit SpokePoolUpdated(_spokePool);
    }

    // convenience function to make encoding bridge params easier using ABI generated go code
    function encodeBridgeParams(BridgeParams memory _params) external {}
}
