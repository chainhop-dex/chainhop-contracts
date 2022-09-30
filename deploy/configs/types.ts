export interface IConfig {
  poolConfigPath?: string;
  feeSigner?: string;
  feeCollector?: string;
  [chainId: number]: {
    isL1?: boolean;
    nativeWrap: string;
    messageBus?: string;
    supportedDex: IDexConfig[];
    codecs: ICodecConfig[];
    externalSwapDex?: string[];
    transferSwapper?: string;
    anyswapRouters?: string[];
    stargateRouters?: string[];
    acrossSpokePool?: string;
    hyphenLiquidityPool?: string;
    hopBridges?: Record<string, string>;
  };
}

export interface IBridgeAdapterConfig {
  [chainId: number]: IBridgeAdapter[];
}

export interface IDexConfig {
  address: string;
  func: string;
}

export type IMetaPoolArgs = [string[], string[][]];

export interface ICodecConfig {
  name: string;
  func: string;
  args?: IMetaPoolArgs;
}

export interface IPoolConfig {
  chain_id: number;
  name: string;
  type: 'plain' | 'meta' | 'meta-special';
  address: string;
  base_pool: string;
  tokens: string[];
  gas: number;
}

export interface IBridgeAdapter {
  type: 'cbridge' | 'anyswap' | 'stargate' | 'across';
  address: string;
}

export const UniswapV2SwapFunc = 'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)';
export const UniswapV3SwapFunc = 'exactInput((bytes,address,uint256,uint256,uint256))';
export const CurvePlainPoolSwapFunc = 'exchange(int128,int128,uint256,uint256)';
export const CurveMetaPoolSwapFunc = 'exchange_underlying(int128,int128,uint256,uint256,address)';
export const CurveSpecialMetaPoolSwapFunc = 'exchange_underlying(int128,int128,uint256,uint256)';
export const PlatypusSwapFunc = 'swapTokensForTokens(address[],address[],uint256,uint256,address,uint256)';
export const OneInchSwapFunc = 'swap(address,(address,address,address,address,uint256,uint256,uint256,bytes),bytes)';
export const OneInchClipperSwapFunc = 'clipperSwap(address,address,uint256,uint256)';
export const OneInchUnoswapSwapFunc = 'unoswap(address,uint256,uint256,bytes32[])';
export const OneInchUnoswapV3SwapFunc = 'uniswapV3Swap(uint256,uint256,uint256[])';

export const UniswapV2SwapExactTokensForTokensCodec: ICodecConfig = {
  name: 'UniswapV2SwapExactTokensForTokensCodec',
  func: UniswapV2SwapFunc
};

export const UniswapV3ExactInputCodec: ICodecConfig = {
  name: 'UniswapV3ExactInputCodec',
  func: UniswapV3SwapFunc
};

export const CurvePoolCodec: ICodecConfig = {
  name: 'CurvePoolCodec',
  func: CurvePlainPoolSwapFunc
};

export const CurveMetaPoolCodecBase: ICodecConfig = {
  name: 'CurveMetaPoolCodec',
  func: CurveMetaPoolSwapFunc
};

export const CurveSpecialMetaPoolCodecBase: ICodecConfig = {
  name: 'CurveSpecialMetaPoolCodec',
  func: CurveSpecialMetaPoolSwapFunc
};

export const PlatypusRouter01Codec: ICodecConfig = {
  name: 'PlatypusRouter01Codec',
  func: PlatypusSwapFunc
};
