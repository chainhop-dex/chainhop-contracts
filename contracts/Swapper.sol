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

    /**
     * @dev Checks the input swaps for that tokenIn and tokenOut for every swap should be the same
     * @param _swaps the swaps the check
     * @return sumAmtIn the sum of all amountIns in the swaps
     * @return tokenIn the input token of the swaps
     * @return tokenOut the desired output token of the swaps
     * @return codecs a list of codecs which each of them corresponds to a swap
     */
    function sanitizeSwaps(ICodec.SwapDescription[] memory _swaps)
        internal
        view
        returns (
            uint256 sumAmtIn,
            address tokenIn,
            address tokenOut,
            ICodec[] memory codecs // _codecs[i] is for _swaps[i]
        )
    {
        address prevTokenIn;
        address prevTokenOut;
        codecs = loadCodecs(_swaps);

        for (uint256 i = 0; i < _swaps.length; i++) {
            (uint256 _amountIn, address _tokenIn, address _tokenOut) = codecs[i].decodeCalldata(_swaps[i]);
            require(prevTokenIn == address(0) || prevTokenIn == _tokenIn, "tkin mismatch");
            prevTokenIn = _tokenIn;
            require(prevTokenOut == address(0) || prevTokenOut == _tokenOut, "tko mismatch");
            prevTokenOut = _tokenOut;

            sumAmtIn += _amountIn;
            tokenIn = _tokenIn;
            tokenOut = _tokenOut;
        }
    }

    /**
     * @notice Executes the swaps, decode their return values and sums the returned amount
     * @dev This function is intended to be used on src chain only
     * @dev This function immediately fails (return false) if any swaps fail. There is no "partial fill" on src chain
     * @param _swaps swaps. this function assumes that the swaps are already sanitized
     * @param _codecs the codecs for each swap
     * @return ok whether the operation is successful
     * @return sumAmtOut the sum of all amounts gained from swapping
     */
    function executeSwaps(
        ICodec.SwapDescription[] memory _swaps,
        ICodec[] memory _codecs // _codecs[i] is for _swaps[i]
    ) internal returns (bool ok, uint256 sumAmtOut) {
        for (uint256 i = 0; i < _swaps.length; i++) {
            (uint256 amountIn, address tokenIn, ) = _codecs[i].decodeCalldata(_swaps[i]);
            IERC20(tokenIn).safeIncreaseAllowance(_swaps[i].dex, amountIn);
            bytes memory res;
            (ok, res) = _swaps[i].dex.call(_swaps[i].data);
            if (!ok) {
                return (false, 0);
            }
            sumAmtOut += _codecs[i].decodeReturnData(res);
        }
    }

    /**
     * @notice Executes the swaps with override, redistributes amountIns for each swap route,
     * decode their return values and sums the returned amount
     * @dev This function is intended to be used on dst chain only
     * @param _swaps swaps to execute. this function assumes that the swaps are already sanitized
     * @param _codecs the codecs for each swap
     * @param _amountInOverride the amountIn to substitute the amountIns in swaps for
     * @dev _amountInOverride serves the purpose of correcting the estimated amountIns to actual bridge outs
     * @return sumAmtOut the sum of all amounts gained from swapping
     * @return sumAmtFailed the sum of all amounts that fails to swap
     */
    function executeSwapsWithOverride(
        ICodec.SwapDescription[] memory _swaps,
        ICodec[] memory _codecs, // _codecs[i] is for _swaps[i]
        uint256 _amountInOverride,
        bool _allowPartialFill
    ) internal returns (uint256 sumAmtOut, uint256 sumAmtFailed) {
        (uint256[] memory amountIns, address tokenIn) = _redistributeAmountIn(_swaps, _amountInOverride, _codecs);
        // execute the swaps with adjusted amountIns
        for (uint256 i = 0; i < _swaps.length; i++) {
            (bool ok, uint256 amountOut) = _executeSwapWithOverride(_codecs[i], _swaps[i], tokenIn, amountIns[i]);
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
    ) private view returns (uint256[] memory amountIns, address tokenIn) {
        uint256 sumAmtIn;
        amountIns = new uint256[](_swaps.length);

        // compute sumAmtIn and collect amountIns
        for (uint256 i = 0; i < _swaps.length; i++) {
            uint256 amountIn;
            (amountIn, tokenIn, ) = _codecs[i].decodeCalldata(_swaps[i]);
            sumAmtIn += amountIn;
            amountIns[i] = amountIn;
        }

        // compute adjusted amountIns with regard to the weight of each amountIns in total amountIn
        for (uint256 i = 0; i < amountIns.length; i++) {
            amountIns[i] = (_amountInOverride * amountIns[i]) / sumAmtIn;
        }
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
