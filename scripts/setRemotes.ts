import * as dotenv from 'dotenv';
import hre, { ethers } from 'hardhat';
import { ExecutionNode } from './../typechain/ExecutionNode';

dotenv.config();

const CHAIN_IDS = [1, 10, 56, 137, 250, 42161, 43114];
const REMOTES = [
  '0xED8877f8536781d2FC40C1E0054cbeB8fD960Ee4',
  '0x3eECe7a5fdDa7c6b48C0e0D3Da0beE2708626A48',
  '0x168B96194437Ba18216629542bbdb5C55bBDe95D',
  '0xaF5457eBCc6c2AFc56f044d9CC2484ec2B34142A',
  '0x8cE2463113048a200C5E623Bf2b0E3e6a3E982d4',
  '0x49CaD6Da884B476179DB105FD983566f98fF9e66',
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
