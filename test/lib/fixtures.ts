import { Wallet } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import {
  BridgeContracts,
  ChainHopContracts,
  deployBridgeContracts,
  deployChainhopContracts,
  deployMinimalDexContracts,
  deployMockDexContracts,
  deployTokenContracts,
  getAccounts,
  MinimalDexContracts,
  MockDexContracts,
  TokenContracts
} from './common';

export interface TestContext extends ChainhopFixture {
  sender: Wallet;
  receiver: Wallet;
}

export interface BenchmarkContext extends BenchmarkFixture {
  sender: Wallet;
  receiver: Wallet;
}

export interface BaseFixture extends TokenContracts, BridgeContracts, ChainHopContracts {
  admin: Wallet;
  accounts: Wallet[];
  signer: Wallet;
  feeCollector: Wallet;
  chainId: number;
}

export interface ChainhopFixture extends BaseFixture, MockDexContracts {}
export interface BenchmarkFixture extends BaseFixture, MinimalDexContracts {}

const fundTokens = async (tokens: TokenContracts, to: string) => {
  await tokens.tokenA.transfer(to, parseUnits('10000000'));
  await tokens.tokenB.transfer(to, parseUnits('10000000'));
  await tokens.weth.transfer(to, parseUnits('10000000'));
};

export const chainhopFixture = async ([admin]: Wallet[]): Promise<ChainhopFixture> => {
  const bridge = await deployBridgeContracts(admin);
  const tokens = await deployTokenContracts(admin);
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
    [dex.mockV2.address, dex.mockCurve.address],
    ['swapExactTokensForTokens(uint256,uint256,address[],address,uint256)', 'exchange(int128,int128,uint256,uint256)']
  );
  await fundTokens(tokens, dex.mockCurve.address);
  await fundTokens(tokens, dex.mockV2.address);
  await tokens.weth.deposit({ value: parseUnits('20') });

  return { ...bridge, ...bridge, ...chainhop, ...tokens, ...dex, admin, accounts, signer, feeCollector, chainId };
};

export const benchmarkFixture = async ([admin]: Wallet[]): Promise<BenchmarkFixture> => {
  const bridge = await deployBridgeContracts(admin);
  const tokens = await deployTokenContracts(admin);
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
  await fundTokens(tokens, dex.mockV2.address);
  await tokens.weth.deposit({ value: parseUnits('20') });

  return { ...bridge, ...bridge, ...chainhop, ...tokens, ...dex, admin, accounts, signer, feeCollector, chainId };
};
