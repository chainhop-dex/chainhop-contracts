import * as dotenv from 'dotenv';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { verify } from './../configs/functions';

dotenv.config();

const deployFunc: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const codec = await deploy('OneInchCodec', {
    from: deployer,
    log: true
  });

  await verify(hre, codec);
};

deployFunc.tags = ['OneInchCodec'];
deployFunc.dependencies = [];
export default deployFunc;
