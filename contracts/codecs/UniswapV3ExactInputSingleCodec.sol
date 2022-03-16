// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.12;

import "../interfaces/ICodec.sol";
import "../interfaces/ISwapRouter.sol";

contract UniswapV3ExactInputSingleCodec is ICodec {
    function decodeCalldata(ICodec.SwapDescription calldata _swap)
        external
        pure
        returns (
            uint256 amountIn,
            address tokenIn,
            address tokenOut
        )
    {
        ISwapRouter.ExactInputSingleParams memory data = abi.decode((_swap.data), (ISwapRouter.ExactInputSingleParams));
        return (data.amountIn, data.tokenIn, data.tokenOut);
    }

    function decodeReturnData(bytes calldata _res) external pure returns (uint256 amountOut) {
        return abi.decode((_res), (uint256));
    }

    function encodeCalldataWithOverride(
        bytes calldata _data,
        uint256 _amountInOverride,
        address _receiverOverride
    ) external pure returns (bytes memory swapCalldata) {
        bytes4 selector = bytes4(_data);
        ISwapRouter.ExactInputSingleParams memory data = abi.decode((_data), (ISwapRouter.ExactInputSingleParams));
        data.amountIn = _amountInOverride;
        data.recipient = _receiverOverride;
        return abi.encodeWithSelector(selector, data);
    }
}
