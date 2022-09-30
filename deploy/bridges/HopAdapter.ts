import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { TransferSwapper__factory } from '../../typechain';
import { deploymentConfigs } from '../configs/config';
import { verify } from '../configs/functions';
import { isTestnet, testnetDeploymentConfigs } from '../configs/testnetConfig';

dotenv.config();

const deployFunc: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = parseInt(await hre.getChainId(), 10);
  const configs = isTestnet(chainId) ? testnetDeploymentConfigs : deploymentConfigs;
  const config = configs[chainId];
  const xswap = await deployments.get('TransferSwapper');

  const tokens: string[] = [];
  const bridges: string[] = [];

  if (!config.hopBridges) {
    console.error('no hop bridges configured');
    return;
  }

  Object.entries(config.hopBridges).forEach(([token, bridge]) => {
    tokens.push(token);
    bridges.push(bridge);
  });

  const args = [tokens, bridges, config.isL1, config.nativeWrap];
  const result = await deploy('HopAdapter', {
    from: deployer,
    log: true,
    args: args
  });

  const deployerSigner = await ethers.getSigner(deployer);

  const xswapFactory = await ethers.getContractFactory<TransferSwapper__factory>('TransferSwapper');
  const main = xswapFactory.attach(xswap.address);
  const tx = await main.connect(deployerSigner).setSupportedBridges(['hop'], [result.address]);
  console.log('setSupportedBridges: tx', tx.hash);
  await tx.wait(5);
  console.log(`setSupportedBridges: tx ${tx.hash} done`);

  await verify(hre, result, args);
};

deployFunc.tags = ['HopAdapter'];
deployFunc.dependencies = [];
export default deployFunc;
