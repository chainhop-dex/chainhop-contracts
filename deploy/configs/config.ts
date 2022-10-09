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
  OneInchCodecs,
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
    isL1: true,
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
      getMetaPoolCodecConfig(1),
      ...OneInchCodecs
    ],
    anyswapRouters: [
      '0x6b7a87899490ece95443e979ca9485cbe7e71522',
      '0x765277eebeca2e31912c9946eae1021199b39c61',
      '0xba8da9dcf11b50b03fd5284f164ef5cdef910705',
      '0xe95fd76cf16008c12ff3b3a937cb16cd9cc20284'
    ],
    stargateRouters: ['0x8731d54E9D02c286767d56ac03e8037C07e01e98', '0x150f94B44927F078737562f0fcF3C95c01Cc2376'],
    acrossSpokePool: '0x4D9079Bb4165aeb4084c526a32695dCfd2F77381',
    hyphenLiquidityPool: '0x2A5c2568b10A0E826BfA892Cf21BA7218310180b',
    hopBridges: {
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': '0x3666f603Cc164936C1b87e207F36BEBa4AC5f18a', // USDC
      '0xdAC17F958D2ee523a2206206994597C13D831ec7': '0x3E4a3a4796d16c0Cd582C382691998f7c06420B6', // USDT
      '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0': '0x22B1Cbb8D98a01a3B71D034BB899775A76Eb1cc2', // WMATIC
      '0x6B175474E89094C44Da98b954EedeAC495271d0F': '0x3d4Cc8A61c7528Fd86C55cfe061a78dCBA48EDd1', // DAI
      '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': '0xb8901acB165ed027E32754E0FFe830802919727f', // WETH
      '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599': '0xb98454270065A31D71Bf635F6F7Ee6A518dFb849', // WBTC
      '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f': '0x893246FACF345c99e4235E5A7bbEE7404c988b96' // SNX
    }
  },

  // Optimism
  10: {
    isL1: false,
    nativeWrap: '0x4200000000000000000000000000000000000006',
    messageBus: process.env.MESSAGE_BUS_10,
    supportedDex: [
      { address: '0xE592427A0AEce92De3Edee1F18E0157C05861564', func: UniswapV3ExactInputCodec.func }, // UniswapV3: SwapRouter
      ...getSupportedOneInchFuncs('0x1111111254760f7ab3f16433eea9304126dcd199')
    ],
    codecs: [UniswapV3ExactInputCodec, ...OneInchCodecs],
    anyswapRouters: ['0xDC42728B0eA910349ed3c6e1c9Dc06b5FB591f98', '0x80a16016cc4a2e6a2caca8a4a498b1699ff0f844'],
    stargateRouters: ['0xB0D502E938ed5f4df2E681fE6E419ff29631d62b', '0xB49c4e680174E331CB0A7fF3Ab58afC9738d5F8b'],
    acrossSpokePool: '0xa420b2d1c0841415A695b81E5B867BCD07Dff8C9',
    hyphenLiquidityPool: '0x856cb5c3cbbe9e2e21293a644aa1f9363cee11e8',
    hopBridges: {
      '0x7F5c764cBc14f9669B88837ca1490cCa17c31607': '0x2ad09850b0CA4c7c1B33f5AcD6cBAbCaB5d6e796', // USDC
      '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58': '0x7D269D3E0d61A05a0bA976b7DBF8805bF844AF3F', // USDT
      '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1': '0xb3C68a491608952Cb1257FC9909a537a0173b63B', // DAI
      '0x4200000000000000000000000000000000000006': '0x86cA30bEF97fB651b8d866D45503684b90cb3312', // WETH
      '0x68f180fcCe6836688e9084f035309E29Bf0A2095': '0x2A11a98e2fCF4674F30934B5166645fE6CA35F56', // WBTC
      '0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4': '0xf11EBB94EC986EA891Aec29cfF151345C83b33Ec' // SNX
    }
  },

  // BSC
  56: {
    isL1: true,
    nativeWrap: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
    messageBus: process.env.MESSAGE_BUS_56,
    supportedDex: [
      { address: '0x10ed43c718714eb63d5aa57b78b54704e256024e', func: UniswapV2SwapExactTokensForTokensCodec.func }, // PancakeSwap: UniswapV2Router02
      { address: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', func: UniswapV2SwapExactTokensForTokensCodec.func }, // SushiSwap: SushiSwapRouter
      ...getSupportedOneInchFuncs('0x1111111254fb6c44bAC0beD2854e76F90643097d')
    ],
    codecs: [UniswapV2SwapExactTokensForTokensCodec, ...OneInchCodecs],
    anyswapRouters: [
      '0xd1c5966f9f5ee6881ff6b261bbeda45972b1b5f3',
      '0xabd380327fe66724ffda91a87c772fb8d00be488',
      '0x92c079d3155c2722dbf7e65017a5baf9cd15561c',
      '0xf9736ec3926703e85c843fc972bd89a7f8e827c0'
    ],
    stargateRouters: ['0x4a364f8c717cAAD9A442737Eb7b8A55cc6cf18D8'],
    hyphenLiquidityPool: '0x94D3E62151B12A12A4976F60EdC18459538FaF08'
  },

  // Polygon
  137: {
    isL1: false,
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
      getMetaPoolCodecConfig(137),
      ...OneInchCodecs
    ],
    anyswapRouters: [
      '0x4f3Aff3A747fCADe12598081e80c6605A8be192F',
      '0x6ff0609046a38d76bd40c5863b4d1a2dce687f73',
      '0xafaace7138ab3c2bcb2db4264f8312e1bbb80653',
      '0x2ef4a574b72e1f555185afa8a09c6d1a8ac4025c'
    ],
    stargateRouters: ['0x45A01E4e04F14f7A4a6702c74187c5F6222033cd'],
    acrossSpokePool: '0x69B5c72837769eF1e7C164Abc6515DcFf217F920',
    hyphenLiquidityPool: '0x2A5c2568b10A0E826BfA892Cf21BA7218310180b',
    hopBridges: {
      '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174': '0x76b22b8C1079A44F1211D867D68b1eda76a635A7', // USDC
      '0xc2132D05D31c914a87C6611C10748AEb04B58e8F': '0x8741Ba6225A6BF91f9D73531A98A89807857a2B3', // USDT
      '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270': '0x884d1Aa15F9957E1aEAA86a82a72e49Bc2bfCbe3', // WMATIC
      '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063': '0x28529fec439cfF6d7D1D5917e956dEE62Cd3BE5c', // DAI
      '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619': '0xc315239cFb05F1E130E7E28E603CEa4C014c57f0', // WETH
      '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6': '0xCd1d7AEfA8055e020db0d0e98bbF3FeD1A16aad6' // WBTC
    }
  },

  // Fantom
  250: {
    isL1: true,
    nativeWrap: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
    messageBus: process.env.MESSAGE_BUS_250,
    supportedDex: [
      { address: '0xF491e7B69E4244ad4002BC14e878a34207E38c29', func: UniswapV2SwapExactTokensForTokensCodec.func }, // Spookyswap: UniswapV2Router02
      { address: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', func: UniswapV2SwapExactTokensForTokensCodec.func }, // SushiSwap: SushiSwapRouter
      ...getSupportedOneInchFuncs('0x1111111254fb6c44bAC0beD2854e76F90643097d'),
      ...getSupportedCurvePools(250)
    ],
    codecs: [UniswapV2SwapExactTokensForTokensCodec, CurvePoolCodec, getMetaPoolCodecConfig(250), ...OneInchCodecs],
    anyswapRouters: [
      '0x1ccca1ce62c62f7be95d4a67722a8fdbed6eecb4',
      '0xb576c9403f39829565bd6051695e2ac7ecf850e2',
      '0xf3ce95ec61114a4b1bfc615c16e6726015913ccc'
    ],
    stargateRouters: ['0xAf5191B0De278C7286d6C7CC6ab6BB8A73bA2Cd6'],
    hyphenLiquidityPool: '0x856cb5c3cbbe9e2e21293a644aa1f9363cee11e8'
  },

  // Arbitrum
  42161: {
    isL1: false,
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
      getMetaPoolCodecConfig(42161),
      ...OneInchCodecs
    ],
    anyswapRouters: [
      '0xc931f61b1534eb21d8c11b24f3f5ab2471d4ab50',
      '0x0cae51e1032e8461f4806e26332c030e34de3adb',
      '0x39fde572a18448f8139b7788099f0a0740f51205',
      '0x650af55d5877f289837c30b94af91538a7504b76'
    ],
    stargateRouters: ['0x53Bf833A5d6c4ddA888F69c22C88C9f356a41614', '0xbf22f0f184bCcbeA268dF387a49fF5238dD23E40'],
    acrossSpokePool: '0xB88690461dDbaB6f04Dfad7df66B7725942FEb9C',
    hyphenLiquidityPool: '0x856cb5c3cbbe9e2e21293a644aa1f9363cee11e8',
    hopBridges: {
      '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8': '0xe22D2beDb3Eca35E6397e0C6D62857094aA26F52', // USDC
      '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9': '0xCB0a4177E0A60247C0ad18Be87f8eDfF6DD30283', // USDT
      '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1': '0xe7F40BF16AB09f4a6906Ac2CAA4094aD2dA48Cc2', // DAI
      '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1': '0x33ceb27b39d2Bb7D2e61F7564d3Df29344020417', // WETH
      '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f': '0xC08055b634D43F2176d721E26A3428D3b7E7DdB5' // WBTC
    }
  },

  // Avalanche
  43114: {
    isL1: true,
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
      getMetaPoolCodecConfig(43114),
      ...OneInchCodecs
    ],
    anyswapRouters: [
      '0x833f307ac507d47309fd8cdd1f835bef8d702a93',
      '0xe5cf1558a1470cb5c166c2e8651ed0f3c5fb8f42',
      '0x9b17baadf0f21f03e35249e0e59723f34994f806',
      '0xb0731d50c681c45856bfc3f7539d5f61d4be81d8'
    ],
    stargateRouters: ['0xB0D502E938ed5f4df2E681fE6E419ff29631d62b', '0xB49c4e680174E331CB0A7fF3Ab58afC9738d5F8b'],
    hyphenLiquidityPool: '0x2A5c2568b10A0E826BfA892Cf21BA7218310180b'
  }
};
