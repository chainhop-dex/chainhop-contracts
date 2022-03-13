import { Wallet } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import {
  BridgeContracts,
  ChainHopContracts,
  deployBridgeContracts,
  deployChainhopContracts,
  deployTokenContracts,
  getAccounts,
  TokenContracts
} from './common';

export interface TestContext extends ChainhopFixture {
  sender: Wallet;
  receiver: Wallet;
}

export interface ChainhopFixture extends ChainHopContracts, BridgeContracts, TokenContracts {
  admin: Wallet;
  accounts: Wallet[];
  signer: Wallet;
  feeCollector: Wallet;
  chainId: number;
}

export const chainhopFixture = async ([admin]: Wallet[]): Promise<ChainhopFixture> => {
  const bridge = await deployBridgeContracts(admin);
  const tokens = await deployTokenContracts(admin);
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
  await tokens.tokenA.transfer(chainhop.mockV2.address, parseUnits('10000000'));
  await tokens.tokenB.transfer(chainhop.mockV2.address, parseUnits('10000000'));
  await tokens.weth.transfer(chainhop.mockV2.address, parseUnits('10000000'));
  await tokens.weth.deposit({ value: parseUnits('20') });
  await chainhop.mockV2.setFakeSlippage(parseUnits('5', 4));

  return { ...bridge, ...bridge, ...chainhop, ...tokens, admin, accounts, signer, feeCollector, chainId };
};
