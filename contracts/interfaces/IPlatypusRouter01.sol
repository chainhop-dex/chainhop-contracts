// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.15;

interface IPlatypusRouter01 {
    /// @notice swapExactTokensForTokens swaps
    /// @param tokenPath An array of token addresses. path.length must be >= 2.
    /// @param tokenPath The first element of the path is the input token, the last element is the output token.
    /// @param poolPath An array of pool addresses. The pools where the pathTokens are contained in order.
    /// @param fromAmount the amount in
    /// @param minimumToAmount the minimum amount to get for user
    /// @param to the user to send the tokens to
    /// @param deadline the deadline to respect
    /// @return amountOut received by user
    /// @return haircut total fee charged by pool
    function swapTokensForTokens(
        address[] calldata tokenPath,
        address[] calldata poolPath,
        uint256 fromAmount,
        uint256 minimumToAmount,
        address to,
        uint256 deadline
    ) external returns (uint256 amountOut, uint256 haircut);

    /**
     * @notice Quotes potential outcome of a swap given current tokenPath and poolPath,
     taking in account slippage and haircut
     * @dev To be used by frontend
     * @param tokenPath The token swap path
     * @param poolPath The token pool path
     * @param fromAmount The amount to quote
     * @return potentialOutcome The potential final amount user would receive
     * @return haircut The total haircut that would be applied
     */
    function quotePotentialSwaps(
        address[] calldata tokenPath,
        address[] calldata poolPath,
        uint256 fromAmount
    ) external view returns (uint256 potentialOutcome, uint256 haircut);
}
