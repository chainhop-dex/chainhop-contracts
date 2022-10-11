import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { Deployment } from 'hardhat-deploy/dist/types';
import { DeployFunction, DeployResult } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { AnyswapAdapter__factory, StargateAdapter__factory } from '../typechain';
import { TransferSwapper__factory } from '../typechain/factories/TransferSwapper__factory';
import { CBridgeAdapter__factory } from './../typechain/factories/CBridgeAdapter__factory';
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
    testMode
  ];
  let old: Deployment | undefined;
  try {
    old = await deployments.get('TransferSwapper');
  } catch (e) {
    console.log('no old transfer swapper found');
  }
  console.log(args);
  const deployResult = await deploy('TransferSwapper', { from: deployer, log: true, args });
  const supportedBridges = [];
  const supportedBridgeAdapters = [];

  // use old xswap addr first to avoid deploying the bridge adapters that take xswap addr as a constructor arg
  const xswapAddr = old ? old.address : deployResult.address;
  const cbridgeArgs = [xswapAddr, config.messageBus];
  console.log(cbridgeArgs);
  supportedBridges.push('cbridge');
  supportedBridgeAdapters.push(
    await deploy('CBridgeAdapter', {
      from: deployer,
      log: true,
      args: cbridgeArgs
    })
  );
  const deployerSigner = await ethers.getSigner(deployer);
  // since we used the old xswap address when checking whether adapters need to be deployed,
  // we need to update the xswap address in those skipped adapters once xswap is deployed
  if (xswapAddr != deployResult.address) {
    const factory = await ethers.getContractFactory<CBridgeAdapter__factory>('CBridgeAdapter');
    const adapter = factory.attach(deployResult.address);
    await adapter.connect(deployerSigner).updateMainContract(deployResult.address);
  }

  if (config.anyswapRouters) {
    const anyswapArgs = [xswapAddr, config.anyswapRouters];
    console.log(anyswapArgs);
    supportedBridges.push('anyswap');
    supportedBridgeAdapters.push(
      await deploy('AnyswapAdapter', {
        from: deployer,
        log: true,
        args: anyswapArgs
      })
    );
    if (xswapAddr != deployResult.address) {
      const factory = await ethers.getContractFactory<AnyswapAdapter__factory>('AnyswapAdapter');
      const adapter = factory.attach(deployResult.address);
      await adapter.connect(deployerSigner).updateMainContract(deployResult.address);
    }
  }

  if (config.stargateRouters) {
    const stargateArgs = [xswapAddr, config.stargateRouters];
    console.log(stargateArgs);
    supportedBridges.push('stargate');
    supportedBridgeAdapters.push(
      await deploy('StargateAdapter', {
        from: deployer,
        log: true,
        args: stargateArgs
      })
    );
    if (xswapAddr != deployResult.address) {
      const factory = await ethers.getContractFactory<StargateAdapter__factory>('StargateAdapter');
      const adapter = factory.attach(deployResult.address);
      await adapter.connect(deployerSigner).updateMainContract(deployResult.address);
    }
  }

  if (config.acrossSpokePool) {
    const acrossArgs = [config.acrossSpokePool];
    console.log(acrossArgs);
    supportedBridges.push('across');
    supportedBridgeAdapters.push(
      await deploy('AcrossAdapter', {
        from: deployer,
        log: true,
        args: acrossArgs
      })
    );
  }

  if (config.hyphenLiquidityPool) {
    const hyphenArgs = [config.hyphenLiquidityPool, config.nativeWrap];
    console.log(hyphenArgs);
    supportedBridges.push('hyphen');
    supportedBridgeAdapters.push(
      await deploy('HyphenAdapter', {
        from: deployer,
        log: true,
        args: hyphenArgs
      })
    );
  }

  if (config.hopBridges) {
    const tokens: string[] = [];
    const bridges: string[] = [];
    Object.entries(config.hopBridges).forEach(([token, bridge]) => {
      tokens.push(token);
      bridges.push(bridge);
    });
    const hopArgs = [tokens, bridges, config.isL1, config.nativeWrap];
    console.log(hopArgs);
    supportedBridgeAdapters.push(
      await deploy('HopAdapter', {
        from: deployer,
        log: true,
        args: hopArgs
      })
    );
  }

  const xswapFactory = await ethers.getContractFactory<TransferSwapper__factory>('TransferSwapper');
  const xswap = xswapFactory.attach(deployResult.address);
  const tx = await xswap.connect(deployerSigner).setSupportedBridges(
    supportedBridges,
    supportedBridgeAdapters.map((adapter) => adapter.address)
  );
  console.log('setSupportedBridges: tx', tx.hash);
  tx.wait();
  console.log(`setSupportedBridges: tx ${tx.hash} mined`);

  if (deployEnv !== 'fork') {
    console.log('sleeping 15 seconds before verifying contract');
    await sleep(15000);
    const verifications: Promise<void>[] = [];

    // verify newly deployed TransferSwapper
    if (deployResult.newlyDeployed) {
      verifications.push(verify(hre, deployResult, args));
    }
    // verify newly deployed bridge adapters
    supportedBridgeAdapters.forEach((bridgeAdapter) => {
      if (bridgeAdapter.newlyDeployed) {
        verifications.push(verify(hre, bridgeAdapter));
      }
    });
    // verify newly deployed codecs
    codecDeployResults.forEach((codecDeployment) => {
      if (codecDeployment.newlyDeployed) {
        verifications.push(verify(hre, codecDeployment));
      }
    });

    await Promise.all(verifications);
  }
};

deployTransferSwapper.tags = ['Suite'];
deployTransferSwapper.dependencies = [];
export default deployTransferSwapper;
