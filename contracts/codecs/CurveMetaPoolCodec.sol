// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IUniswapV2Router01.sol";
import "../interfaces/ICodec.sol";
import "../interfaces/ICurvePool.sol";

contract CurveMetaPoolCodec is ICodec, Ownable {
    struct SwapCalldata {
        int128 i;
        int128 j;
        uint256 dx;
        uint256 min_dy;
        address _receiver;
    }

    event PoolTokensSet(address[] pools, address[][] poolTokens);

    // Pool address to *underlying* token addresses. position sensitive.
    // This is needed because some of the metapools fail to implement curve's underlying_coins() spec,
    // therefore no consistant way to query token addresses by their indices.
    mapping(address => address[]) public pool2tokens;

    constructor(address[] memory _pools, address[][] memory _poolTokens) {
        _setPoolTokens(_pools, _poolTokens);
    }

    function setPoolTokens(address[] calldata _pools, address[][] calldata _poolTokens) external onlyOwner {
        _setPoolTokens(_pools, _poolTokens);
    }

    function _setPoolTokens(address[] memory _pools, address[][] memory _poolTokens) private {
        require(_pools.length == _poolTokens.length, "len mm");
        for (uint256 i = 0; i < _pools.length; i++) {
            pool2tokens[_pools[i]] = _poolTokens[i];
        }
        emit PoolTokensSet(_pools, _poolTokens);
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
        uint256 i = uint256(int256(data.i));
        uint256 j = uint256(int256(data.j));
        address[] memory tokens = pool2tokens[_swap.dex];
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
