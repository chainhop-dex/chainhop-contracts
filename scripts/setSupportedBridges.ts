import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { TransferSwapper } from '../typechain/TransferSwapper';

dotenv.config();

const setSupportedBridges = async () => {
  const [signer] = await ethers.getSigners();
  const xswap = await (await ethers.getContract<TransferSwapper>('TransferSwapper')).connect(signer);
  const tx = await xswap.setSupportedBridges(['across'], ['0x4D9079Bb4165aeb4084c526a32695dCfd2F77381']);
  await tx.wait();
  console.log('tx', tx.hash);
};

setSupportedBridges();
