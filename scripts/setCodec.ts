import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { CurveMetaPoolCodecBase } from '../deploy/configs/types';
import { TransferSwapper } from './../typechain/TransferSwapper';

dotenv.config();

const setCodec = async () => {
  const [signer] = await ethers.getSigners();
  const xswap = await (await ethers.getContract<TransferSwapper>('TransferSwapper')).connect(signer);
  const tx = await xswap.setCodec(CurveMetaPoolCodecBase.func, '0x4a97B63b27576d774b6BD288Fa6aAe24F086B84c');
  await tx.wait();
  console.log('nonce', tx.nonce);
};

setCodec();
