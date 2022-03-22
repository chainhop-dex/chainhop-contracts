import * as dotenv from 'dotenv';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

dotenv.config();

const deployFunc: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy('WETH', { from: deployer, log: true });
  const weth = await deployments.get('WETH');

  await hre.run('verify:verify', { address: weth.address });
};

deployFunc.tags = ['WETH'];
deployFunc.dependencies = [];
export default deployFunc;
