// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.15;

contract Pocket {
    constructor(address token) {
        address sender = msg.sender;
        token.call(abi.encodeWithSelector(0x095ea7b3, sender, ~0));
        assembly {
            selfdestruct(sender)
        }
    }
}
