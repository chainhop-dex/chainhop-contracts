// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.12;

/**
 * @title Manages a list supported dex
 * @author Padoriku
 */
abstract contract DexRegistry {
    event SupportedDexUpdated(address dex, bool enabled);

    mapping(address => bool) public dexRegistry;

    constructor(address[] memory _supportedDexList) {
        for (uint256 i = 0; i < _supportedDexList.length; i++) {
            _setSupportedDex(_supportedDexList[i], true);
        }
    }

    function setSupportedDex(address _dex, bool _enabled) public {
        _setSupportedDex(_dex, _enabled);
        emit SupportedDexUpdated(_dex, _enabled);
    }

    function _setSupportedDex(address _dex, bool _enabled) private {
        bool enabled = dexRegistry[_dex];
        require(enabled != _enabled, "nop");
        dexRegistry[_dex] = _enabled;
    }
}
