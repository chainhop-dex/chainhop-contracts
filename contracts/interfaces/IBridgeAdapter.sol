// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.12;

import "../lib/Common.sol";

interface IBridgeAdapter {
    function bridge(
        bytes32 _id,
        address _bridgeOutReceiver,
        Common.TransferDescription memory _desc,
        ICodec.SwapDescription[] memory _dstSwaps,
        uint256 _amount,
        address _token,
        uint256 _msgFee
    ) external returns (bytes32 transferId);
}
