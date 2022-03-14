// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.12;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./lib/MessageSenderLib.sol";
import "./lib/MessageReceiverApp.sol";
import "./FeeOperator.sol";
import "./SigVerifier.sol";
import "./Swapper.sol";
import "./interfaces/ICodec.sol";

/**
 * @title An app that enables swapping on a chain, transferring to another chain and swapping
 * another time on the destination chain before sending the result tokens to a user
 */
contract TransferSwapper is MessageReceiverApp, Swapper, SigVerifier, FeeOperator {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    struct TransferDescription {
        address receiver; // the receiving party (the user) of the final output token
        uint64 dstChainId;
        uint32 maxBridgeSlippage;
        MessageSenderLib.BridgeType bridgeType;
        uint64 nonce; // nonce is needed for de-dup tx at this contract and bridge
        bool nativeOut; // whether to unwrap before sending the final token to user
        uint256 fee;
        uint256 feeDeadline; // the unix timestamp before which the fee is valid
        // sig of keccak256(abi.encodePacked("executor fee", feeDeadline, dstChainId, fee))
        bytes feeSig;
        uint256 amountIn; // required if no swap on src chain
        address tokenIn; // required if no swap on src chain
    }

    struct Request {
        bytes32 id;
        ICodec.SwapDescription[] swaps;
        address receiver; // the receiving party (the user) of the final output token
        bool nativeOut;
        uint256 fee;
    }

    enum RequestStatus {
        Null,
        Succeeded,
        Fallback
    }

    // emitted when requested dstChainId == srcChainId, no bridging
    event DirectSwap(bytes32 id, uint256 amountIn, address tokenIn, uint256 amountOut, address tokenOut);
    // emitted when operations on src chain is done, the transfer is sent through the bridge
    event RequestSent(bytes32 id, uint64 dstChainId, uint256 srcAmount, address srcToken, address dstToken);
    // emitted when operations on dst chain is done
    event RequestDone(bytes32 id, uint256 dstAmount, uint256 feeCollected, RequestStatus status);

    // erc20 wrap of the gas token of this chain, e.g. WETH
    address public nativeWrap;

    constructor(
        address _messageBus,
        address _nativeWrap,
        address _signer,
        address _feeCollector,
        string[] memory _funcSigs,
        address[] memory _codex
    ) Codecs(_funcSigs, _codex) FeeOperator(_feeCollector) SigVerifier(_signer) {
        messageBus = _messageBus;
        nativeWrap = _nativeWrap;
    }

    /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
     * Source chain functions
     * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

    function transferWithSwap(
        address _dstTransferSwapper,
        TransferDescription calldata _desc,
        ICodec.SwapDescription[] calldata _srcSwaps,
        ICodec.SwapDescription[] calldata _dstSwaps
    ) external payable {
        // a request needs to incur a swap, a transfer, or both. otherwise it's a nop and we revert early to save gas
        require(_srcSwaps.length != 0 || _desc.dstChainId != uint64(block.chainid), "nop");
        require(_srcSwaps.length != 0 || (_desc.amountIn != 0 && _desc.tokenIn != address(0)), "nop");

        uint256 amountIn = _desc.amountIn;
        address tokenIn = _desc.tokenIn;
        address tokenOut = _desc.tokenIn;
        ICodec[] memory codecs;

        if (_srcSwaps.length != 0) {
            (amountIn, tokenIn, tokenOut, codecs) = sanitizeSwaps(_srcSwaps);
        }
        if (msg.value > 0) {
            // msg value > 0 automatically implies the sender wants to swap native tokens
            require(msg.value >= amountIn, "insfcnt amt"); // insufficient amount
            IWETH(nativeWrap).deposit{value: msg.value}();
        } else {
            IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        }
        // swap if needed
        uint256 amountOut = amountIn;
        if (_srcSwaps.length != 0) {
            bool ok;
            (ok, amountOut) = executeSwaps(_srcSwaps, codecs);
            require(ok, "swap fail");
        }

        bytes32 id = keccak256(abi.encodePacked(msg.sender, _desc.receiver, uint64(block.chainid), _desc.nonce));
        // direct send if needed
        if (_desc.dstChainId == uint64(block.chainid)) {
            emit DirectSwap(id, amountIn, tokenIn, amountOut, tokenOut);
            _sendToken(tokenOut, amountOut, _desc.receiver, _desc.nativeOut);
            return;
        }

        address dstTokenOut = tokenOut;
        if (_dstSwaps.length != 0) {
            (, , dstTokenOut, ) = sanitizeSwaps(_dstSwaps);
        }
        // transfer through bridge
        _transfer(id, _dstTransferSwapper, _desc, _dstSwaps, amountOut, tokenOut);
        emit RequestSent(id, _desc.dstChainId, amountIn, tokenIn, dstTokenOut);
    }

    // for stack too deep
    function _transfer(
        bytes32 _id,
        address _dstTransferSwapper,
        TransferDescription memory _desc,
        ICodec.SwapDescription[] memory _dstSwaps,
        uint256 _amount,
        address _token
    ) private {
        _verifyFee(_desc);
        bytes memory requestMessage = _encodeRequestMessage(_id, _desc, _dstSwaps);
        MessageSenderLib.sendMessageWithTransfer(
            _dstTransferSwapper,
            _token,
            _amount,
            _desc.dstChainId,
            _desc.nonce,
            _desc.maxBridgeSlippage,
            requestMessage,
            _desc.bridgeType,
            messageBus,
            IMessageBus(messageBus).calcFee(requestMessage)
        );
    }

    /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
     * Destination chain functions
     * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

    function executeMessageWithTransfer(
        address, // _sender
        address _token,
        uint256 _amount,
        uint64, // _srcChainId
        bytes memory _message
    ) external payable override onlyMessageBus returns (bool ok) {
        Request memory m = abi.decode((_message), (Request));

        // handle the case where amount received is not enough to pay fee
        if (_amount < m.fee) {
            m.fee = _amount;
            emit RequestDone(m.id, 0, m.fee, RequestStatus.Succeeded);
            return true;
        } else {
            _amount = _amount - m.fee;
        }

        RequestStatus status = RequestStatus.Succeeded;
        address tokenOut = _token;
        bool nativeOut = m.nativeOut;
        uint256 totalAmountOut = _amount;

        if (m.swaps.length != 0) {
            ICodec[] memory codecs;
            address tokenIn;
            // swap first before sending the token out to user
            (, tokenIn, tokenOut, codecs) = sanitizeSwaps(m.swaps);
            require(tokenIn == _token, "tkin mm");
            SwapResult[] memory swapResults = new SwapResult[](m.swaps.length);
            (swapResults, totalAmountOut) = executeSwapsWithOverride(m.swaps, codecs, tokenIn, _amount);
            // this won't work for multi route swaps
            // TODO restructure contracts to handle partial fill & full revert
            ok = swapResults[0].success;
            if (ok) {
                status = RequestStatus.Succeeded;
            } else {
                status = RequestStatus.Fallback;
                // reset token and amount to bridge out token and amount
                totalAmountOut = _amount;
                tokenOut = _token;
            }
        }

        nativeOut = nativeOut && tokenOut == nativeWrap;
        _sendToken(tokenOut, totalAmountOut, m.receiver, nativeOut);
        emit RequestDone(m.id, totalAmountOut, m.fee, status);
    }

    function executeMessageWithTransferFallback(
        address, // _sender
        address _token,
        uint256 _amount,
        uint64, // _srcChainId
        bytes memory _message
    ) external payable override onlyMessageBus returns (bool) {
        Request memory m = abi.decode((_message), (Request));

        uint256 dstAmount = _amount - m.fee;
        _sendToken(_token, dstAmount, m.receiver, false);

        emit RequestDone(m.id, dstAmount, m.fee, RequestStatus.Fallback);
        return true;
    }

    /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
     * Misc
     * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

    function _sendToken(
        address _token,
        uint256 _amount,
        address _receiver,
        bool _nativeOut
    ) private {
        if (_nativeOut) {
            require(_token == nativeWrap, "tk no native");
            IWETH(nativeWrap).withdraw(_amount);
            (bool sent, ) = _receiver.call{value: _amount, gas: 50000}("");
            require(sent, "send fail");
        } else {
            IERC20(_token).safeTransfer(_receiver, _amount);
        }
    }

    function _encodeRequestMessage(
        bytes32 _id,
        TransferDescription memory _desc,
        ICodec.SwapDescription[] memory _swaps
    ) private pure returns (bytes memory message) {
        message = abi.encode(
            Request({id: _id, swaps: _swaps, receiver: _desc.receiver, nativeOut: _desc.nativeOut, fee: _desc.fee})
        );
    }

    function _verifyFee(TransferDescription memory _desc) private view {
        bytes32 hash = keccak256(abi.encodePacked("executor fee", _desc.feeDeadline, _desc.dstChainId, _desc.fee));
        bytes32 signHash = hash.toEthSignedMessageHash();
        verifySig(signHash, _desc.feeSig);
        require(_desc.feeDeadline > block.timestamp, "deadline exceeded");
    }

    function setNativeWrap(address _nativeWrap) external onlyOwner {
        nativeWrap = _nativeWrap;
    }

    // This is needed to receive ETH when calling `IWETH.withdraw`
    receive() external payable {}
}
