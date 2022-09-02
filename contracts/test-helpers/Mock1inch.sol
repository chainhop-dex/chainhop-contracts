// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.15;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract Mock1inch {
    using SafeERC20 for IERC20;

    function swap(
        uint256 amountIn,
        uint256 amountOutMin,
        address to,
        address srcToken,
        address dstToken
    )
    external
    payable
    {
        // fake dex
        IERC20(srcToken).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(dstToken).safeTransfer(to, amountOutMin);
        return;
    }
}