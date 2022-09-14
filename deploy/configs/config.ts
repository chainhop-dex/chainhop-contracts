import * as dotenv from 'dotenv';
import {
  getMetaPoolCodecConfig,
  getSpecialMetaPoolCodecConfig,
  getSupportedCurvePools,
  getSupportedOneInchFuncs
} from './functions';
import {
  CurvePoolCodec,
  IConfig,
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
      ...getSupportedOneInchFuncs('0x1111111254fb6c44bAC0beD2854e76F90643097d'),
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
    anyswapRouters: [
      '0x6b7a87899490ece95443e979ca9485cbe7e71522',
      '0x765277eebeca2e31912c9946eae1021199b39c61',
      '0xba8da9dcf11b50b03fd5284f164ef5cdef910705',
      '0xe95fd76cf16008c12ff3b3a937cb16cd9cc20284'
    ],
    stargateRouters: ['0x8731d54E9D02c286767d56ac03e8037C07e01e98', '0x150f94B44927F078737562f0fcF3C95c01Cc2376'],
    acrossSpokePool: '0x4D9079Bb4165aeb4084c526a32695dCfd2F77381'
  },

  // Optimism
  10: {
    nativeWrap: '0x4200000000000000000000000000000000000006',
    messageBus: process.env.MESSAGE_BUS_10,
    supportedDex: [
      { address: '0xE592427A0AEce92De3Edee1F18E0157C05861564', func: UniswapV3ExactInputCodec.func }, // UniswapV3: SwapRouter
      ...getSupportedOneInchFuncs('0x1111111254760f7ab3f16433eea9304126dcd199')
    ],
    codecs: [UniswapV3ExactInputCodec],
    externalSwapDex: ['0x1111111254760f7ab3f16433eea9304126dcd199'], // 1inch
    anyswapRouters: ['0xDC42728B0eA910349ed3c6e1c9Dc06b5FB591f98', '0x80a16016cc4a2e6a2caca8a4a498b1699ff0f844'],
    stargateRouters: ['0xB0D502E938ed5f4df2E681fE6E419ff29631d62b', '0xB49c4e680174E331CB0A7fF3Ab58afC9738d5F8b'],
    acrossSpokePool: '0xa420b2d1c0841415A695b81E5B867BCD07Dff8C9'
  },

  // BSC
  56: {
    nativeWrap: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
    messageBus: process.env.MESSAGE_BUS_56,
    supportedDex: [
      { address: '0x10ed43c718714eb63d5aa57b78b54704e256024e', func: UniswapV2SwapExactTokensForTokensCodec.func }, // PancakeSwap: UniswapV2Router02
      { address: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', func: UniswapV2SwapExactTokensForTokensCodec.func }, // SushiSwap: SushiSwapRouter
      ...getSupportedOneInchFuncs('0x1111111254fb6c44bAC0beD2854e76F90643097d')
    ],
    codecs: [UniswapV2SwapExactTokensForTokensCodec],
    externalSwapDex: ['0x1111111254fb6c44bac0bed2854e76f90643097d'], // 1inch
    anyswapRouters: [
      '0xd1c5966f9f5ee6881ff6b261bbeda45972b1b5f3',
      '0xabd380327fe66724ffda91a87c772fb8d00be488',
      '0x92c079d3155c2722dbf7e65017a5baf9cd15561c',
      '0xf9736ec3926703e85c843fc972bd89a7f8e827c0'
    ],
    stargateRouters: ['0x4a364f8c717cAAD9A442737Eb7b8A55cc6cf18D8']
  },

  // Polygon
  137: {
    nativeWrap: '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270',
    messageBus: process.env.MESSAGE_BUS_137,
    supportedDex: [
      { address: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff', func: UniswapV2SwapExactTokensForTokensCodec.func }, // Quickswap: UniswapV2Router02
      { address: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', func: UniswapV2SwapExactTokensForTokensCodec.func }, // SushiSwap: SushiSwapRouter
      { address: '0xE592427A0AEce92De3Edee1F18E0157C05861564', func: UniswapV3ExactInputCodec.func }, // UniswapV3: SwapRouter
      ...getSupportedOneInchFuncs('0x1111111254fb6c44bAC0beD2854e76F90643097d'),
      ...getSupportedCurvePools(137)
    ],
    codecs: [
      UniswapV2SwapExactTokensForTokensCodec,
      UniswapV3ExactInputCodec,
      getSpecialMetaPoolCodecConfig(137),
      getMetaPoolCodecConfig(137)
    ],
    externalSwapDex: ['0x1111111254fb6c44bac0bed2854e76f90643097d'], // 1inch
    anyswapRouters: [
      '0x4f3Aff3A747fCADe12598081e80c6605A8be192F',
      '0x6ff0609046a38d76bd40c5863b4d1a2dce687f73',
      '0xafaace7138ab3c2bcb2db4264f8312e1bbb80653',
      '0x2ef4a574b72e1f555185afa8a09c6d1a8ac4025c'
    ],
    stargateRouters: ['0x45A01E4e04F14f7A4a6702c74187c5F6222033cd'],
    acrossSpokePool: '0x69B5c72837769eF1e7C164Abc6515DcFf217F920'
  },

  // Fantom
  250: {
    nativeWrap: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
    messageBus: process.env.MESSAGE_BUS_250,
    supportedDex: [
      { address: '0xF491e7B69E4244ad4002BC14e878a34207E38c29', func: UniswapV2SwapExactTokensForTokensCodec.func }, // Spookyswap: UniswapV2Router02
      { address: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', func: UniswapV2SwapExactTokensForTokensCodec.func }, // SushiSwap: SushiSwapRouter
      ...getSupportedOneInchFuncs('0x1111111254fb6c44bAC0beD2854e76F90643097d'),
      ...getSupportedCurvePools(250)
    ],
    codecs: [UniswapV2SwapExactTokensForTokensCodec, CurvePoolCodec, getMetaPoolCodecConfig(250)],
    externalSwapDex: ['0x1111111254fb6c44bac0bed2854e76f90643097d'], // 1inch
    anyswapRouters: [
      '0x1ccca1ce62c62f7be95d4a67722a8fdbed6eecb4',
      '0xb576c9403f39829565bd6051695e2ac7ecf850e2',
      '0xf3ce95ec61114a4b1bfc615c16e6726015913ccc'
    ],
    stargateRouters: ['0xAf5191B0De278C7286d6C7CC6ab6BB8A73bA2Cd6']
  },

  // Arbitrum
  42161: {
    nativeWrap: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    messageBus: process.env.MESSAGE_BUS_42161,
    supportedDex: [
      { address: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', func: UniswapV2SwapExactTokensForTokensCodec.func }, // Sushiswap: SushiSwapRouter
      { address: '0xE592427A0AEce92De3Edee1F18E0157C05861564', func: UniswapV3ExactInputCodec.func }, // UniswapV3: SwapRouter
      ...getSupportedOneInchFuncs('0x1111111254fb6c44bAC0beD2854e76F90643097d'),
      ...getSupportedCurvePools(42161)
    ],
    codecs: [
      UniswapV2SwapExactTokensForTokensCodec,
      UniswapV3ExactInputCodec,
      CurvePoolCodec,
      getMetaPoolCodecConfig(42161)
    ],
    externalSwapDex: ['0x1111111254fb6c44bac0bed2854e76f90643097d'], // 1inch
    anyswapRouters: [
      '0xc931f61b1534eb21d8c11b24f3f5ab2471d4ab50',
      '0x0cae51e1032e8461f4806e26332c030e34de3adb',
      '0x39fde572a18448f8139b7788099f0a0740f51205',
      '0x650af55d5877f289837c30b94af91538a7504b76'
    ],
    stargateRouters: ['0x53Bf833A5d6c4ddA888F69c22C88C9f356a41614', '0xbf22f0f184bCcbeA268dF387a49fF5238dD23E40'],
    acrossSpokePool: '0xB88690461dDbaB6f04Dfad7df66B7725942FEb9C'
  },

  // Avalanche
  43114: {
    nativeWrap: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
    messageBus: process.env.MESSAGE_BUS_43114,
    supportedDex: [
      { address: '0x60aE616a2155Ee3d9A68541Ba4544862310933d4', func: UniswapV2SwapExactTokensForTokensCodec.func }, // TraderJoe: JoeRouter02
      { address: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', func: UniswapV2SwapExactTokensForTokensCodec.func }, // SushiSwap: SushiSwapRouter
      { address: '0x73256EC7575D999C360c1EeC118ECbEFd8DA7D12', func: PlatypusRouter01Codec.func }, // Platypus: PlatypusRouter01
      ...getSupportedOneInchFuncs('0x1111111254fb6c44bAC0beD2854e76F90643097d'),
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
    anyswapRouters: [
      '0x833f307ac507d47309fd8cdd1f835bef8d702a93',
      '0xe5cf1558a1470cb5c166c2e8651ed0f3c5fb8f42',
      '0x9b17baadf0f21f03e35249e0e59723f34994f806',
      '0xb0731d50c681c45856bfc3f7539d5f61d4be81d8'
    ],
    stargateRouters: ['0xB0D502E938ed5f4df2E681fE6E419ff29631d62b', '0xB49c4e680174E331CB0A7fF3Ab58afC9738d5F8b']
  }
};
