import * as dotenv from 'dotenv';
import hre, { ethers } from 'hardhat';
import { DeploymentsExtension } from 'hardhat-deploy/types';
import { ExecutionNode } from './../typechain/ExecutionNode';

dotenv.config();

async function addAdapterDeployment(
  adapters: string[],
  names: string[],
  deployments: DeploymentsExtension,
  contractName: string,
  adapterName: string
) {
  try {
    const dep = await deployments.get(contractName);
    adapters.push(dep.address);
    names.push(adapterName);
  } catch {
    console.log(contractName + ' deployment not found, skipping...');
  }
}

const setSupportedBridges = async () => {
  const [signer] = await ethers.getSigners();
  const xswap = await (await ethers.getContract<ExecutionNode>('ExecutionNode')).connect(signer);
  const { deployments } = hre;

  const names: string[] = [];
  const adapters: string[] = [];
  await addAdapterDeployment(adapters, names, deployments, 'AcrossAdapter', 'across');
  await addAdapterDeployment(adapters, names, deployments, 'AnyswapAdapter', 'anyswap');
  await addAdapterDeployment(adapters, names, deployments, 'CBridgeAdapter', 'cbridge');
  await addAdapterDeployment(adapters, names, deployments, 'HopAdapter', 'hop');
  await addAdapterDeployment(adapters, names, deployments, 'HyphenAdapter', 'hyphen');
  await addAdapterDeployment(adapters, names, deployments, 'StargateAdapter', 'stargate');
  console.log('names', names);
  console.log('adapters', adapters);
  const tx = await xswap.setSupportedBridges(names, adapters);
  console.log('tx', tx.hash);
  await tx.wait();
  console.log('done');
};

setSupportedBridges();
