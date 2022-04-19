// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.12;

import "@openzeppelin/contracts/access/Ownable.sol";

contract CurveTokenAddresses is Ownable {
    event PoolTokensSet(address[] pools, address[][] poolTokens);

    // Pool address to *underlying* token addresses. position sensitive.
    // This is needed because some of the metapools fail to implement curve's underlying_coins() spec,
    // therefore no consistant way to query token addresses by their indices.
    mapping(address => address[]) public poolToTokens;

    constructor(address[] memory _pools, address[][] memory _poolTokens) {
        _setPoolTokens(_pools, _poolTokens);
    }

    function setPoolTokens(address[] calldata _pools, address[][] calldata _poolTokens) external onlyOwner {
        _setPoolTokens(_pools, _poolTokens);
    }

    function _setPoolTokens(address[] memory _pools, address[][] memory _poolTokens) private {
        require(_pools.length == _poolTokens.length, "len mm");
        for (uint256 i = 0; i < _pools.length; i++) {
            poolToTokens[_pools[i]] = _poolTokens[i];
        }
        emit PoolTokensSet(_pools, _poolTokens);
    }
}
