import * as dotenv from 'dotenv';
import { AbiCoder } from 'ethers/lib/utils';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { deploymentConfigs } from './configs/config';
import { sleep, verify } from './configs/functions';
import { isTestnet, testnetDeploymentConfigs } from './configs/testnetConfig';

dotenv.config();

// deploy script for deploying the entire contract suite

const deployCodecs = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = parseInt(await hre.getChainId(), 10);
  const configs = isTestnet(chainId) ? testnetDeploymentConfigs : deploymentConfigs;
  const conf = configs[chainId];

  const func2CodecAddr: { [key: string]: string } = {};
  for (const codec of conf.codecs) {
    console.log(codec.args);
    const res = await deploy(codec.name, {
      from: deployer,
      log: true,
      args: codec.args
    });
    func2CodecAddr[codec.func] = res.address;
  }
  const dexList: string[] = [];
  const funcs: string[] = [];
  const codecs: string[] = [];
  for (const dex of conf.supportedDex) {
    dexList.push(dex.address);
    funcs.push(dex.func);
    codecs.push(func2CodecAddr[dex.func]);
  }
  return { dexList, funcs, codecs };
};

const deployBridgeAdapters = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = parseInt(await hre.getChainId(), 10);
  const configs = isTestnet(chainId) ? testnetDeploymentConfigs : deploymentConfigs;
  const config = configs[chainId];

  const bridgeProviders: string[] = [];
  const bridgeAdapters: string[] = [];

  const cbridgeArgs = [config.nativeWrap, config.messageBus];
  console.log(cbridgeArgs);
  const cbridgeAdapter = await deploy('CBridgeAdapter', {
    from: deployer,
    log: true,
    args: cbridgeArgs
  });
  bridgeProviders.push('cbridge');
  bridgeAdapters.push(cbridgeAdapter.address);

  if (config.anyswapRouters) {
    const anyswapArgs = [config.anyswapRouters];
    console.log(anyswapArgs);
    const res = await deploy('AnyswapAdapter', {
      from: deployer,
      log: true,
      args: anyswapArgs
    });
    bridgeProviders.push('anyswap');
    bridgeAdapters.push(res.address);
    await sleep(1000);
  }
  if (config.stargateRouters) {
    const stargateArgs = [config.nativeWrap, config.stargateRouters];
    console.log(stargateArgs);
    const res = await deploy('StargateAdapter', {
      from: deployer,
      log: true,
      args: stargateArgs
    });
    bridgeProviders.push('stargate');
    bridgeAdapters.push(res.address);
    await sleep(1000);
  }
  if (config.acrossSpokePool) {
    const acrossArgs = [config.acrossSpokePool];
    console.log(acrossArgs);
    const res = await deploy('AcrossAdapter', {
      from: deployer,
      log: true,
      args: acrossArgs
    });
    bridgeProviders.push('across');
    bridgeAdapters.push(res.address);
    await sleep(1000);
  }
  if (config.hyphenLiquidityPool) {
    const hyphenArgs = [config.hyphenLiquidityPool, config.nativeWrap];
    console.log(hyphenArgs);
    const res = await deploy('HyphenAdapter', {
      from: deployer,
      log: true,
      args: hyphenArgs
    });
    bridgeProviders.push('hyphen');
    bridgeAdapters.push(res.address);
    await sleep(1000);
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
    const res = await deploy('HopAdapter', {
      from: deployer,
      log: true,
      args: hopArgs
    });
    bridgeProviders.push('hop');
    bridgeAdapters.push(res.address);
    await sleep(1000);
  }
  return { bridgeProviders, bridgeAdapters };
};

const deploySuite: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = parseInt(await hre.getChainId(), 10);
  const configs = isTestnet(chainId) ? testnetDeploymentConfigs : deploymentConfigs;
  const config = configs[chainId];

  console.log(`deploying chainhop contract suite on chain ${chainId} using deployer ${deployer}...`);

  const feeVault = await deployments.get('FeeVault');

  console.log(`deploying dex codecs...`);
  const { dexList, funcs, codecs } = await deployCodecs(hre);

  console.log(`deploying bridge adapters...`);
  const { bridgeProviders, bridgeAdapters } = await deployBridgeAdapters(hre);

  const constructorArgs = [false, config.messageBus, config.nativeWrap];
  const initArgs: [boolean, string, string, string, string, string[], string[], string[], string[], string[]] = [
    false,
    config.messageBus as string,
    config.nativeWrap,
    configs.feeSigner as string,
    feeVault.address,
    dexList,
    funcs,
    codecs,
    bridgeProviders,
    bridgeAdapters
  ];

  console.log(`deploying ExecutionNode...`);
  console.log(initArgs);
  await deploy('ExecutionNode', {
    from: deployer,
    log: true,
    args: constructorArgs,
    proxy: {
      proxyContract: 'OptimizedTransparentProxy',
      execute: {
        // init() can only be called once during the first deployment of the proxy contract.
        // any subsequent changes to the proxy contract's state must be done through their respective set methods via owner key.
        init: {
          methodName: 'init',
          args: initArgs
        }
      }
    }
  });

  console.log('sleeping 5 seconds before verifying contract');
  await sleep(5000);
  console.log('verifying ExecutionNode.sol...');
  const impl = await deployments.get('ExecutionNode_Implementation');

  const abi = new AbiCoder();
  const encodedArgs = abi.encode(['bool', 'address', 'address'], constructorArgs);
  console.log('encoded constructor args', encodedArgs);
  await verify(hre, impl, constructorArgs);
};

deploySuite.tags = ['Suite'];
deploySuite.dependencies = ['FeeVault'];
export default deploySuite;
