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

  await deploy('AnyswapAdapter', {
    from: deployer,
    log: true,
    args: [
      config.transferSwapper,
      config.anyswapRouters
    ]
  });
};

deployFunc.tags = ['AnyswapAdapter'];
deployFunc.dependencies = [];
export default deployFunc;
