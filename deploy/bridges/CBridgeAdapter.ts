import * as dotenv from 'dotenv';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { isTestnet, testnetDeploymentConfigs } from '../configs/testnetConfig';
import { deploymentConfigs } from '../configs/config';

dotenv.config();

const deployFunc: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = parseInt(await hre.getChainId(), 10);
  const configs = isTestnet(chainId) ? testnetDeploymentConfigs : deploymentConfigs;
  const config = configs[chainId];

  await deploy('CBridgeAdapter', {
    from: deployer,
    log: true,
    args: [
      config.transferSwapper,
      config.messageBus
    ]
  });
};

deployFunc.tags = ['CBridgeAdapter'];
deployFunc.dependencies = [];
export default deployFunc;
