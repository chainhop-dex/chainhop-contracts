import * as dotenv from 'dotenv';
import { IConfig, UniswapV2SwapExactTokensForTokensCodec } from './types';

dotenv.config();

export const testnetDeploymentConfigs: IConfig = {
  feeSigner: process.env.FEE_SIGNER_TEST,
  feeCollector: process.env.FEE_COLLECTOR_TEST,

  // Goerli
  5: {
    nativeWrap: '0xf988115c8F584aABeea99B77239d56443AB03A77',
    messageBus: process.env.MESSAGE_BUS_5,
    supportedDex: [
      { address: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', func: UniswapV2SwapExactTokensForTokensCodec.func } // UniswapV2: UniswapV2Router02
    ],
    codecs: [UniswapV2SwapExactTokensForTokensCodec]
  },

  // BSC Testnet
  97: {
    nativeWrap: '0xfCbB818c2C13775515C5088D12FD249F2Dd19966',
    messageBus: process.env.MESSAGE_BUS_97,
    supportedDex: [
      { address: '0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3', func: UniswapV2SwapExactTokensForTokensCodec.func } // PancakeSwap: UniswapV2Router02
    ],
    codecs: [UniswapV2SwapExactTokensForTokensCodec]
  }
};

export const isTestnet = (chainId: number) => {
  return chainId == 5 || chainId == 97;
};
