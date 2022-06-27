// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.8.12;

import "./MsgDataTypes.sol";
import "../interfaces/ICodec.sol";

library Common {
    struct Request {
        bytes32 id; // see _computeId()
        ICodec.SwapDescription[] swaps; // the swaps need to happen on the destination chain
        address receiver; // see TransferDescription.receiver
        bool nativeOut; // see TransferDescription.nativeOut
        uint256 fee; // see TransferDescription.fee
        bool allowPartialFill; // see TransferDescription.allowPartialFill
    }

    struct TransferDescription {
        address receiver; // the receiving party (the user) of the final output token
        uint64 dstChainId; // destination chain id
        uint32 maxBridgeSlippage; // user defined maximum allowed slippage (pip) at bridge
        MsgDataTypes.BridgeSendType bridgeType; // type of the bridge to use
        uint64 nonce; // nonce is needed for de-dup tx at this contract and bridge
        bool nativeIn; // whether to check msg.value and wrap token before swapping/sending
        bool nativeOut; // whether to unwrap before sending the final token to user
        uint256 fee; // this fee is only executor fee. it does not include msg bridge fee
        uint256 feeDeadline; // the unix timestamp before which the fee is valid
        // sig of sha3("executor fee", srcChainId, dstChainId, amountIn, tokenIn, feeDeadline, fee)
        // see _verifyFee()
        bytes feeSig;
        // IMPORTANT: amountIn and tokenIn are completely ignored if src chain has a swap
        // these two fields are only meant for the scenario where no swaps are needed on src chain
        uint256 amountIn;
        address tokenIn;
        // if this field is set, this contract attempts to wrap the input OR src bridge out token
        // (as specified in the tokenIn field OR the output token in src SwapDescription[]) before
        // sending to the bridge. This field is determined by the backend when searching for routes
        address wrappedBridgeToken;
        address dstTokenOut; // the final output token, emitted in event for display purpose only
        // in case of multi route swaps, whether to allow the successful swaps to go through
        // and sending the amountIn of the failed swaps back to user
        bool allowPartialFill;
    }

    function encodeRequestMessage(
        bytes32 _id,
        TransferDescription memory _desc,
        ICodec.SwapDescription[] memory _swaps
    ) internal pure returns (bytes memory message) {
        message = abi.encode(
            Request({
                id: _id,
                swaps: _swaps,
                receiver: _desc.receiver,
                nativeOut: _desc.nativeOut,
                fee: _desc.fee,
                allowPartialFill: _desc.allowPartialFill
            })
        );
    }
}