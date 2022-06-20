import * as dotenv from 'dotenv';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

dotenv.config();

const deployFunc: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy('PlatypusRouter01Codec', {
    from: deployer,
    log: true
  });
};

deployFunc.tags = ['PlatypusRouter01Codec'];
deployFunc.dependencies = [];
export default deployFunc;
