// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/ICodec.sol";
import "../interfaces/ICurvePool.sol";
import "./CurveTokenAddresses.sol";

/**
 * @title a special codec for pools that implement exchange_underlying() slightly differently than others.
 * e.g. "sUSD" pool on Ethereum and "aave" on Polygon
 * @author padoriku
 * @notice encode/decode calldata
 */
contract CurveSpecialMetaPoolCodec is ICodec, CurveTokenAddresses {
    struct SwapCalldata {
        int128 i;
        int128 j;
        uint256 dx;
        uint256 min_dy;
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
        uint256 i = uint256(uint128(data.i));
        uint256 j = uint256(uint128(data.j));

        address[] memory tokens = poolToTokens[_swap.dex];
        if (tokens.length > 0) {
            // some pool(sUSD)'s implementation of underlying_coins takes uint128 instead of uint256 as input
            // register these pool's token addresses manually to workaround this.
            tokenIn = tokens[i];
            tokenOut = tokens[j];
        } else {
            tokenIn = ICurvePool(_swap.dex).underlying_coins(i);
            tokenOut = ICurvePool(_swap.dex).underlying_coins(j);
        }
    }

    function encodeCalldataWithOverride(
        bytes calldata _data,
        uint256 _amountInOverride,
        address // _receiverOverride
    ) external pure returns (bytes memory swapCalldata) {
        bytes4 selector = bytes4(_data);
        SwapCalldata memory data = abi.decode((_data[4:]), (SwapCalldata));
        data.dx = _amountInOverride;
        return abi.encodeWithSelector(selector, data);
    }
}
