import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { deploymentConfigs } from './configs/config';
import { isTestnet, testnetDeploymentConfigs } from './configs/testnetConfig';

const deployFeeVault: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = parseInt(await hre.getChainId(), 10);
  const configs = isTestnet(chainId) ? testnetDeploymentConfigs : deploymentConfigs;

  await deploy('FeeVault', {
    from: deployer,
    log: true,
    args: [configs.feeCollector]
  });
};

deployFeeVault.tags = ['Suite'];
deployFeeVault.dependencies = [];
export default deployFeeVault;
