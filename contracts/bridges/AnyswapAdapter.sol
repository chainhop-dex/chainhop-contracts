// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.15;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../interfaces/IBridgeAdapter.sol";
import "../interfaces/IBridgeAnyswap.sol";

import "../lib/Ownable.sol";

contract AnyswapAdapter is IBridgeAdapter, Ownable {
    using SafeERC20 for IERC20;

    mapping(address => bool) public supportedRouters;
    mapping(bytes32 => bool) public transfers;

    event SupportedRouterUpdated(address router, bool enabled);

    constructor(address[] memory _anyswapRouters) {
        for (uint256 i = 0; i < _anyswapRouters.length; i++) {
            require(_anyswapRouters[i] != address(0), "nop");
            supportedRouters[_anyswapRouters[i]] = true;
        }
    }

    struct AnyswapParams {
        // a unique identifier that is uses to dedup transfers
        // this value is the a timestamp sent from frontend, but in theory can be any unique number
        uint64 nonce;
        // the wrapped any token of the native
        address anyToken;
        // the target anyswap Router, should be in the <ref>supportedRouters</ref>
        address router;
    }

    function bridge(
        uint64 _dstChainId,
        address _receiver,
        uint256 _amount,
        address _token, // Note, here uses the address of the native
        bytes memory _bridgeParams
    ) external payable returns (bytes memory bridgeResp) {
        AnyswapParams memory params = abi.decode((_bridgeParams), (AnyswapParams));
        require(supportedRouters[params.router], "illegal router");

        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        IERC20(_token).safeApprove(params.router, _amount);
        if (IUnderlying(params.anyToken).underlying() != address(0)) {
            IBridgeAnyswap(params.router).anySwapOutUnderlying(params.anyToken, _receiver, _amount, _dstChainId);
        } else {
            IBridgeAnyswap(params.router).anySwapOut(params.anyToken, _receiver, _amount, _dstChainId);
        }
        IERC20(_token).safeApprove(params.router, 0);
        return bridgeResp;
    }

    function setSupportedRouter(address _router, bool _enabled) external onlyOwner {
        bool enabled = supportedRouters[_router];
        require(enabled != _enabled, "nop");
        supportedRouters[_router] = _enabled;
        emit SupportedRouterUpdated(_router, _enabled);
    }
}
