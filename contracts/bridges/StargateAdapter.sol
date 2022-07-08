// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.15;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "../interfaces/IBridgeAdapter.sol";
import "../interfaces/IBridgeStargate.sol";

contract AnyswapAdapter is IBridgeAdapter, Ownable {
    address public mainContract;
    address public immutable stargateRouter;
    mapping(bytes32 => bool) public transfers;

    event MainContractUpdated(address mainContract);

    modifier onlyMainContract() {
        require(msg.sender == mainContract, "caller is not main contract");
        _;
    }

    constructor(address _mainContract, address _stargateRouter) {
        mainContract = _mainContract;
        stargateRouter = _stargateRouter;
    }

    struct StargateParams {
        // a unique identifier that is uses to dedup transfers
        // this value is the a timestamp sent from frontend, but in theory can be any unique number
        uint64 nonce;
        uint256 srcPoolId;
        uint256 dstPoolId;
        uint256 minReceivedAmt; // defines the slippage, the min qty you would accept on the destination
        uint16 stargateDstChainId; // stargate defines chain id in its way
    }

    function bridge(
        uint64 _dstChainId,
        address _receiver,
        uint256 _amount,
        address _token,
        bytes memory _bridgeParams,
        bytes memory _requestMessage // Not used for now, as stargate messaging is not supported in this version
    ) external payable onlyMainContract returns (bytes memory bridgeResp) {
        StargateParams memory params = abi.decode((_bridgeParams), (StargateParams));
        
        bytes32 transferId = keccak256(
            abi.encodePacked(_receiver, _token, _amount, _dstChainId, params.nonce, uint64(block.chainid))
        );
        require(transfers[transferId] == false, "transfer exists");
        transfers[transferId] = true;
        IERC20(_token).transferFrom(msg.sender, address(this), _amount);
        IERC20(_token).approve(address(stargateRouter), _amount);
        
        uint64 outboundNonce = swap(_receiver, _amount, params);
        return abi.encodePacked(outboundNonce);
    }

    function swap(
        address _receiver,
        uint256 _amount,
        StargateParams memory params) private returns (uint64 outboundNonce) {
        IBridgeStargate router = IBridgeStargate(stargateRouter);
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

        // query current nonce
        address stargateInternalBridge = router.bridge();
        address layerZeroEndpoint = IStargateInternalBridge(stargateInternalBridge).layerZeroEndpoint();
        outboundNonce = ILayerZeroEndpoint(layerZeroEndpoint).getOutboundNonce(params.stargateDstChainId, stargateInternalBridge);
    }

    function updateMainContract(address _mainContract) external onlyOwner {
        mainContract = _mainContract;
        emit MainContractUpdated(_mainContract);
    }
}
