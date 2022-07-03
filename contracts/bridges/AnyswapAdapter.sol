// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "../interfaces/IBridgeAdapter.sol";
import "../interfaces/IBridgeAnyswap.sol";

contract AnyswapAdapter is IBridgeAdapter, Ownable {
    address public mainContract;
    address public immutable anyswapRouter;
    mapping(bytes32 => bool) public transfers;

    event MainContractUpdated(address mainContract);

    modifier onlyMainContract() {
        require(msg.sender == mainContract, "caller is not main contract");
        _;
    }

    constructor(address _mainContract, address _anyswapRouter) {
        mainContract = _mainContract;
        anyswapRouter = _anyswapRouter;
    }

    struct AnyswapParams {
        // a unique identifier that is uses to dedup transfers
        // this value is the a timestamp sent from frontend, but in theory can be any unique number
        uint64 nonce;
        // the wrapped any token of the native
        address anyToken;
    }

    function bridge(
        uint64 _dstChainId,
        address _receiver,
        uint256 _amount,
        address _token, // Note, here uses the address of the native
        bytes memory _bridgeParams,
        bytes memory _requestMessage // Not used for now, as Anyswap messaging is not supported in this version
    ) external payable onlyMainContract returns (bytes32 transferId) {
        AnyswapParams memory params = abi.decode((_bridgeParams), (AnyswapParams));
        
        transferId = keccak256(
            abi.encodePacked(_receiver, _token, _amount, _dstChainId, params.nonce, uint64(block.chainid))
        );
        require(transfers[transferId] == false, "transfer exists");
        transfers[transferId] = true;

        IERC20(_token).transferFrom(msg.sender, address(this), _amount);
        IERC20(_token).approve(address(anyswapRouter), _amount);
        IBridgeAnyswap(anyswapRouter).anySwapOutUnderlying(params.anyToken, _receiver, _amount, _dstChainId);
    }

    function updateMainContract(address _mainContract) external onlyOwner {
        mainContract = _mainContract;
        emit MainContractUpdated(_mainContract);
    }
}
