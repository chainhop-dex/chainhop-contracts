// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.12;

import "../interfaces/ICodec.sol";
import "../interfaces/ISwapRouter.sol";

contract UniswapV3ExactInputSingleCodec is ICodec {
    struct SwapCalldata {
        bytes4 selector;
        ISwapRouter.ExactInputSingleParams params;
    }

    function decodeCalldata(ICodec.SwapDescription calldata _swap)
        external
        pure
        returns (
            uint256 amountIn,
            address tokenIn,
            address tokenOut
        )
    {
        SwapCalldata memory data = abi.decode((_swap.data), (SwapCalldata));
        return (data.params.amountIn, data.params.tokenIn, data.params.tokenOut);
    }

    function decodeReturnData(bytes calldata _res) external pure returns (uint256 amountOut) {
        return abi.decode((_res), (uint256));
    }

    function encodeCalldataWithOverride(bytes calldata _data, uint256 _amountInOverride)
        external
        pure
        returns (bytes memory swapCalldata)
    {
        bytes4 selector = bytes4(_data);
        SwapCalldata memory data = abi.decode((_data), (SwapCalldata));
        data.params.amountIn = _amountInOverride;
        return abi.encodeWithSelector(selector, data);
    }
}
