import * as dotenv from 'dotenv';
import {
  CurvePoolCodec,
  getCurveMetaPoolCodec,
  IConfig,
  UniswapV2SwapExactTokensForTokensCodec,
  UniswapV3ExactInputCodec
} from './types';

dotenv.config();

export const deploymentConfigs: IConfig = {
  poolConfigPath: process.env.CURVE_POOL_CONFIG_PATH,
  feeSigner: process.env.FEE_SIGNER,
  feeCollector: process.env.FEE_COLLECTOR,

  // BSC
  56: {
    nativeWrap: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
    messageBus: '0x223fb0ceb2c6e5310264efe38151d7d083db91f1',
    supportedDex: ['0x10ed43c718714eb63d5aa57b78b54704e256024e'], // PancakeSwap: UniswapV2Router02
    codecs: [UniswapV2SwapExactTokensForTokensCodec]
  },

  // Polygon
  137: {
    nativeWrap: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    messageBus: '0x265B25e22bcd7f10a5bD6E6410F10537Cc7567e8',
    supportedDex: [
      '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff', // Quickswap: UniswapV2Router02
      '0x445FE580eF8d70FF569aB36e80c647af338db351' // Curve: aave
    ],
    codecs: [UniswapV2SwapExactTokensForTokensCodec, CurvePoolCodec, getCurveMetaPoolCodec([[], []])]
  },

  // Fantom
  250: {
    nativeWrap: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
    messageBus: '0x7d43AABC515C356145049227CeE54B608342c0ad',
    supportedDex: [
      '0xF491e7B69E4244ad4002BC14e878a34207E38c29', // Spookyswap: UniswapV2Router02
      '0x2dd7C9371965472E5A5fD28fbE165007c61439E1', // Curve: 3poolv2
      '0x7a656B342E14F745e2B164890E88017e27AE7320' // Curve: frax2pool
    ],
    codecs: [UniswapV2SwapExactTokensForTokensCodec, CurvePoolCodec, getCurveMetaPoolCodec([[], []])]
  },

  // Avalanche
  43114: {
    nativeWrap: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
    messageBus: '0x7d43AABC515C356145049227CeE54B608342c0ad',
    supportedDex: [
      '0x60aE616a2155Ee3d9A68541Ba4544862310933d4', // TraderJoe: JoeRouter02
      '0x7f90122BF0700F9E7e1F688fe926940E8839F353' // Curve: aave
    ],
    codecs: [UniswapV2SwapExactTokensForTokensCodec, CurvePoolCodec, getCurveMetaPoolCodec([[], []])]
  },

  // Arbitrum
  42161: {
    nativeWrap: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    messageBus: '0x5471ea8f739dd37E9B81Be9c5c77754D8AA953E4',
    supportedDex: [
      '0xE592427A0AEce92De3Edee1F18E0157C05861564', // UniswapV3: SwapRouter
      '0x7f90122BF0700F9E7e1F688fe926940E8839F353', // Curve: 2pool
      '0xf07d553B195080F84F582e88ecdD54bAa122b279' // Curve: frax+2crv
    ],
    codecs: [
      UniswapV3ExactInputCodec,
      UniswapV2SwapExactTokensForTokensCodec,
      CurvePoolCodec,
      getCurveMetaPoolCodec([[], []])
    ]
  }
};
