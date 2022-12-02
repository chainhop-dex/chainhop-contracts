// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.15;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../interfaces/IBridgeAdapter.sol";
import "../interfaces/IBridgeStargate.sol";
import "../interfaces/IWETH.sol";

import "../lib/NativeWrap.sol";
import "../lib/Ownable.sol";

contract StargateAdapter is IBridgeAdapter, NativeWrap {
    using SafeERC20 for IERC20;

    mapping(address => bool) public supportedRouters;
    mapping(bytes32 => bool) public transfers;

    event SupportedRouterUpdated(address router, bool enabled);

    constructor(address _nativeWrap, address[] memory _routers) NativeWrap(_nativeWrap) {
        for (uint256 i = 0; i < _routers.length; i++) {
            require(_routers[i] != address(0), "nop");
            supportedRouters[_routers[i]] = true;
        }
    }

    struct StargateParams {
        // a unique identifier that is uses to dedup transfers
        // this value is the a timestamp sent from frontend, but in theory can be any unique number
        uint64 nonce;
        uint256 srcPoolId;
        uint256 dstPoolId;
        uint256 minReceivedAmt; // defines the slippage, the min qty you would accept on the destination
        uint16 stargateDstChainId; // stargate defines chain id in its way
        address router; // the target router, should be in the <ref>supportedRouters</ref>
    }

    function bridge(
        uint64 _dstChainId,
        address _receiver,
        uint256 _amount,
        address _token,
        bytes memory _bridgeParams
    ) external payable returns (bytes memory bridgeResp) {
        StargateParams memory params = abi.decode((_bridgeParams), (StargateParams));
        require(supportedRouters[params.router], "illegal router");

        bytes32 transferId = keccak256(
            abi.encodePacked(_receiver, _token, _amount, _dstChainId, params.nonce, uint64(block.chainid))
        );
        require(transfers[transferId] == false, "transfer exists");
        transfers[transferId] = true;
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        uint64 outboundNonce = swap(_token, _receiver, _amount, params);
        return abi.encodePacked(outboundNonce);
    }

    function swap(
        address _token,
        address _receiver,
        uint256 _amount,
        StargateParams memory params
    ) private returns (uint64 outboundNonce) {
        IBridgeStargate router = IBridgeStargate(params.router);
        if (_token == nativeWrap) {
            IWETH(_token).withdraw(_amount);
            router.swapETH{value: msg.value + _amount}(
                params.stargateDstChainId,
                payable(_receiver),
                abi.encodePacked(_receiver),
                _amount,
                params.minReceivedAmt
            );
        } else {
            IERC20(_token).safeApprove(params.router, _amount);
            router.swap{value: msg.value}(
                params.stargateDstChainId,
                params.srcPoolId,
                params.dstPoolId,
                payable(_receiver),
                _amount,
                params.minReceivedAmt,
                IBridgeStargate.lzTxObj(0, 0, "0x"),
                abi.encodePacked(_receiver),
                bytes("") // not supported additional msg in this version
            );
            IERC20(_token).safeApprove(params.router, 0);
        }

        // query current nonce
        address stargateInternalBridge;
        if (_token == nativeWrap) {
            stargateInternalBridge = IBridgeStargate(router.stargateRouter()).bridge();
        } else {
            stargateInternalBridge = router.bridge();
        }
        address layerZeroEndpoint = IStargateInternalBridge(stargateInternalBridge).layerZeroEndpoint();
        outboundNonce = ILayerZeroEndpoint(layerZeroEndpoint).getOutboundNonce(
            params.stargateDstChainId,
            stargateInternalBridge
        );
    }

    function setSupportedRouter(address _router, bool _enabled) external onlyOwner {
        bool enabled = supportedRouters[_router];
        require(enabled != _enabled, "nop");
        supportedRouters[_router] = _enabled;
        emit SupportedRouterUpdated(_router, _enabled);
    }
}
