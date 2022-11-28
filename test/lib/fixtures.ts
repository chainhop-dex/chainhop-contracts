import { Wallet } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import {
  BridgeContracts,
  ChainHopContracts,
  CodecContracts,
  deployBridgeContracts,
  deployChainhopContracts,
  deployCodecContracts,
  deployMockDexContracts,
  deployTokenContracts,
  deployWrappedBridgeToken,
  getAccounts,
  MockDexContracts,
  TokenContracts,
  WrappedBridgeTokens
} from './deploy';

import * as utils from './utils';

export interface BaseFixture extends TokenContracts {
  admin: Wallet;
  accounts: Wallet[];
  signer: Wallet;
  feeCollector: Wallet;
  chainId: number;
  sender: Wallet;
  receiver: Wallet;
  remote: string; // mock address for remote chain ExecutionNode
}

export interface ChainhopFixture extends BaseFixture, BridgeContracts, ChainHopContracts {}

export interface IntegrationTestFixture extends ChainhopFixture, MockDexContracts, WrappedBridgeTokens {}

const fundTokens = async (tokens: TokenContracts, to: string) => {
  await tokens.tokenA.transfer(to, parseUnits('10000000'));
  await tokens.tokenB.transfer(to, parseUnits('10000000'));
  await tokens.weth.transfer(to, parseUnits('10000000'));
};

export const codecFixture = async ([admin]: Wallet[]): Promise<CodecContracts> => {
  return deployCodecContracts(admin);
};

export const chainhopFixture = async ([admin]: Wallet[]): Promise<IntegrationTestFixture> => {
  const tokens = await deployTokenContracts(admin);
  const bridge = await deployBridgeContracts(admin, tokens.weth.address);
  const wrappedBridgeTokens = await deployWrappedBridgeToken(admin, tokens.tokenA.address, bridge.bridge.address);
  const dex = await deployMockDexContracts(admin, tokens);
  const accounts = await getAccounts(admin, [tokens.tokenA, tokens.tokenB], 8);
  const signer = accounts[0];
  const feeCollector = accounts[1];
  const mockRemote = accounts[2];
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const { v2Codec, curveCodec, oneinchCodec } = await deployCodecContracts(admin);

  const chainhop = await deployChainhopContracts(admin, tokens.weth.address, bridge.messageBus.address);

  const funcs = [
    'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
    'exchange(int128,int128,uint256,uint256)',
    'clipperSwap(address,address,uint256,uint256)',
    'fillOrderRFQ((uint256,address,address,address,address,uint256,uint256),bytes,uint256,uint256)',
    'swap(address,(address,address,address,address,uint256,uint256,uint256,bytes),bytes)',
    'uniswapV3Swap(uint256,uint256,uint256[])',
    'unoswap(address,uint256,uint256,bytes32[])'
  ];
  const codecs = [
    v2Codec.address,
    curveCodec.address,
    oneinchCodec.address,
    oneinchCodec.address,
    oneinchCodec.address,
    oneinchCodec.address,
    oneinchCodec.address
  ];
  const dexList = [
    dex.mockV2.address,
    dex.mockCurve.address,
    dex.mock1inch.address,
    dex.mock1inch.address,
    dex.mock1inch.address,
    dex.mock1inch.address,
    dex.mock1inch.address
  ];

  const enode = chainhop.enode.connect(admin);
  await enode.setMessageBus(bridge.messageBus.address);
  await enode.setDexCodecs(dexList, funcs, codecs);
  await enode.setFeeVault(chainhop.feeVault.address);
  await enode.setNativeWrap(tokens.weth.address);
  await enode.setSigner(signer.address);
  await enode.setRemotes([utils.defaultRemoteChainId], [mockRemote.address]);
  await enode.setSupportedBridges(['cbridge'], [chainhop.cbridgeAdapter.address]);

  await chainhop.feeVault.setFeeCollector(feeCollector.address);

  await fundTokens(tokens, dex.mockCurve.address);
  await fundTokens(tokens, dex.mockV2.address);
  await fundTokens(tokens, dex.mock1inch.address);
  await tokens.weth.deposit({ value: parseUnits('20') });

  return {
    ...bridge,
    ...chainhop,
    ...tokens,
    ...wrappedBridgeTokens,
    ...dex,
    admin,
    accounts,
    signer,
    feeCollector,
    sender: accounts[2],
    receiver: accounts[3],
    chainId,
    remote: mockRemote.address
  };
};
