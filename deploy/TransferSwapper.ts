import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { DeployFunction, DeployResult } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { TransferSwapper__factory } from '../typechain/factories/TransferSwapper__factory';
import { AnyswapAdapter__factory } from './../typechain/factories/AnyswapAdapter__factory';
import { CBridgeAdapter__factory } from './../typechain/factories/CBridgeAdapter__factory';
import { StargateAdapter__factory } from './../typechain/factories/StargateAdapter__factory';
import { bridgeAdapters } from './configs/adapters';
import { deploymentConfigs } from './configs/config';
import { verify } from './configs/functions';
import { isTestnet, testnetDeploymentConfigs } from './configs/testnetConfig';
import { ICodecConfig } from './configs/types';

dotenv.config();

// deploys TransferSwapper and codecs only, then set supported bridges in the contract and update
// mainContract address in bridge adapters

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
  console.log(args);

  const deployResult = await deploy('TransferSwapper', { from: deployer, log: true, args });

  // Update supported bridge adapters in TransferSwapper

  const xswapFactory = await ethers.getContractFactory<TransferSwapper__factory>('TransferSwapper');
  const xswap = xswapFactory.attach(deployResult.address);
  const deployerSigner = await ethers.getSigner(deployer);

  const bridgeTypes = bridgeAdapters[chainId].map((bridge) => bridge.type);
  const bridgeAddrs = bridgeAdapters[chainId].map((bridge) => bridge.address);

  let tx = await xswap.connect(deployerSigner).setSupportedBridges(bridgeTypes, bridgeAddrs);
  console.log('setSupportedBridges: tx', tx.hash);
  tx.wait();
  console.log(`setSupportedBridges: tx ${tx.hash} done`);

  // Update main contract addrs for each adapter

  const cbridgeAdapter = bridgeAdapters[chainId].find((bridge) => bridge.type == 'cbridge');
  const anyswapAdapter = bridgeAdapters[chainId].find((bridge) => bridge.type == 'anyswap');
  const stargateAdapter = bridgeAdapters[chainId].find((bridge) => bridge.type == 'stargate');

  if (cbridgeAdapter) {
    const factory = await ethers.getContractFactory<CBridgeAdapter__factory>('CBridgeAdapter');
    const adapter = factory.attach(cbridgeAdapter.address);
    tx = await adapter.connect(deployerSigner).updateMainContract(deployResult.address);
    console.log('updateMainContract for cbridge adapter: tx', tx.hash);
    await tx.wait();
    console.log(`updateMainContract for cbridge adapter: tx ${tx.hash} done`);
  }

  if (anyswapAdapter) {
    const factory = await ethers.getContractFactory<AnyswapAdapter__factory>('AnyswapAdapter');
    const adapter = factory.attach(anyswapAdapter.address);
    tx = await adapter.connect(deployerSigner).updateMainContract(deployResult.address);
    console.log('updateMainContract for anyswap adapter: tx', tx.hash);
    await tx.wait();
    console.log(`updateMainContract for anyswap adapter: tx ${tx.hash} done`);
  }

  if (stargateAdapter) {
    const factory = await ethers.getContractFactory<StargateAdapter__factory>('StargateAdapter');
    const adapter = factory.attach(stargateAdapter.address);
    tx = await adapter.connect(deployerSigner).updateMainContract(deployResult.address);
    console.log('updateMainContract for stargate adapter: tx', tx.hash);
    await tx.wait();
    console.log(`updateMainContract for stargate adapter: tx ${tx.hash} done`);
  }

  // verify newly deployed TransferSwapper
  if (deployResult.newlyDeployed) {
    verify(hre, deployResult, args);
  }
};

deployTransferSwapper.tags = ['TransferSwapper'];
deployTransferSwapper.dependencies = [];
export default deployTransferSwapper;
