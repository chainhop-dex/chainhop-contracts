import * as dotenv from 'dotenv';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { verify } from '../configs/functions';

dotenv.config();

const deployFunc: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const result = await deploy('UniswapV3ExactInputCodec', {
    from: deployer,
    log: true
  });

  await verify(hre, result);
};

deployFunc.tags = ['UniswapV3ExactInputCodec'];
deployFunc.dependencies = [];
export default deployFunc;
