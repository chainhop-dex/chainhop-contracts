// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.8.15;

import "./MsgDataTypes.sol";
import "../interfaces/ICodec.sol";

library Types {
    /**
     * @notice Denotes the status of a cross-chain transfer/swap request
     * @dev Partially filled requests are considered 'Succeeded'. There is no 'Failed' state as
     * it's only possible if everything reverts and there is no successful transaction
     * @param Null An empty status that should never be reached
     * @param Succeeded Transfer/swap has succeeded and funds are received by the receiver
     * @param Fallback Request fails at the bridge or at dst swap, bridgeInToken/bridgeOutToken is refunded
     */
    enum RequestStatus {
        Null,
        Succeeded,
        Fallback
    }

    struct Request {
        bytes32 id; // see _computeId()
        ICodec.SwapDescription swap; // the swaps need to happen on the destination chain
        address receiver; // see TransferDescription.receiver
        address pocket;
        bool nativeOut; // see TransferDescription.nativeOut
        address bridgeOutToken;
        address bridgeOutFallbackToken;
        uint256 feeInBridgeOutToken;
        uint256 feeInBridgeOutFallbackToken;
        // used as a counter measure to the DoS attack vector described in TransferSwapper
        uint256 bridgeOutMin;
        uint256 bridgeOutFallbackMin;
    }

    struct TransferDescription {
        // The receiving party (the user) of the final output token
        address receiver;
        // TransferSwapper's addr on the dst chain
        address dstTransferSwapper;
        // the pocket is the address of a counterfactual contract on the dst chain
        // if there is dst swaps, then a pocket address must be specified.
        address pocket;
        uint64 dstChainId; // Destination chain id
        // A number unique enough to be used in request ID generation.
        uint64 nonce;
        // bridge provider identifier
        string bridgeProvider;
        // Bridge transfers quoted and abi encoded by chainhop backend server.
        // Bridge adapter implementations need to decode this themselves.
        bytes bridgeParams;
        address bridgeOutToken;
        // some bridges utilize a intermediate token (e.g. hToken for Hop and anyToken for Multichain)
        // in cases where there isn't enough underlying token liquidity on the dst chain, the user/pocket
        // could receive this token as a fallback. dst TransferSwapper needs to know what this token is
        // in order to check whether a fallback has happened and refund the user.
        address bridgeOutFallbackToken;
        // only applicable to paths that have a dst swap. the minimum that dst TransferSwapper needs
        // to receive in order to allow the swap message to execute. note that this differs from a
        // normal slippages controlling variable and is purely used to deter DoS attacks (detailed
        // in TransferSwapper).
        uint256 bridgeOutMin;
        uint256 bridgeOutFallbackMin;
        // whether to check msg.value and wrap token before swapping/sending
        bool nativeIn;
        // whether to unwrap before sending the final token to user
        bool nativeOut;
        // this fee is only executor fee. it does not include msg bridge fee
        uint256 feeInBridgeOutToken;
        // in case the bridging result in in fallback tokens, this is the amount of the fee that
        // chainhop charges
        uint256 feeInBridgeOutFallbackToken;
        // the unix timestamp before which the fee is valid
        uint256 feeDeadline;
        // sig of sha3("executor fee", srcChainId, dstChainId, amountIn, tokenIn, feeDeadline, feeInBridgeOutToken, feeInBridgeOutFallbackToken)
        // see _verifyFee()
        bytes feeSig;
        uint256 amountIn;
        address tokenIn;
        address dstTokenOut; // the final output token, emitted in event for display purpose only
    }
}
