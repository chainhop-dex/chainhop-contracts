// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.15;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/ICodec.sol";
import "./interfaces/IWETH.sol";
import "./DexRegistry.sol";

/**
 * @title Loads codecs for the swaps and performs swap actions
 * @author Padoriku
 */
contract Swapper is DexRegistry {
    using SafeERC20 for IERC20;

    constructor(
        address[] memory _supportedDexList,
        string[] memory _supportedDexFuncs,
        address[] memory _codecs
    ) DexRegistry(_supportedDexList, _supportedDexFuncs, _codecs) {}

    function prepareSwap(ICodec.SwapDescription memory _swap, uint256 _amountIn)
        internal
        view
        returns (
            uint256 amountIn,
            address tokenIn,
            address tokenOut,
            bytes memory data
        )
    {
        bytes4 selector = bytes4(_swap.data);
        ICodec codec = getCodec(_swap.dex, selector);
        (, tokenIn, tokenOut) = codec.decodeCalldata(_swap);
        data = codec.encodeCalldataWithOverride(_swap.data, _amountIn, address(this));
        IERC20(tokenIn).safeIncreaseAllowance(_swap.dex, _amountIn);
    }

    function executeSwap(
        ICodec.SwapDescription memory _swap,
        uint256 _amountIn,
        address _tokenIn
    )
        internal
        view
        returns (
            bool ok,
            uint256 amountOut,
            address tokenOut
        )
    {
        bytes4 selector = bytes4(_swap.data);
        ICodec codec = getCodec(_swap.dex, selector);
        uint256 amountIn;
        address tokenIn;
        (amountIn, tokenIn, tokenOut) = codec.decodeCalldata(_swap);
        require(amountIn == _amountIn && tokenIn == _tokenIn, "swap info mismatch");

        bytes memory data = codec.encodeCalldataWithOverride(_swap.data, _amountIn, address(this));
        IERC20(tokenIn).safeIncreaseAllowance(_swap.dex, _amountIn);
        uint256 balBefore = IERC20(tokenOut).balanceOf(address(this));
        (bool success, bytes memory res) = _swap.dex.call(data);
        if (!success) {
            return (false, 0, tokenOut);
        }
        uint256 balAfter = IERC20(tokenOut).balanceOf(address(this));

        amountOut = balAfter - balBefore;
        if (amountOut < _swap.amountOutMin) {
            return (false, 0);
        }
    }
}
