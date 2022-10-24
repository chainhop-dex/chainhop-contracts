// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.15;

import "./IMessageReceiverApp.sol";

interface ITransferSwapper {
    function nativeWrap() external view returns (address);

    /**
     * @notice Marks the request as done
     * @dev only cbridge adapter can call this function
     * @param _id the id of the swap request
     * @param _token the token refunded to the user
     * @param _amount the amount of token refunded to the user
     */
    function refundCallback(
        bytes32 _id,
        address _token,
        uint256 _amount
    ) external;
}
