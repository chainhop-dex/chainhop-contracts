import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { Ownable__factory } from '../typechain';

dotenv.config();

async function transferOwnership(contractAddr: string, newOwner: string): Promise<void> {
  const [signer] = await ethers.getSigners();

  if (!contractAddr) {
    console.error('no contract address specified');
    return;
  }
  if (!newOwner) {
    console.error('no new owner address specified');
    return;
  }
  const contract = Ownable__factory.connect(contractAddr, signer);
  const res = await (await contract.transferOwnership(newOwner)).wait();
  console.log('transferOwnership', contractAddr, newOwner, 'tx', res.transactionHash);
}

async function transfer(contractName: string, newOwner: string) {
  try {
    const contract = await ethers.getContract(contractName);
    console.log(contractName, contract.address);
    await transferOwnership(contract.address, newOwner);
  } catch (e) {
    console.log(contractName, 'error:', e);
  }
}

async function run() {
  const newOwner = '0xA5c13556e3D2068582D4F435ad49b41e090D3867';
  await transfer('ExecutionNode', newOwner);
  await transfer('AcrossAdapter', newOwner);
  await transfer('AnyswapAdapter', newOwner);
  await transfer('CBridgeAdapter', newOwner);
  await transfer('CurveMetaPoolCodec', newOwner);
  await transfer('DefaultProxyAdmin', newOwner);
  await transfer('FeeVault', newOwner);
  await transfer('HopAdapter', newOwner);
  await transfer('HyphenAdapter', newOwner);
  await transfer('StargateAdapter', newOwner);
}

run();
