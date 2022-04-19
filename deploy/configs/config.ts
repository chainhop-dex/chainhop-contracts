import * as dotenv from 'dotenv';
import { getMetaPoolCodecConfig, getSpecialMetaPoolCodecConfig, getSupportedCurvePools } from './functions';
import { CurvePoolCodec, IConfig, UniswapV2SwapExactTokensForTokensCodec, UniswapV3ExactInputCodec } from './types';

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
      ...getSupportedCurvePools(1)
    ],
    codecs: [UniswapV3ExactInputCodec, CurvePoolCodec, getSpecialMetaPoolCodecConfig(1), getMetaPoolCodecConfig(1)]
  },

  // BSC
  56: {
    nativeWrap: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
    messageBus: process.env.MESSAGE_BUS_56,
    supportedDex: [
      { address: '0x10ed43c718714eb63d5aa57b78b54704e256024e', func: UniswapV2SwapExactTokensForTokensCodec.func } // PancakeSwap: UniswapV2Router02
    ],
    codecs: [UniswapV2SwapExactTokensForTokensCodec]
  },

  // Polygon
  137: {
    nativeWrap: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    messageBus: process.env.MESSAGE_BUS_137,
    supportedDex: [
      { address: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff', func: UniswapV2SwapExactTokensForTokensCodec.func }, // Quickswap: UniswapV2Router02
      ...getSupportedCurvePools(137)
    ],
    codecs: [UniswapV2SwapExactTokensForTokensCodec, getSpecialMetaPoolCodecConfig(137), getMetaPoolCodecConfig(137)]
  },

  // Fantom
  250: {
    nativeWrap: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
    messageBus: process.env.MESSAGE_BUS_250,
    supportedDex: [
      { address: '0xF491e7B69E4244ad4002BC14e878a34207E38c29', func: UniswapV2SwapExactTokensForTokensCodec.func }, // Spookyswap: UniswapV2Router02
      ...getSupportedCurvePools(250)
    ],
    codecs: [UniswapV2SwapExactTokensForTokensCodec, CurvePoolCodec, getMetaPoolCodecConfig(250)]
  },

  // Avalanche
  43114: {
    nativeWrap: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
    messageBus: process.env.MESSAGE_BUS_43114,
    supportedDex: [
      { address: '0x60aE616a2155Ee3d9A68541Ba4544862310933d4', func: UniswapV2SwapExactTokensForTokensCodec.func }, // TraderJoe: JoeRouter02
      ...getSupportedCurvePools(43114)
    ],
    codecs: [
      UniswapV2SwapExactTokensForTokensCodec,
      CurvePoolCodec,
      getSpecialMetaPoolCodecConfig(43114),
      getMetaPoolCodecConfig(43114)
    ]
  },

  // Arbitrum
  42161: {
    nativeWrap: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    messageBus: process.env.MESSAGE_BUS_42161,
    supportedDex: [
      { address: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', func: UniswapV2SwapExactTokensForTokensCodec.func }, // Sushiswap: UniswapV2Router02
      ...getSupportedCurvePools(42161)
    ],
    codecs: [UniswapV2SwapExactTokensForTokensCodec, CurvePoolCodec, getMetaPoolCodecConfig(42161)]
  }
};
