export interface IConfig {
  poolConfigPath?: string;
  feeSigner?: string;
  feeCollector?: string;
  [chainId: number]: {
    nativeWrap: string;
    messageBus?: string;
    supportedDex: IDexConfig[];
    codecs: ICodecConfig[];
  };
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

export const UniswapV2SwapExactTokensForTokensCodec: ICodecConfig = {
  name: 'UniswapV2SwapExactTokensForTokensCodec',
  func: 'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)'
};

export const UniswapV3ExactInputCodec: ICodecConfig = {
  name: 'UniswapV3ExactInputCodec',
  func: 'exactInput((bytes,address,uint256,uint256,uint256))'
};

export const CurvePoolCodec: ICodecConfig = {
  name: 'CurvePoolCodec',
  func: 'exchange(int128,int128,uint256,uint256)'
};

export const CurveMetaPoolCodecBase: ICodecConfig = {
  name: 'CurveMetaPoolCodec',
  func: 'exchange_underlying(int128,int128,uint256,uint256,address)'
};

export const CurveSpecialMetaPoolCodecBase: ICodecConfig = {
  name: 'CurveSpecialMetaPoolCodec',
  func: 'exchange_underlying(int128,int128,uint256,uint256)'
};
