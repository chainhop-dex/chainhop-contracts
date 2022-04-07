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

type IMetaPoolArgs = [string[], string[][]];

export interface ICodecConfig {
  name: string;
  swapFunc: string;
  args?: IMetaPoolArgs;
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

export const getCurveMetaPoolCodec = (args: IMetaPoolArgs): ICodecConfig => ({
  name: 'CurveMetaPoolCodec',
  swapFunc: 'exchange_underlying(int128,int128,uint256,uint256,address)',
  args
});

export const CurveSpecialMetaPoolCodec: ICodecConfig = {
  name: 'CurveSpecialMetaPoolCodec',
  swapFunc: 'exchange_underlying(int128,int128,uint256,uint256)'
};
