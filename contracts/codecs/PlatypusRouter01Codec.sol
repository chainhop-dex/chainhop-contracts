// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.15;

import "../interfaces/ICodec.sol";

contract PlatypusRouter01Codec is ICodec {
    function decodeCalldata(ICodec.SwapDescription calldata _swap)
        external
        pure
        returns (
            uint256 amountIn,
            address tokenIn,
            address tokenOut
        )
    {
        (address[] memory tokenPath, , uint256 fromAmount, , , ) = abi.decode(
            (_swap.data[4:]),
            (address[], address[], uint256, uint256, address, uint256)
        );
        require(tokenPath.length > 1, "len tk path");
        return (fromAmount, tokenPath[0], tokenPath[tokenPath.length - 1]);
    }

    function encodeCalldataWithOverride(
        bytes calldata _data,
        uint256 _amountInOverride,
        address _receiverOverride
    ) external pure returns (bytes memory swapCalldata) {
        bytes4 selector = bytes4(_data);
        (address[] memory tokenPath, address[] memory poolPath, , uint256 min, , uint256 ddl) = abi.decode(
            (_data[4:]),
            (address[], address[], uint256, uint256, address, uint256)
        );
        return abi.encodeWithSelector(selector, tokenPath, poolPath, _amountInOverride, min, _receiverOverride, ddl);
    }
}
