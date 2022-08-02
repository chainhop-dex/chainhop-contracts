// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.15;

import "../interfaces/ICodec.sol";
import "../interfaces/ICurvePool.sol";

contract CurvePoolCodec is ICodec {
    struct SwapCalldata {
        int128 i;
        int128 j;
        uint256 dx;
        uint256 min_dy;
    }

    function decodeCalldata(ICodec.SwapDescription calldata _swap)
        external
        view
        returns (
            uint256 amountIn,
            address tokenIn,
            address tokenOut
        )
    {
        SwapCalldata memory data = abi.decode((_swap.data[4:]), (SwapCalldata));
        amountIn = data.dx;
        tokenIn = ICurvePool(_swap.dex).coins(uint256(int256(data.i)));
        tokenOut = ICurvePool(_swap.dex).coins(uint256(int256(data.j)));
    }

    function encodeCalldataWithOverride(
        bytes calldata _data,
        uint256 _amountInOverride,
        address // receiverOverride
    ) external pure returns (bytes memory swapCalldata) {
        bytes4 selector = bytes4(_data);
        SwapCalldata memory data = abi.decode((_data[4:]), (SwapCalldata));
        data.dx = _amountInOverride;
        return abi.encodeWithSelector(selector, data);
    }
}
