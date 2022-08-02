// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.15;

interface IMulticall2 {
    struct Call {
        address target;
        bytes callData;
    }
    struct Result {
        bool success;
        bytes returnData;
    }

    function tryBlockAndAggregate(bool requireSuccess, Call[] memory calls)
        external
        returns (
            uint256 blockNumber,
            bytes32 blockHash,
            Result[] memory returnData
        );
}
