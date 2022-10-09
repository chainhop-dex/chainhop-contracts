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
  deployMinimalDexContracts,
  deployMockDexContracts,
  deployTokenContracts,
  deployWrappedBridgeToken,
  getAccounts,
  MinimalDexContracts,
  MockDexContracts,
  TokenContracts,
  WrappedBridgeTokens
} from './common';

export interface IntegrationTestContext extends IntegrationTestFixture {
  sender: Wallet;
  receiver: Wallet;
}

export interface BenchmarkContext extends BenchmarkFixture {
  sender: Wallet;
  receiver: Wallet;
}

export interface BaseFixture extends TokenContracts {
  admin: Wallet;
  accounts: Wallet[];
  signer: Wallet;
  feeCollector: Wallet;
  chainId: number;
}

export interface ChainhopFixture extends BaseFixture, BridgeContracts, ChainHopContracts {}

export interface IntegrationTestFixture extends ChainhopFixture, MockDexContracts, WrappedBridgeTokens {}

export interface BenchmarkFixture extends ChainhopFixture, MinimalDexContracts {}

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
  const chainId = (await ethers.provider.getNetwork()).chainId;

  const chainhop = await deployChainhopContracts(
    admin,
    tokens.weth.address,
    signer.address,
    feeCollector.address,
    bridge.messageBus.address,
    [dex.mockV2.address, dex.mockCurve.address, dex.mock1inch.address],
    [
      'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
      'exchange(int128,int128,uint256,uint256)',
      'swap(uint256,uint256,address,address,address)'
    ]
  );

  await bridge.bridgeAdapter.updateMainContract(chainhop.xswap.address);
  await chainhop.xswap.setSupportedBridges(['cbridge'], [bridge.bridgeAdapter.address]);
  await fundTokens(tokens, dex.mockCurve.address);
  await fundTokens(tokens, dex.mockV2.address);
  await fundTokens(tokens, dex.mock1inch.address);
  await tokens.weth.deposit({ value: parseUnits('20') });

  return {
    ...bridge,
    ...bridge,
    ...chainhop,
    ...tokens,
    ...wrappedBridgeTokens,
    ...dex,
    admin,
    accounts,
    signer,
    feeCollector,
    chainId
  };
};

export const benchmarkFixture = async ([admin]: Wallet[]): Promise<BenchmarkFixture> => {
  const tokens = await deployTokenContracts(admin);
  const bridge = await deployBridgeContracts(admin, tokens.weth.address);
  const dex = await deployMinimalDexContracts(admin);
  const accounts = await getAccounts(admin, [tokens.tokenA, tokens.tokenB], 8);
  const signer = accounts[0];
  const feeCollector = accounts[1];
  const chainId = (await ethers.provider.getNetwork()).chainId;

  const chainhop = await deployChainhopContracts(
    admin,
    tokens.weth.address,
    signer.address,
    feeCollector.address,
    bridge.messageBus.address,
    [dex.mockV2.address],
    ['swapExactTokensForTokens(uint256,uint256,address[],address,uint256)']
  );
  await bridge.bridgeAdapter.updateMainContract(chainhop.xswap.address);
  await chainhop.xswap.setSupportedBridges(['cbridge'], [bridge.bridgeAdapter.address]);
  await fundTokens(tokens, dex.mockV2.address);
  await tokens.weth.deposit({ value: parseUnits('20') });

  return { ...bridge, ...bridge, ...chainhop, ...tokens, ...dex, admin, accounts, signer, feeCollector, chainId };
};
