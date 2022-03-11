import * as dotenv from 'dotenv';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

dotenv.config();

const deployFunc: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy('MockUniswapV2', {
    from: deployer,
    log: true,
    args: [5000] // 0.5% fake slippage
  });
};

deployFunc.tags = ['MockUniswapV2'];
deployFunc.dependencies = [];
export default deployFunc;
