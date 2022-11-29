import * as dotenv from 'dotenv';
import hre, { ethers } from 'hardhat';
import { ExecutionNode } from './../typechain/ExecutionNode';

dotenv.config();

// const CHAIN_IDS = [1, 10, 56, 137, 250, 42161, 43114];
// const REMOTES = ['', '', '', '', '', '', ''];

const CHAIN_IDS = [56, 250, 43114];
const REMOTES = [
  '0x168B96194437Ba18216629542bbdb5C55bBDe95D',
  '0x8cE2463113048a200C5E623Bf2b0E3e6a3E982d4',
  '0x2656f88fD74d9d2149dfdD88f8eC74625334e54B'
];

const setSupportedBridges = async () => {
  const [signer] = await ethers.getSigners();
  const enode = await (await ethers.getContract<ExecutionNode>('ExecutionNode')).connect(signer);
  const currChain = parseInt(await hre.getChainId(), 10);
  const currIdx = CHAIN_IDS.findIndex((id) => id === currChain);

  const chainIds = CHAIN_IDS.filter((_, i) => i !== currIdx);
  const remotes = REMOTES.filter((_, i) => i !== currIdx);
  console.log('setting rmeote enodes for chain', currChain, enode.address);
  console.log('chainIds', chainIds);
  console.log('remotes', remotes);
  const tx = await enode.setRemotes(chainIds, remotes);
  await tx.wait();
  console.log('tx', tx.hash);
};

setSupportedBridges();
