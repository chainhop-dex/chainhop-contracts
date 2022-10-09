// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.15;

import "../interfaces/IERC20.sol";
import "../interfaces/ICodec.sol";
import "../interfaces/IUniswapV3Pool.sol";
import "../interfaces/IUniswapV2Pair.sol";

contract OneInchCodec is ICodec {
    uint256 private constant _ONE_FOR_ZERO_MASK = 1 << 255;
    uint256 private constant _REVERSE_MASK = 0x8000000000000000000000000000000000000000000000000000000000000000;

    struct OrderRFQ {
        // lowest 64 bits is the order id, next 64 bits is the expiration timestamp
        // highest bit is unwrap WETH flag which is set on taker's side
        // [unwrap eth(1 bit) | unused (127 bits) | expiration timestamp(64 bits) | orderId (64 bits)]
        uint256 info;
        IERC20 makerAsset;
        IERC20 takerAsset;
        address maker;
        address allowedSender; // equals to Zero address on public orders
        uint256 makingAmount;
        uint256 takingAmount;
    }

    struct SwapDesc {
        IERC20 srcToken;
        IERC20 dstToken;
        address payable srcReceiver;
        address payable dstReceiver;
        uint256 amount;
        uint256 minReturnAmount;
        uint256 flags;
        bytes permit;
    }

    function decodeCalldata(ICodec.SwapDescription calldata _swap)
        external
        view
        returns (
            uint256 amountIn,
            address tokenIn,
            address tokenOut
        )
    {
        bytes4 selector = bytes4(_swap.data);
        if (selector == 0xb0431182) {
            // "b0431182": "clipperSwap(address srcToken, address dstToken, uint256 amount, uint256 minReturn)",
            (address srcToken, address dstToken, uint256 amount, ) = abi.decode(
                (_swap.data[4:]),
                (address, address, uint256, uint256)
            );
            return (amount, srcToken, dstToken);
        } else if (selector == 0xd0a3b665) {
            // "d0a3b665": "fillOrderRFQ((uint256 info, address makerAsset, address takerAsset, address maker, address allowedSender, uint256 makingAmount, uint256 takingAmount) order, bytes signature, uint256 makingAmount, uint256 takingAmount)",
            (OrderRFQ memory order, , , ) = abi.decode((_swap.data[4:]), (OrderRFQ, bytes, uint256, uint256));
            return (order.makingAmount, address(order.makerAsset), address(order.takerAsset));
        } else if (selector == 0x7c025200) {
            // "7c025200": "swap(address caller,(address srcToken, address dstToken, address srcReceiver, address dstReceiver, uint256 amount, uint256 minReturnAmount, uint256 flags, bytes permit) desc, bytes data)",
            (, SwapDesc memory desc, ) = abi.decode((_swap.data[4:]), (address, SwapDesc, bytes));
            return (desc.amount, address(desc.srcToken), address(desc.dstToken));
        } else if (selector == 0xe449022e) {
            // "e449022e": "uniswapV3Swap(uint256 amount,uint256 minReturn,uint256[] pools)",
            (uint256 amount, , uint256[] memory pools) = abi.decode((_swap.data[4:]), (uint256, uint256, uint256[]));
            (address srcToken, ) = decodeV3Pool(pools[0]);
            (, address dstToken) = decodeV3Pool(pools[pools.length - 1]);
            return (amount, srcToken, dstToken);
        } else if (selector == 0x2e95b6c8) {
            // "2e95b6c8": "unoswap(address srcToken, uint256 amount, uint256 minReturn, bytes32[] pools)"
            (address srcToken, uint256 amount, , bytes32[] memory pools) = abi.decode(
                (_swap.data[4:]),
                (address, uint256, uint256, bytes32[])
            );
            (, address dstToken) = decodeV2Pool(uint256(pools[pools.length - 1]));
            return (amount, srcToken, dstToken);
        } else {
            // error, unknown selector
            revert("unknown selector");
        }
    }

    function encodeCalldataWithOverride(
        bytes calldata _data,
        uint256 _amountInOverride,
        address _receiverOverride
    ) external pure returns (bytes memory swapCalldata) {
        bytes4 selector = bytes4(_data);
        if (selector == 0xb0431182) {
            // "b0431182": "clipperSwap(address srcToken, address dstToken, uint256 amount, uint256 minReturn)",
            (address srcToken, address dstToken, , uint256 minReturn) = abi.decode(
                (_data[4:]),
                (address, address, uint256, uint256)
            );
            return abi.encodeWithSelector(selector, srcToken, dstToken, _amountInOverride, minReturn);
        } else if (selector == 0xd0a3b665) {
            // "d0a3b665": "fillOrderRFQ((uint256 info, address makerAsset, address takerAsset, address maker, address allowedSender, uint256 makingAmount, uint256 takingAmount) order, bytes signature, uint256 makingAmount, uint256 takingAmount)",
            (OrderRFQ memory order, bytes memory signature, , uint256 takingAmount) = abi.decode(
                (_data[4:]),
                (OrderRFQ, bytes, uint256, uint256)
            );
            order.makingAmount = _amountInOverride;
            return abi.encodeWithSelector(selector, order, signature, _amountInOverride, takingAmount);
        } else if (selector == 0x7c025200) {
            // "7c025200": "swap(address caller,(address srcToken, address dstToken, address srcReceiver, address dstReceiver, uint256 amount, uint256 minReturnAmount, uint256 flags, bytes permit) desc, bytes data)",
            (address caller, SwapDesc memory desc, bytes memory data) = abi.decode(
                (_data[4:]),
                (address, SwapDesc, bytes)
            );
            desc.dstReceiver = payable(_receiverOverride);
            desc.amount = _amountInOverride;
            return abi.encodeWithSelector(selector, caller, desc, data);
        } else if (selector == 0xe449022e) {
            // "e449022e": "uniswapV3Swap(uint256 amount,uint256 minReturn,uint256[] pools)",
            (, uint256 minReturn, uint256[] memory pools) = abi.decode((_data[4:]), (uint256, uint256, uint256[]));
            return abi.encodeWithSelector(selector, _amountInOverride, minReturn, pools);
        } else if (selector == 0x2e95b6c8) {
            // "2e95b6c8": "unoswap(address srcToken, uint256 amount, uint256 minReturn, bytes32[] pools)"
            (address srcToken, , uint256 minReturn, bytes32[] memory pools) = abi.decode(
                (_data[4:]),
                (address, uint256, uint256, bytes32[])
            );
            return abi.encodeWithSelector(selector, srcToken, _amountInOverride, minReturn, pools);
        } else {
            // error, unknown selector
            revert("unknown selector");
        }
    }

    function decodeV3Pool(uint256 pool) private view returns (address srcToken, address dstToken) {
        bool zeroForOne = pool & _ONE_FOR_ZERO_MASK == 0;
        address poolAddr = address(uint160(pool));
        if (zeroForOne) {
            return (IUniswapV3Pool(poolAddr).token0(), IUniswapV3Pool(poolAddr).token1());
        } else {
            return (IUniswapV3Pool(poolAddr).token1(), IUniswapV3Pool(poolAddr).token0());
        }
    }

    function decodeV2Pool(uint256 pool) private view returns (address srcToken, address dstToken) {
        bool zeroForOne = pool & _REVERSE_MASK == 0;
        address poolAddr = address(uint160(pool));
        if (zeroForOne) {
            return (IUniswapV2Pair(poolAddr).token0(), IUniswapV2Pair(poolAddr).token1());
        } else {
            return (IUniswapV2Pair(poolAddr).token1(), IUniswapV2Pair(poolAddr).token0());
        }
    }
}
