import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { DeployFunction, DeployResult } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { TransferSwapper__factory } from '../typechain/factories/TransferSwapper__factory';
import { deploymentConfigs } from './configs/config';
import { sleep, verify } from './configs/functions';
import { isTestnet, testnetDeploymentConfigs } from './configs/testnetConfig';
import { ICodecConfig } from './configs/types';

dotenv.config();

// deploy script for deploying the entire contract suite

const deployCodecs = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = parseInt(await hre.getChainId(), 10);
  const configs = isTestnet(chainId) ? testnetDeploymentConfigs : deploymentConfigs;
  const conf = configs[chainId];

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
  const configs = isTestnet(chainId) ? testnetDeploymentConfigs : deploymentConfigs;
  const config = configs[chainId];

  console.log(`deploying chainhop contract suite on chain ${chainId} using deployer ${deployer}`);

  const { codecDeployResults, codecConfigs } = await deployCodecs(hre);

  const deployEnv = process.env.DEPLOY_ENV;
  let testMode = false;
  if (deployEnv == 'fork') {
    console.warn(`
      !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
      !!!!!! deploying contract using DEPLOY_ENV='fork' and test mode is ENABLED  !!!!!!
      !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
      `);
    testMode = true;
  }
  const args = [
    config.messageBus,
    config.nativeWrap,
    configs.feeSigner,
    configs.feeCollector,
    codecConfigs.map((codecConfig) => codecConfig.func),
    codecDeployResults.map((codecDeployment) => codecDeployment.address),
    config.supportedDex.map((dex) => dex.address),
    config.supportedDex.map((dex) => dex.func),
    config.externalSwapDex,
    testMode
  ];
  console.log(args);
  const deployResult = await deploy('TransferSwapper', { from: deployer, log: true, args });

  const cbridgeArgs = [deployResult.address, config.messageBus];
  console.log(cbridgeArgs);
  const cbridgeResult = await deploy('CBridgeAdapter', {
    from: deployer,
    log: true,
    args: cbridgeArgs
  });

  const anyswapArgs = [deployResult.address, config.anyswapRouters];
  console.log(anyswapArgs);
  const anyswapResult = await deploy('AnyswapAdapter', {
    from: deployer,
    log: true,
    args: anyswapArgs
  });

  const stargateArgs = [deployResult.address, config.stargateRouters];
  console.log(stargateArgs);
  const stargateResult = await deploy('StargateAdapter', {
    from: deployer,
    log: true,
    args: stargateArgs
  });

  const acrossArgs = [config.acrossSpokePool];
  console.log(acrossArgs);
  const acrossResult = await deploy('AcrossAdapter', {
    from: deployer,
    log: true,
    args: acrossArgs
  });

  const xswapFactory = await ethers.getContractFactory<TransferSwapper__factory>('TransferSwapper');
  const xswap = xswapFactory.attach(deployResult.address);
  const deployerSigner = await ethers.getSigner(deployer);
  const tx = await xswap
    .connect(deployerSigner)
    .setSupportedBridges(
      ['cbridge', 'anyswap', 'stargate', 'across'],
      [cbridgeResult.address, anyswapResult.address, stargateResult.address, acrossResult.address]
    );
  console.log('setSupportedBridges: tx', tx.hash);
  tx.wait();
  console.log(`setSupportedBridges: tx ${tx.hash} mined`);

  if (deployEnv !== 'fork') {
    console.log('sleeping 15 seconds before verifying contract');
    await sleep(15000);
    const verifications: Promise<any>[] = [];

    // verify newly deployed TransferSwapper
    if (deployResult.newlyDeployed) {
      verifications.push(verify(hre, deployResult, args));
    }
    // verify newly deployed bridge adapters
    if (cbridgeResult.newlyDeployed) {
      verifications.push(verify(hre, cbridgeResult, cbridgeArgs));
    }
    if (anyswapResult.newlyDeployed) {
      verifications.push(verify(hre, anyswapResult, anyswapArgs));
    }
    if (stargateResult.newlyDeployed) {
      verifications.push(verify(hre, stargateResult, stargateArgs));
    }
    if (acrossResult.newlyDeployed) {
      verifications.push(verify(hre, acrossResult, acrossArgs));
    }
    // verify newly deployed codecs
    for (let i = 0; i < codecDeployResults.length; i++) {
      if (codecDeployResults[i].newlyDeployed) {
        verifications.push(verify(hre, codecDeployResults[i], codecConfigs[i].args));
      }
    }

    await Promise.all(verifications);
  }
};

deployTransferSwapper.tags = ['Suite'];
deployTransferSwapper.dependencies = [];
export default deployTransferSwapper;
