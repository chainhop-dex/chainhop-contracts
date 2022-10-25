// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.8.15;

import "../lib/Types.sol";

interface ITransferSwapperEvents {
    /**
     * @notice Emitted when requested dstChainId == srcChainId, no bridging
     * @param id see _computeId()
     * @param amountIn the input amount approved by the sender
     * @param tokenIn the input token approved by the sender
     * @param amountOut the output amount gained after swapping using the input tokens
     * @param tokenOut the output token gained after swapping using the input tokens
     */
    event DirectSwap(bytes32 id, uint256 amountIn, address tokenIn, uint256 amountOut, address tokenOut);

    /**
     * @notice Emitted when operations on src chain is done, the transfer is sent through the bridge
     * @param id see _computeId()
     * @param bridgeResp arbitrary response data returned by bridge
     * @param dstChainId destination chain id
     * @param srcAmount input amount approved by the sender
     * @param srcToken the input token approved by the sender
     * @param dstToken the final output token (after bridging and swapping) desired by the sender
     * @param bridgeOutReceiver the receiver (user or dst TransferSwapper) of the bridge token
     * @param bridgeToken the token used for bridging
     * @param bridgeAmount the amount of the bridgeToken to bridge
     * @param bridgeProvider the bridge provider
     */
    event RequestSent(
        bytes32 id,
        bytes bridgeResp,
        uint64 dstChainId,
        uint256 srcAmount,
        address srcToken,
        address dstToken,
        address bridgeOutReceiver,
        address bridgeToken,
        uint256 bridgeAmount,
        string bridgeProvider
    );

    /**
     * @notice Emitted when operations on dst chain is done.
     * @param id see _computeId()
     * @param dstAmount the final output token (after bridging and swapping) desired by the sender
     * @param refundAmount the amount refunded to the receiver in bridge token
     * @param bridgeOutToken bridge out token
     * @param feeCollected the fee chainhop deducts from bridge out token
     * @param status see RequestStatus
     */
    event RequestDone(
        bytes32 id,
        uint256 dstAmount,
        uint256 refundAmount,
        address bridgeOutToken,
        uint256 feeCollected,
        Types.RequestStatus status,
        bytes forwardResp
    );

    event PocketFundClaimed(address receiver, uint256 erc20Amount, address token, uint256 nativeAmount);
}
