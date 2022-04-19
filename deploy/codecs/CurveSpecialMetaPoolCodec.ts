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

  const result = await deploy('CurveSpecialMetaPoolCodec', {
    from: deployer,
    log: true,
    args: getSpecialMetaPoolCodecConfig(chainId).args
  });
  await verify(hre, result);
};

deployFunc.tags = ['CurveSpecialMetaPoolCodec'];
deployFunc.dependencies = [];
export default deployFunc;
