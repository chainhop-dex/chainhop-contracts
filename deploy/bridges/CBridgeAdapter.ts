import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { deploymentConfigs } from '../configs/config';
import { verify } from '../configs/functions';
import { isTestnet, testnetDeploymentConfigs } from '../configs/testnetConfig';
import { ExecutionNode__factory } from './../../typechain/factories/ExecutionNode__factory';

dotenv.config();

const deployFunc: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = parseInt(await hre.getChainId(), 10);
  const configs = isTestnet(chainId) ? testnetDeploymentConfigs : deploymentConfigs;
  const config = configs[chainId];
  const enode = await deployments.get('ExecutionNode');
  console.log('ExecutionNode', enode.address);
  console.log('MessageBus', config.messageBus);

  const args = [config.nativeWrap, config.messageBus];
  const result = await deploy('CBridgeAdapter', {
    from: deployer,
    log: true,
    args: args
  });

  const deployerSigner = await ethers.getSigner(deployer);

  const xswapFactory = await ethers.getContractFactory<ExecutionNode__factory>('ExecutionNode');
  const main = xswapFactory.attach(enode.address);
  const tx = await main.connect(deployerSigner).setSupportedBridges(['cbridge'], [result.address]);
  console.log('setSupportedBridges: tx', tx.hash);
  await tx.wait(5);
  console.log(`setSupportedBridges: tx ${tx.hash} done`);

  await verify(hre, result, args);
};

deployFunc.tags = ['CBridgeAdapter'];
deployFunc.dependencies = [];
export default deployFunc;
