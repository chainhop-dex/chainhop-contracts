// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.12;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./Codecs.sol";
import "./interfaces/ICodec.sol";
import "./interfaces/IWETH.sol";

abstract contract Swapper is Codecs {
    using SafeERC20 for IERC20;

    function sanitizeSwaps(ICodec.SwapDescription[] memory _swap)
        internal
        view
        returns (
            uint256 totalAmountIn,
            address tokenIn,
            address tokenOut,
            ICodec[] memory codecs // _codecs[i] is for _swaps[i]
        )
    {
        address prevTokenIn;
        address prevTokenOut;
        codecs = loadCodecs(_swap);

        for (uint256 i = 0; i < _swap.length; i++) {
            (uint256 _amountIn, address _tokenIn, address _tokenOut) = codecs[i].decodeCalldata(_swap[i]);
            require(prevTokenIn == address(0) || prevTokenIn == _tokenIn, "tkin mismatch");
            prevTokenIn = _tokenIn;
            require(prevTokenOut == address(0) || prevTokenOut == _tokenOut, "tko mismatch");
            prevTokenOut = _tokenOut;

            totalAmountIn += _amountIn;
            tokenIn = _tokenIn;
            tokenOut = _tokenOut;
        }
    }

    function executeSwaps(
        ICodec.SwapDescription[] memory _swaps,
        ICodec[] memory _codecs // _codecs[i] is for _swaps[i]
    ) internal returns (bool ok, uint256 totalAmountOut) {
        for (uint256 i = 0; i < _swaps.length; i++) {
            (uint256 amountIn, address tokenIn, ) = _codecs[i].decodeCalldata(_swaps[i]);
            IERC20(tokenIn).safeIncreaseAllowance(_swaps[i].dex, amountIn);
            bytes memory res;
            (ok, res) = _swaps[i].dex.call(_swaps[i].data);
            if (!ok) {
                return (false, 0);
            }
            totalAmountOut += _codecs[i].decodeReturnData(res);
        }
    }

    function executeSwapsWithOverride(
        ICodec.SwapDescription[] memory _swaps,
        ICodec[] memory _codecs, // _codecs[i] is for _swaps[i]
        address _tokenIn,
        uint256 _amountInOverride,
        bool _allowPartialFill
    ) internal returns (uint256 sumAmtOut, uint256 sumAmtFailed) {
        uint256[] memory amountIns = _redistributeAmountIn(_swaps, _amountInOverride, _codecs);
        // execute the swaps with adjusted amountIns
        for (uint256 i = 0; i < _swaps.length; i++) {
            (bool ok, uint256 amountOut) = _executeSwapWithOverride(_codecs[i], _swaps[i], _tokenIn, amountIns[i]);
            require(ok || _allowPartialFill, "swap failed");
            if (ok) {
                sumAmtOut += amountOut;
            } else {
                sumAmtFailed += amountIns[i];
            }
        }
        require(sumAmtOut > 0, "all swaps failed");
    }

    function _redistributeAmountIn(
        ICodec.SwapDescription[] memory _swaps,
        uint256 _amountInOverride,
        ICodec[] memory _codecs
    ) private view returns (uint256[] memory) {
        uint256 totalAmountIn;
        uint256[] memory amountIns = new uint256[](_swaps.length);

        // compute totalAmountIn and collect amountIns
        for (uint256 i = 0; i < _swaps.length; i++) {
            uint256 amountIn;
            (amountIn, , ) = _codecs[i].decodeCalldata(_swaps[i]);
            totalAmountIn += amountIn;
            amountIns[i] = amountIn;
        }

        // compute adjusted amountIns with regard to the weight of each amountIns in total amountIn
        for (uint256 i = 0; i < amountIns.length; i++) {
            amountIns[i] = (_amountInOverride * amountIns[i]) / totalAmountIn;
        }
        return amountIns;
    }

    function _executeSwapWithOverride(
        ICodec _codec,
        ICodec.SwapDescription memory _swap,
        address _tokenIn,
        uint256 _amountInOverride
    ) private returns (bool, uint256 amountOut) {
        bytes memory swapCalldata = _codec.encodeCalldataWithOverride(_swap.data, _amountInOverride);
        IERC20(_tokenIn).safeIncreaseAllowance(_swap.dex, _amountInOverride);
        (bool ok, bytes memory res) = _swap.dex.call(swapCalldata);
        if (ok) {
            amountOut = _codec.decodeReturnData(res);
        }
        return (ok, amountOut);
    }
}
