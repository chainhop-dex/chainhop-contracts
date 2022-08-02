// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.15;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockUniswapV2 {
    using SafeERC20 for IERC20;

    uint256 fakeSlippage; // 100% = 100 * 1e4
    uint256 constant HUNDRED_PERC = 100 * 1e4;

    constructor(uint256 _fakeSlippage) {
        fakeSlippage = _fakeSlippage;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        require(deadline != 0 && deadline > block.timestamp, "deadline exceeded");
        require(path.length > 1, "path must have more than 1 token in it");

        // fake simulate slippage
        uint256 amountAfterSlippage = (amountIn * (HUNDRED_PERC - fakeSlippage)) / HUNDRED_PERC;
        require(amountAfterSlippage >= amountOutMin, "bad slippage");
        IERC20(path[0]).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(path[path.length - 1]).safeTransfer(to, amountAfterSlippage);
        uint256[] memory ret = new uint256[](2);
        ret[0] = amountIn;
        ret[1] = amountAfterSlippage;
        return ret;
    }

    function setFakeSlippage(uint256 _fakeSlippage) public {
        fakeSlippage = _fakeSlippage;
    }
}
