// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.15;

contract NativePocket {
    constructor() {
        address sender = msg.sender;
        assembly {
            selfdestruct(sender)
        }
    }
}
