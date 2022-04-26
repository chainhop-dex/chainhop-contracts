import * as dotenv from 'dotenv';
import { DeployFunction, DeployResult } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { deploymentConfigs } from './configs/config';
import { sleep, verify } from './configs/functions';
import { ICodecConfig } from './configs/types';

dotenv.config();

const deployCodecs = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = parseInt(await hre.getChainId(), 10);
  const conf = deploymentConfigs[chainId];

  const codecDeployResults: DeployResult[] = [];
  const codecConfigs: ICodecConfig[] = [];
  for (const codec of conf.codecs) {
    const res = await deploy(codec.name, {
      from: deployer,
      log: true,
      args: codec.args
    });
    codecDeployResults.push(res);
    codecConfigs.push(codec);
  }
  return { codecDeployResults, codecConfigs };
};

const deployTransferSwapper: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = parseInt(await hre.getChainId(), 10);
  const config = deploymentConfigs[chainId];

  console.log(`deploying chainhop contract suite on chain ${chainId} using deployer ${deployer}`);

  const { codecDeployResults, codecConfigs } = await deployCodecs(hre);

  const args = [
    config.messageBus,
    config.nativeWrap,
    deploymentConfigs.feeSigner,
    deploymentConfigs.feeCollector,
    codecConfigs.map((codecConfig) => codecConfig.func),
    codecDeployResults.map((codecDeployment) => codecDeployment.address),
    config.supportedDex.map((dex) => dex.address),
    config.supportedDex.map((dex) => dex.func)
  ];
  console.log(args);
  const deployResult = await deploy('TransferSwapper', { from: deployer, log: true, args });

  console.log('sleeping 15 seconds before verifying contract');
  await sleep(15000);

  // verify newly deployed TransferSwapper
  await verify(hre, deployResult, args);

  // verify newly deployed codecs
  for (let i = 0; i < codecDeployResults.length; i++) {
    await verify(hre, codecDeployResults[i], codecConfigs[i].args);
  }
};

deployTransferSwapper.tags = ['TransferSwapper'];
deployTransferSwapper.dependencies = [];
export default deployTransferSwapper;
