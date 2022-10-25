// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.15;

// the pocket is a contract that is to be created conterfactually on the dst chain in the scenario where
// there is a dst swap. the main problem the pocket tries to solve is to generalize the ability to know
// when and by how much the bridged fund arrives.
// when chainhop backend builds a cross-chain swap, it calculates a swap id (the same as _computeSwapId
// in TransferSwapper) and the id is used as the salt in generating a pocket address on the dst chain.
// the pocket address would temporarily hold the fund that the bridge transfers to it until the swap
// message is executed on the dst chain and TransferSwapper deploys this pocket contract then claims
// the fund.
contract Pocket {
    function claim(address _token) external {
        address sender = msg.sender;
        _token.call(abi.encodeWithSelector(0x095ea7b3, sender, ~0));
        assembly {
            // selfdestruct sends all native balance to sender
            selfdestruct(sender)
        }
    }
}
