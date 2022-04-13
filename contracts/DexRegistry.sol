// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.12;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Manages a list supported dex
 * @author Padoriku
 */
abstract contract DexRegistry is Ownable {
    event SupportedDexUpdated(address dex, bytes4 selector, bool enabled);

    mapping(address => mapping(bytes4 => bool)) public dexRegistry;

    constructor(address[] memory _supportedDexList, string[] memory _supportedFuncs) {
        for (uint256 i = 0; i < _supportedDexList.length; i++) {
            bytes4 selector = bytes4(keccak256(bytes(_supportedFuncs[i])));
            _setSupportedDex(_supportedDexList[i], selector, true);
        }
    }

    function setSupportedDex(
        address _dex,
        bytes4 _selector,
        bool _enabled
    ) external onlyOwner {
        _setSupportedDex(_dex, _selector, _enabled);
        emit SupportedDexUpdated(_dex, _selector, _enabled);
    }

    function _setSupportedDex(
        address _dex,
        bytes4 _selector,
        bool _enabled
    ) private {
        bool enabled = dexRegistry[_dex][_selector];
        require(enabled != _enabled, "nop");
        dexRegistry[_dex][_selector] = _enabled;
    }
}
