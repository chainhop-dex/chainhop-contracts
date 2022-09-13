import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { CBridgeAdapter__factory } from '../../typechain';
import { deploymentConfigs } from '../configs/config';
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

  const result = await deploy('CBridgeAdapter', {
    from: deployer,
    log: true,
    args: [xswap.address, config.messageBus]
  });

  const factory = await ethers.getContractFactory<CBridgeAdapter__factory>('CBridgeAdapter');
  const adapter = factory.attach(result.address);
  const tx = await adapter.connect(deployer).updateMainContract(xswap.address);
  console.log('updateMainContract for cbridge adapter: tx', tx.hash);
  await tx.wait(5);
  console.log(`updateMainContract for cbridge adapter: tx ${tx.hash} done`);
};

deployFunc.tags = ['CBridgeAdapter'];
deployFunc.dependencies = [];
export default deployFunc;
