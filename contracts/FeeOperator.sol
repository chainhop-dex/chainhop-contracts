// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

abstract contract FeeOperator is Ownable {
    address public feeCollector;

    modifier onlyFeeCollector() {
        require(msg.sender == feeCollector, "not fee collector");
        _;
    }

    constructor(address _feeCollector) {
        feeCollector = _feeCollector;
    }

    function collectFee(address[] calldata _tokens, address _to) external onlyFeeCollector {
        for (uint256 i = 0; i < _tokens.length; i++) {
            uint256 balance = IERC20(_tokens[i]).balanceOf(address(this));
            IERC20(_tokens[i]).transfer(_to, balance);
        }
    }

    function setFeeCollector(address _feeCollector) external onlyOwner {
        feeCollector = _feeCollector;
    }
}
