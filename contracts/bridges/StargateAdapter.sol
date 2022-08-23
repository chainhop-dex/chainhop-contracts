// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.15;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "../interfaces/IBridgeAdapter.sol";
import "../interfaces/IBridgeStargate.sol";
import "../interfaces/ITransferSwapper.sol";
import "../interfaces/IWETH.sol";

contract StargateAdapter is IBridgeAdapter, Ownable {
    using SafeERC20 for IERC20;
    
    address public mainContract;
    mapping(address => bool) public supportedRouters;
    mapping(bytes32 => bool) public transfers;

    event MainContractUpdated(address mainContract);
    event SupportedRouterUpdated(address router, bool enabled);

    modifier onlyMainContract() {
        require(msg.sender == mainContract, "caller is not main contract");
        _;
    }

    constructor(address _mainContract, address[] memory _routers) {
        mainContract = _mainContract;
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
        bytes memory _bridgeParams,
        bytes memory //_requestMessage // Not used for now, as stargate messaging is not supported in this version
    ) external payable onlyMainContract returns (bytes memory bridgeResp) {
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
        StargateParams memory params) private returns (uint64 outboundNonce) {
        IBridgeStargate router = IBridgeStargate(params.router);
        ITransferSwapper main = ITransferSwapper(mainContract);
        if (_token == main.nativeWrap()) {
            IWETH(_token).withdraw(_amount);
            router.swapETH{value: msg.value + _amount}(
                params.stargateDstChainId, 
                payable(mainContract),
                abi.encodePacked(_receiver), 
                _amount, 
                params.minReceivedAmt);
        } else {
            IERC20(_token).approve(address(params.router), _amount);
            router.swap{value: msg.value}(
                params.stargateDstChainId, 
                params.srcPoolId, 
                params.dstPoolId, 
                payable(mainContract), // default to refund to main contract
                _amount,
                params.minReceivedAmt, 
                IBridgeStargate.lzTxObj(0, 0, "0x"), 
                abi.encodePacked(_receiver), 
                bytes("") // not supported additional msg in this version
            );
        }

        // query current nonce
        address stargateInternalBridge;
        if (_token == main.nativeWrap()) {
            stargateInternalBridge = IBridgeStargate(router.stargateRouter()).bridge();
        } else {
            stargateInternalBridge = router.bridge();
        }
        address layerZeroEndpoint = IStargateInternalBridge(stargateInternalBridge).layerZeroEndpoint();
        outboundNonce = ILayerZeroEndpoint(layerZeroEndpoint).getOutboundNonce(params.stargateDstChainId, stargateInternalBridge);
    }

    function updateMainContract(address _mainContract) external onlyOwner {
        mainContract = _mainContract;
        emit MainContractUpdated(_mainContract);
    }

    function setSupportedRouter(address _router, bool _enabled) external onlyOwner {
        bool enabled = supportedRouters[_router];
        require(enabled != _enabled, "nop");
        supportedRouters[_router] = _enabled;
        emit SupportedRouterUpdated(_router, _enabled);
    }

    // This is needed to receive ETH when calling `IWETH.withdraw`
    receive() external payable {}
}
