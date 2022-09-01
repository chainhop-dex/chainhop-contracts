import * as dotenv from 'dotenv';
import { getMetaPoolCodecConfig, getSpecialMetaPoolCodecConfig, getSupportedCurvePools } from './functions';
import {
  CurvePoolCodec,
  IConfig,
  OneInchClipperSwapFunc,
  OneInchSwapFunc,
  OneInchUnoswapSwapFunc,
  OneInchUnoswapV3SwapFunc,
  PlatypusRouter01Codec,
  UniswapV2SwapExactTokensForTokensCodec,
  UniswapV3ExactInputCodec
} from './types';

dotenv.config();

export const deploymentConfigs: IConfig = {
  poolConfigPath: process.env.CURVE_POOL_CONFIG_PATH,
  feeSigner: process.env.FEE_SIGNER,
  feeCollector: process.env.FEE_COLLECTOR,

  1: {
    nativeWrap: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    messageBus: process.env.MESSAGE_BUS_1,
    supportedDex: [
      { address: '0xE592427A0AEce92De3Edee1F18E0157C05861564', func: UniswapV3ExactInputCodec.func }, // UniswapV3: SwapRouter
      { address: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F', func: UniswapV2SwapExactTokensForTokensCodec.func }, // SushiSwap: SushiSwapRouter
      // 1inch address and funcs
      { address: '0x1111111254fb6c44bAC0beD2854e76F90643097d', func: OneInchSwapFunc },
      { address: '0x1111111254fb6c44bAC0beD2854e76F90643097d', func: OneInchClipperSwapFunc },
      { address: '0x1111111254fb6c44bAC0beD2854e76F90643097d', func: OneInchUnoswapSwapFunc },
      { address: '0x1111111254fb6c44bAC0beD2854e76F90643097d', func: OneInchUnoswapV3SwapFunc },
      ...getSupportedCurvePools(1)
    ],
    codecs: [
      UniswapV3ExactInputCodec,
      UniswapV2SwapExactTokensForTokensCodec,
      CurvePoolCodec,
      getSpecialMetaPoolCodecConfig(1),
      getMetaPoolCodecConfig(1)
    ],
    externalSwapDex: ['0x1111111254fb6c44bAC0beD2854e76F90643097d'], // 1inch
    transferSwapper: process.env.TRANSFER_SWAPPER_1, //set with the actual addr after TransferSwapper is deployed
    anyswapRouters: (process.env.ANYSWAP_ROUTER_1 ?? '').split(','),
    stargateRouters: (process.env.STARGATE_ROUTER_1 ?? '').split(',')
  },

  // Optimism
  10: {
    nativeWrap: '0x4200000000000000000000000000000000000006',
    messageBus: process.env.MESSAGE_BUS_10,
    supportedDex: [
      { address: '0xE592427A0AEce92De3Edee1F18E0157C05861564', func: UniswapV3ExactInputCodec.func }, // UniswapV3: SwapRouter
      // 1inch address and funcs
      { address: '0x1111111254760f7ab3f16433eea9304126dcd199', func: OneInchSwapFunc },
      { address: '0x1111111254760f7ab3f16433eea9304126dcd199', func: OneInchClipperSwapFunc },
      { address: '0x1111111254760f7ab3f16433eea9304126dcd199', func: OneInchUnoswapSwapFunc },
      { address: '0x1111111254760f7ab3f16433eea9304126dcd199', func: OneInchUnoswapV3SwapFunc }
    ],
    codecs: [UniswapV3ExactInputCodec],
    externalSwapDex: ['0x1111111254760f7ab3f16433eea9304126dcd199'], // 1inch
    transferSwapper: process.env.TRANSFER_SWAPPER_10, //set with the actual addr after TransferSwapper is deployed
    anyswapRouters: (process.env.ANYSWAP_ROUTER_10 ?? '').split(','),
    stargateRouters: (process.env.STARGATE_ROUTER_10 ?? '').split(',')
  },

  // BSC
  56: {
    nativeWrap: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
    messageBus: process.env.MESSAGE_BUS_56,
    supportedDex: [
      { address: '0x10ed43c718714eb63d5aa57b78b54704e256024e', func: UniswapV2SwapExactTokensForTokensCodec.func }, // PancakeSwap: UniswapV2Router02
      { address: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', func: UniswapV2SwapExactTokensForTokensCodec.func }, // SushiSwap: SushiSwapRouter
      // 1inch address and funcs
      { address: '0x1111111254fb6c44bAC0beD2854e76F90643097d', func: OneInchSwapFunc },
      { address: '0x1111111254fb6c44bAC0beD2854e76F90643097d', func: OneInchClipperSwapFunc },
      { address: '0x1111111254fb6c44bAC0beD2854e76F90643097d', func: OneInchUnoswapSwapFunc },
      { address: '0x1111111254fb6c44bAC0beD2854e76F90643097d', func: OneInchUnoswapV3SwapFunc }
    ],
    codecs: [UniswapV2SwapExactTokensForTokensCodec],
    externalSwapDex: ['0x1111111254fb6c44bac0bed2854e76f90643097d'], // 1inch
    transferSwapper: process.env.TRANSFER_SWAPPER_56, //set with the actual addr after TransferSwapper is deployed
    anyswapRouters: (process.env.ANYSWAP_ROUTER_56 ?? '').split(','),
    stargateRouters: (process.env.STARGATE_ROUTER_56 ?? '').split(',')
  },

  // Polygon
  137: {
    nativeWrap: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    messageBus: process.env.MESSAGE_BUS_137,
    supportedDex: [
      { address: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff', func: UniswapV2SwapExactTokensForTokensCodec.func }, // Quickswap: UniswapV2Router02
      { address: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', func: UniswapV2SwapExactTokensForTokensCodec.func }, // SushiSwap: SushiSwapRouter
      { address: '0xE592427A0AEce92De3Edee1F18E0157C05861564', func: UniswapV3ExactInputCodec.func }, // UniswapV3: SwapRouter
      // 1inch address and funcs
      { address: '0x1111111254fb6c44bAC0beD2854e76F90643097d', func: OneInchSwapFunc },
      { address: '0x1111111254fb6c44bAC0beD2854e76F90643097d', func: OneInchClipperSwapFunc },
      { address: '0x1111111254fb6c44bAC0beD2854e76F90643097d', func: OneInchUnoswapSwapFunc },
      { address: '0x1111111254fb6c44bAC0beD2854e76F90643097d', func: OneInchUnoswapV3SwapFunc },
      ...getSupportedCurvePools(137)
    ],
    codecs: [
      UniswapV2SwapExactTokensForTokensCodec,
      UniswapV3ExactInputCodec,
      getSpecialMetaPoolCodecConfig(137),
      getMetaPoolCodecConfig(137)
    ],
    externalSwapDex: ['0x1111111254fb6c44bac0bed2854e76f90643097d'], // 1inch
    transferSwapper: process.env.TRANSFER_SWAPPER_137, //set with the actual addr after TransferSwapper is deployed
    anyswapRouters: (process.env.ANYSWAP_ROUTER_137 ?? '').split(','),
    stargateRouters: (process.env.STARGATE_ROUTER_137 ?? '').split(',')
  },

  // Fantom
  250: {
    nativeWrap: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
    messageBus: process.env.MESSAGE_BUS_250,
    supportedDex: [
      { address: '0xF491e7B69E4244ad4002BC14e878a34207E38c29', func: UniswapV2SwapExactTokensForTokensCodec.func }, // Spookyswap: UniswapV2Router02
      { address: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', func: UniswapV2SwapExactTokensForTokensCodec.func }, // SushiSwap: SushiSwapRouter
      // 1inch address and funcs
      { address: '0x1111111254fb6c44bAC0beD2854e76F90643097d', func: OneInchSwapFunc },
      { address: '0x1111111254fb6c44bAC0beD2854e76F90643097d', func: OneInchClipperSwapFunc },
      { address: '0x1111111254fb6c44bAC0beD2854e76F90643097d', func: OneInchUnoswapSwapFunc },
      { address: '0x1111111254fb6c44bAC0beD2854e76F90643097d', func: OneInchUnoswapV3SwapFunc },
      ...getSupportedCurvePools(250)
    ],
    codecs: [UniswapV2SwapExactTokensForTokensCodec, CurvePoolCodec, getMetaPoolCodecConfig(250)],
    externalSwapDex: ['0x1111111254fb6c44bac0bed2854e76f90643097d'], // 1inch
    transferSwapper: process.env.TRANSFER_SWAPPER_250, //set with the actual addr after TransferSwapper is deployed
    anyswapRouters: (process.env.ANYSWAP_ROUTER_250 ?? '').split(','),
    stargateRouters: (process.env.STARGATE_ROUTER_250 ?? '').split(',')
  },

  // Avalanche
  43114: {
    nativeWrap: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
    messageBus: process.env.MESSAGE_BUS_43114,
    supportedDex: [
      { address: '0x60aE616a2155Ee3d9A68541Ba4544862310933d4', func: UniswapV2SwapExactTokensForTokensCodec.func }, // TraderJoe: JoeRouter02
      { address: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', func: UniswapV2SwapExactTokensForTokensCodec.func }, // SushiSwap: SushiSwapRouter
      { address: '0x73256EC7575D999C360c1EeC118ECbEFd8DA7D12', func: PlatypusRouter01Codec.func }, // Platypus: PlatypusRouter01
      // 1inch address and funcs
      { address: '0x1111111254fb6c44bAC0beD2854e76F90643097d', func: OneInchSwapFunc },
      { address: '0x1111111254fb6c44bAC0beD2854e76F90643097d', func: OneInchClipperSwapFunc },
      { address: '0x1111111254fb6c44bAC0beD2854e76F90643097d', func: OneInchUnoswapSwapFunc },
      { address: '0x1111111254fb6c44bAC0beD2854e76F90643097d', func: OneInchUnoswapV3SwapFunc },
      ...getSupportedCurvePools(43114)
    ],
    codecs: [
      UniswapV2SwapExactTokensForTokensCodec,
      PlatypusRouter01Codec,
      CurvePoolCodec,
      getSpecialMetaPoolCodecConfig(43114),
      getMetaPoolCodecConfig(43114)
    ],
    externalSwapDex: ['0x1111111254fb6c44bac0bed2854e76f90643097d'], // 1inch
    transferSwapper: process.env.TRANSFER_SWAPPER_43114, //set with the actual addr after TransferSwapper is deployed
    anyswapRouters: (process.env.ANYSWAP_ROUTER_43114 ?? '').split(','),
    stargateRouters: (process.env.STARGATE_ROUTER_43114 ?? '').split(',')
  },

  // Arbitrum
  42161: {
    nativeWrap: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    messageBus: process.env.MESSAGE_BUS_42161,
    supportedDex: [
      { address: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', func: UniswapV2SwapExactTokensForTokensCodec.func }, // Sushiswap: SushiSwapRouter
      { address: '0xE592427A0AEce92De3Edee1F18E0157C05861564', func: UniswapV3ExactInputCodec.func }, // UniswapV3: SwapRouter
      // 1inch address and funcs
      { address: '0x1111111254fb6c44bAC0beD2854e76F90643097d', func: OneInchSwapFunc },
      { address: '0x1111111254fb6c44bAC0beD2854e76F90643097d', func: OneInchClipperSwapFunc },
      { address: '0x1111111254fb6c44bAC0beD2854e76F90643097d', func: OneInchUnoswapSwapFunc },
      { address: '0x1111111254fb6c44bAC0beD2854e76F90643097d', func: OneInchUnoswapV3SwapFunc },
      ...getSupportedCurvePools(42161)
    ],
    codecs: [
      UniswapV2SwapExactTokensForTokensCodec,
      UniswapV3ExactInputCodec,
      CurvePoolCodec,
      getMetaPoolCodecConfig(42161)
    ],
    externalSwapDex: ['0x1111111254fb6c44bac0bed2854e76f90643097d'], // 1inch
    transferSwapper: process.env.TRANSFER_SWAPPER_42161, //set with the actual addr after TransferSwapper is deployed
    anyswapRouters: (process.env.ANYSWAP_ROUTER_42161 ?? '').split(','),
    stargateRouters: (process.env.STARGATE_ROUTER_42161 ?? '').split(',')
  }
};
