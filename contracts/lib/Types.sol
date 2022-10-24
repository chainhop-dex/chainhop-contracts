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
     * @param Fallback Swaps have failed on the dst chain, and bridge tokens are refunded to receiver
     */
    enum RequestStatus {
        Null,
        Succeeded,
        Fallback
    }

    struct Request {
        bytes32 id; // see _computeId()
        ICodec.SwapDescription[] swaps; // the swaps need to happen on the destination chain
        address receiver; // see TransferDescription.receiver
        address bridgeOutToken;
        bool nativeOut; // see TransferDescription.nativeOut
        uint256 fee; // see TransferDescription.fee
        // used as a counter measure to the DoS attack vector described in TransferSwapper
        uint256 bridgeOutMin;
        // sets if another cbridge hop is required on the chain, abi.encode(Forward)
        bytes forward;
    }

    struct Forward {
        uint64 dstChain;
        // abi encoded cbridge params
        bytes params;
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
        bool nativeIn; // whether to check msg.value and wrap token before swapping/sending
        bool nativeOut; // whether to unwrap before sending the final token to user
        uint256 fee; // this fee is only executor fee. it does not include msg bridge fee
        uint256 feeDeadline; // the unix timestamp before which the fee is valid
        // sig of sha3("executor fee", srcChainId, dstChainId, amountIn, tokenIn, feeDeadline, fee)
        // see _verifyFee()
        bytes feeSig;
        uint256 amountIn;
        address tokenIn;
        address dstTokenOut; // the final output token, emitted in event for display purpose only
        // sets if another cbridge hop is required on the dst chain, abi.encode(Forward)
        bytes forward;
    }
}
