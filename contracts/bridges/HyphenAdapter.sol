// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.15;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "../interfaces/IBridgeAdapter.sol";
import "../interfaces/IHyphenLiquidityPool.sol";

contract HyphenAdapter is IBridgeAdapter, Ownable {
    using SafeERC20 for IERC20;

    address public pool;

    event PoolUpdated(address pool);

    constructor(address _pool) {
        pool = _pool;
    }

    function bridge(
        uint64 _dstChainId,
        address _receiver,
        uint256 _amount,
        address _token,
        bytes memory, // _bridgeParams
        bytes memory // _requestMessage
    ) external payable returns (bytes memory bridgeResp) {
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        IERC20(_token).approve(pool, _amount);
        IHyphenLiquidityPool(pool).depositErc20(_dstChainId, _token, _receiver, _amount, "chainhop");
        // hyphen uses src tx hash to track history so bridgeResp is not needed. returning empty
        return bridgeResp;
    }

    function setPool(address _pool) external onlyOwner {
        pool = _pool;
        emit PoolUpdated(_pool);
    }
}
