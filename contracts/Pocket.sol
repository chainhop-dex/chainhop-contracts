// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.15;

contract Pocket {
    function claim(address _token) external {
        address sender = msg.sender;
        _token.call(abi.encodeWithSelector(0x095ea7b3, sender, ~0));
        assembly {
            selfdestruct(sender)
        }
    }
}
