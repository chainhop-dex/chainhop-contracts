import { Wallet } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import {
  BridgeContracts,
  ChainHopContracts,
  deployBridgeContracts,
  deployChainhopContracts,
  deployMockDexContracts,
  deployTokenContracts,
  getAccounts,
  MockDexContracts,
  TokenContracts
} from './common';

export interface TestContext extends ChainhopFixture {
  sender: Wallet;
  receiver: Wallet;
}

export interface ChainhopFixture extends ChainHopContracts, BridgeContracts, TokenContracts, MockDexContracts {
  admin: Wallet;
  accounts: Wallet[];
  signer: Wallet;
  feeCollector: Wallet;
  chainId: number;
}

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
    bridge.messageBus.address
  );
  await fundTokens(tokens, dex.mockCurve.address);
  await fundTokens(tokens, dex.mockV2.address);
  await tokens.weth.deposit({ value: parseUnits('20') });

  return { ...bridge, ...bridge, ...chainhop, ...tokens, ...dex, admin, accounts, signer, feeCollector, chainId };
};
