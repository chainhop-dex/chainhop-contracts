// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/ICodec.sol";
import "../interfaces/ICurvePool.sol";
import "./CurveTokenAddresses.sol";

contract CurveMetaPoolCodec is ICodec, CurveTokenAddresses {
    struct SwapCalldata {
        int128 i;
        int128 j;
        uint256 dx;
        uint256 min_dy;
        address _receiver;
    }

    constructor(address[] memory _pools, address[][] memory _poolTokens) CurveTokenAddresses(_pools, _poolTokens) {}

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
        uint256 i = uint256(int256(data.i));
        uint256 j = uint256(int256(data.j));
        address[] memory tokens = poolToTokens[_swap.dex];
        tokenIn = tokens[i];
        tokenOut = tokens[j];
    }

    function encodeCalldataWithOverride(
        bytes calldata _data,
        uint256 _amountInOverride,
        address _receiverOverride
    ) external pure returns (bytes memory swapCalldata) {
        bytes4 selector = bytes4(_data);
        SwapCalldata memory data = abi.decode((_data[4:]), (SwapCalldata));
        data.dx = _amountInOverride;
        data._receiver = _receiverOverride;
        return abi.encodeWithSelector(selector, data);
    }
}
