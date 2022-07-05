// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.15;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/ICurvePool.sol";

import "hardhat/console.sol";

contract MockCurvePool {
    using SafeERC20 for IERC20;

    address[] public coins;
    uint8[] public decimals;

    uint256 fakeSlippage; // 100% = 100 * 1e4
    uint256 constant HUNDRED_PERC = 100 * 1e4;

    constructor(
        address[] memory _coins,
        uint8[] memory _decimals,
        uint256 _fakeSlippage
    ) {
        coins = _coins;
        fakeSlippage = _fakeSlippage;
        decimals = _decimals;
    }

    function exchange(
        int128 _i,
        int128 _j,
        uint256 _dx,
        uint256 _min_dy
    ) external {
        address coini = coins[uint256(int256(_i))];
        address coinj = coins[uint256(int256(_j))];

        uint8 decimali = decimals[uint256(int256(_i))];
        uint8 decimalj = decimals[uint256(int256(_j))];

        require(coini != address(0), "coin i not found");
        require(coinj != address(0), "coin j not found");

        IERC20(coini).safeTransferFrom(msg.sender, address(this), _dx);

        uint256 amountOut = (((_dx * decimali) / decimalj) * (HUNDRED_PERC - fakeSlippage)) / HUNDRED_PERC;
        require(amountOut >= _min_dy, "slippage too large");

        IERC20(coinj).safeTransfer(msg.sender, amountOut);
    }

    function get_dy(
        int128 _i,
        int128 _j,
        uint256 _dx
    ) external view returns (uint256) {
        address coini = coins[uint256(int256(_i))];
        address coinj = coins[uint256(int256(_j))];
        require(coini != address(0), "coin i not found");
        require(coinj != address(0), "coin j not found");
        return (_dx * (HUNDRED_PERC - fakeSlippage)) / HUNDRED_PERC;
    }
}
