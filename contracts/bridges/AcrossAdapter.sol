// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.15;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "../interfaces/IBridgeAdapter.sol";
import "../interfaces/ISpokePool.sol";

contract AcrossAdapter is IBridgeAdapter, Ownable {
    using SafeERC20 for IERC20;

    address public mainContract;
    address public spokePool;

    event MainContractUpdated(address mainContract);
    event SpokePoolUpdated(address spokePool);

    modifier onlyMainContract() {
        require(msg.sender == mainContract, "caller is not main contract");
        _;
    }

    constructor(address _mainContract, address _spokePool) {
        mainContract = _mainContract;
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
        bytes memory _bridgeParams,
        bytes memory //_requestMessage
    ) external payable onlyMainContract returns (bytes memory bridgeResp) {
        BridgeParams memory params = abi.decode(_bridgeParams, (BridgeParams));
        ISpokePool(spokePool).deposit(
            _receiver,
            _token,
            _amount,
            _dstChainId,
            params.relayerFeePct,
            params.quoteTimestamp
        );
        uint32 depositId = ISpokePool(spokePool).numberOfDeposits();
        return abi.encode(depositId);
    }

    function setMainContract(address _mainContract) external onlyOwner {
        mainContract = _mainContract;
        emit MainContractUpdated(_mainContract);
    }

    function setSpokePool(address _spokePool) external onlyOwner {
        spokePool = _spokePool;
        emit SpokePoolUpdated(_spokePool);
    }

    // convenience function to make encoding bridge params easier using ABI generated go code
    function encodeBridgeParams(BridgeParams memory _params) external {}
}
