// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.12;

import "../interfaces/ICodec.sol";
import "../interfaces/ISwapRouter.sol";

contract UniswapV3ExactInputCodec is ICodec {
    function decodeCalldata(ICodec.SwapDescription calldata _swap)
        external
        pure
        returns (
            uint256 amountIn,
            address tokenIn,
            address tokenOut
        )
    {
        ISwapRouter.ExactInputParams memory data = abi.decode((_swap.data[4:]), (ISwapRouter.ExactInputParams));
        // path is in the format of abi.encodedPacked(address tokenIn, [uint24 fee, address token[, uint24 fee, address token]...])
        require((data.path.length - 20) % 23 == 0, "malformed path");
        // first 20 bytes is tokenIn
        tokenIn = address(bytes20(copySubBytes(data.path, 0, 20)));
        // last 20 bytes is tokenOut
        tokenOut = address(bytes20(copySubBytes(data.path, data.path.length - 20, data.path.length)));
        amountIn = data.amountIn;
    }

    function encodeCalldataWithOverride(
        bytes calldata _data,
        uint256 _amountInOverride,
        address _receiverOverride
    ) external pure returns (bytes memory swapCalldata) {
        bytes4 selector = bytes4(_data);
        ISwapRouter.ExactInputParams memory data = abi.decode((_data[4:]), (ISwapRouter.ExactInputParams));
        data.amountIn = _amountInOverride;
        data.recipient = _receiverOverride;
        return abi.encodeWithSelector(selector, data);
    }

    // basically a bytes' version of byteN[from:to] execpt it copies
    function copySubBytes(
        bytes memory data,
        uint256 from,
        uint256 to
    ) private pure returns (bytes memory ret) {
        require(to <= data.length, "index overflow");
        uint256 len = to - from;
        ret = new bytes(len);
        for (uint256 i = 0; i < len; i++) {
            ret[i] = data[i + from];
        }
    }
}
