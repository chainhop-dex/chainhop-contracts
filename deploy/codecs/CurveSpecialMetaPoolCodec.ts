import * as dotenv from 'dotenv';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getSpecialMetaPoolCodecConfig, verify } from './../configs/functions';

dotenv.config();

const deployFunc: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const chainId = parseInt(await hre.getChainId());

  const args = getSpecialMetaPoolCodecConfig(chainId).args;
  console.log('args', args);
  const result = await deploy('CurveSpecialMetaPoolCodec', {
    from: deployer,
    log: true,
    args
  });

  await verify(hre, result, args);
};

deployFunc.tags = ['CurveSpecialMetaPoolCodec'];
deployFunc.dependencies = [];
export default deployFunc;
