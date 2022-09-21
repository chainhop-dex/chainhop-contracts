// SPDX-License-Identifier: MIT
pragma solidity 0.8.15;

interface IHyphenLiquidityPool {
    function depositErc20(
        uint256 toChainId,
        address tokenAddress,
        address receiver,
        uint256 amount,
        string memory tag
    ) external;
}
