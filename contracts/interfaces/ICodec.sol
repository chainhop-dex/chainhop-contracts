// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.0;

interface ICodec {
    struct SwapDescription {
        address dex; // the DEX to use for the swap, zero address implies no swap needed
        bytes data; // the data to call the dex with
    }

    // for which selector does this codec apply
    function whichSelector() external pure returns (bytes4);

    function decodeCalldata(SwapDescription calldata swap)
        external
        view
        returns (
            uint256 amountIn,
            address tokenIn,
            address tokenOut
        );

    function decodeReturnData(bytes calldata res) external pure returns (uint256 amountOut);

    function encodeCalldataWithOverride(bytes calldata data, uint256 amountInOverride)
        external
        pure
        returns (bytes memory swapCalldata);
}
