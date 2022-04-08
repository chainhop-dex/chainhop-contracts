export interface IConfig {
  poolConfigPath?: string;
  feeSigner?: string;
  feeCollector?: string;
  [chainId: number]: {
    nativeWrap: string;
    messageBus: string;
    supportedDex: string[];
    codecs: ICodecConfig[];
  };
}

export type IMetaPoolArgs = [string[], string[][]];

export interface ICodecConfig {
  name: string;
  swapFunc: string;
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
  swapFunc: 'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)'
};

export const UniswapV3ExactInputCodec: ICodecConfig = {
  name: 'UniswapV3ExactInputCodec',
  swapFunc: 'exactInput((bytes,address,uint256,uint256,uint256))'
};

export const CurvePoolCodec: ICodecConfig = {
  name: 'CurvePoolCodec',
  swapFunc: 'exchange(int128,int128,uint256,uint256)'
};

export const CurveMetaPoolCodecBase: ICodecConfig = {
  name: 'CurveMetaPoolCodec',
  swapFunc: 'exchange_underlying(int128,int128,uint256,uint256,address)'
};

export const CurveSpecialMetaPoolCodec: ICodecConfig = {
  name: 'CurveSpecialMetaPoolCodec',
  swapFunc: 'exchange_underlying(int128,int128,uint256,uint256)'
};
