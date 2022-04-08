import * as dotenv from 'dotenv';
import { getMetaPoolCodecConfig } from './functions';
import { CurvePoolCodec, IConfig, UniswapV2SwapExactTokensForTokensCodec, UniswapV3ExactInputCodec } from './types';

dotenv.config();

export const deploymentConfigs: IConfig = {
  poolConfigPath: process.env.CURVE_POOL_CONFIG_PATH,
  feeSigner: process.env.FEE_SIGNER,
  feeCollector: process.env.FEE_COLLECTOR,

  1: {
    nativeWrap: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    messageBus: '0x7d43AABC515C356145049227CeE54B608342c0ad',
    supportedDex: [
      '0xE592427A0AEce92De3Edee1F18E0157C05861564', // UniswapV3: SwapRouter
      '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7',
      '0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B',
      '0x5a6A4D54456819380173272A5E8E9B9904BdF41B',
      '0xCEAF7747579696A2F0bb206a14210e3c9e6fB269',
      '0xA5407eAE9Ba41422680e2e00537571bcC53efBfD',
      '0xEd279fDD11cA84bEef15AF5D39BB4d4bEE23F0cA',
      '0x4807862AA8b2bF68830e4C8dc86D0e9A998e085a'
    ],
    codecs: [UniswapV3ExactInputCodec, CurvePoolCodec, getMetaPoolCodecConfig(1)]
  },

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
      '0x445FE580eF8d70FF569aB36e80c647af338db351',
      '0x5e5A23b52Cb48F5E70271Be83079cA5bC9c9e9ac',
      '0x447646e84498552e62eCF097Cc305eaBFFF09308'
    ],
    codecs: [UniswapV2SwapExactTokensForTokensCodec, CurvePoolCodec, getMetaPoolCodecConfig(137)]
  },

  // Fantom
  250: {
    nativeWrap: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
    messageBus: '0x7d43AABC515C356145049227CeE54B608342c0ad',
    supportedDex: [
      '0xF491e7B69E4244ad4002BC14e878a34207E38c29', // Spookyswap: UniswapV2Router02
      '0x2dd7C9371965472E5A5fD28fbE165007c61439E1',
      '0x27E611FD27b276ACbd5Ffd632E5eAEBEC9761E40',
      '0xA58F16498c288c357e28EE899873fF2b55D7C437',
      '0x7c79acC9aEf46E4d55BD05d06C24E79C35183241',
      '0x7a656B342E14F745e2B164890E88017e27AE7320'
    ],
    codecs: [UniswapV2SwapExactTokensForTokensCodec, CurvePoolCodec, getMetaPoolCodecConfig(259)]
  },

  // Avalanche
  43114: {
    nativeWrap: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
    messageBus: '0x7d43AABC515C356145049227CeE54B608342c0ad',
    supportedDex: [
      '0x60aE616a2155Ee3d9A68541Ba4544862310933d4', // TraderJoe: JoeRouter02
      '0x7f90122BF0700F9E7e1F688fe926940E8839F353',
      '0xD79138c49c49200a1Afc935171D1bDAd084FDc95',
      '0x3a43A5851A3e3E0e25A3c1089670269786be1577',
      '0xAEA2E71b631fA93683BCF256A8689dFa0e094fcD',
      '0xE013593CEA239E445d2271106836b00C9E7356ae'
    ],
    codecs: [UniswapV2SwapExactTokensForTokensCodec, CurvePoolCodec, getMetaPoolCodecConfig(43114)]
  },

  // Arbitrum
  42161: {
    nativeWrap: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    messageBus: '0x5471ea8f739dd37E9B81Be9c5c77754D8AA953E4',
    supportedDex: [
      '0xE592427A0AEce92De3Edee1F18E0157C05861564', // UniswapV3: SwapRouter
      '0x7f90122BF0700F9E7e1F688fe926940E8839F353',
      '0xf07d553B195080F84F582e88ecdD54bAa122b279'
    ],
    codecs: [
      UniswapV3ExactInputCodec,
      UniswapV2SwapExactTokensForTokensCodec,
      CurvePoolCodec,
      getMetaPoolCodecConfig(42161)
    ]
  }
};
