// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.8.15;

import "../lib/Types.sol";

interface ITransferSwapperEvents {
    /**
     * @notice Emitted when operations on src chain is done, the transfer is sent through the bridge
     * @param id see _computeId()
     * @param dstChainId destination chain id
     * @param srcAmountIn input amount approved by the sender
     * @param srcTokenIn the input token approved by the sender
     * @param srcAmountOut the output amount after the execution on src chain
     * @param srcTokenOut the output token after the execution on src chain. (i.e. swap output token or bridge input token)
     * @param bridgeOutReceiver the receiver (user or a pocket addr) of the bridge token
     * @param dstTokenOut the final output token (after bridging and swapping) desired by the sender
     * @param bridgeProvider the bridge provider
     * @param bridgeResp arbitrary response data returned by bridge
     */
    event SrcExecuted(
        bytes32 id,
        uint64 dstChainId,
        uint256 srcAmountIn,
        address srcTokenIn,
        uint256 srcAmountOut,
        address srcTokenOut,
        address dstTokenOut,
        string bridgeProvider,
        address bridgeOutReceiver,
        bytes bridgeResp
    );

    /**
     * @notice Emitted when operations on dst chain is done.
     * @param id see _computeId()
     * @param dstAmountOut the final output token (after bridging and swapping) desired by the sender
     * @param refundAmount the amount refunded to the receiver in bridge token
     * @param bridgeOutToken bridge out token
     * @param feeCollected the fee chainhop deducts from bridge out token
     * @param status see RequestStatus
     */
    event DstExecuted(
        bytes32 id,
        uint256 dstAmountOut,
        uint256 refundAmount,
        address bridgeOutToken,
        uint256 feeCollected,
        Types.RequestStatus status,
        bytes forwardResp
    );

    event PocketFundClaimed(address receiver, uint256 erc20Amount, address token, uint256 nativeAmount);
}
