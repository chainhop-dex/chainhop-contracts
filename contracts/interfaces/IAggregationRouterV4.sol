// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.15;

// 1inch's AggregationRouterV4
interface IAggregationRouterV4 {
    // uniswap v3 swapper method
    function uniswapV3Swap(
        uint256 amount,
        uint256 minReturn,
        uint256[] calldata pools
    ) external payable returns (uint256 returnAmount);
}
