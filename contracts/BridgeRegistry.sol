// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.15;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import "./interfaces/IBridgeAdapter.sol";

/**
 * @title Manages a list of supported bridges
 * @author lionelhoho
 * @author Padoriku
 */
abstract contract BridgeRegistry is Ownable, Initializable {
    event SupportedBridgesUpdated(string[] providers, address[] adapters);

    bytes32 public constant CBRIDGE_PROVIDER_HASH = keccak256(bytes("cbridge"));

    mapping(bytes32 => IBridgeAdapter) public bridges;

    function initBridgeRegistry(string[] calldata _providers, address[] calldata _adapters) internal onlyInitializing {
        _setSupportedbridges(_providers, _adapters);
    }

    // to disable a bridge, set the bridge addr of the corresponding provider to address(0)
    function setSupportedBridges(string[] calldata _providers, address[] calldata _adapters) external onlyOwner {
        _setSupportedbridges(_providers, _adapters);
    }

    function _setSupportedbridges(string[] calldata _providers, address[] calldata _adapters) private {
        require(_providers.length == _adapters.length, "params size mismatch");
        for (uint256 i = 0; i < _providers.length; i++) {
            bridges[keccak256(bytes(_providers[i]))] = IBridgeAdapter(_adapters[i]);
        }
        emit SupportedBridgesUpdated(_providers, _adapters);
    }
}
