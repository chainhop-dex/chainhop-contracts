import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { CBridgeAdapter__factory, TransferSwapper__factory } from '../../typechain';
import { deploymentConfigs } from '../configs/config';
import { verify } from '../configs/functions';
import { isTestnet, testnetDeploymentConfigs } from '../configs/testnetConfig';

dotenv.config();

const deployFunc: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = parseInt(await hre.getChainId(), 10);
  const configs = isTestnet(chainId) ? testnetDeploymentConfigs : deploymentConfigs;
  const config = configs[chainId];
  const xswap = await deployments.get('TransferSwapper');
  console.log('TransferSwapper', xswap.address);
  console.log('MessageBus', config.messageBus);

  const args = [xswap.address, config.messageBus];
  const result = await deploy('CBridgeAdapter', {
    from: deployer,
    log: true,
    args: args
  });

  const deployerSigner = await ethers.getSigner(deployer);

  const xswapFactory = await ethers.getContractFactory<TransferSwapper__factory>('TransferSwapper');
  const main = xswapFactory.attach(xswap.address);
  let tx = await main.connect(deployerSigner).setSupportedBridges(['cbridge'], [result.address]);
  console.log('setSupportedBridges: tx', tx.hash);
  await tx.wait(5);
  console.log(`setSupportedBridges: tx ${tx.hash} done`);

  const factory = await ethers.getContractFactory<CBridgeAdapter__factory>('CBridgeAdapter');
  const adapter = factory.attach(result.address);
  tx = await adapter.connect(deployerSigner).updateMainContract(xswap.address);
  console.log('updateMainContract for cbridge adapter: tx', tx.hash);
  await tx.wait(5);
  console.log(`updateMainContract for cbridge adapter: tx ${tx.hash} done`);

  await verify(hre, result, args);
};

deployFunc.tags = ['CBridgeAdapter'];
deployFunc.dependencies = [];
export default deployFunc;
