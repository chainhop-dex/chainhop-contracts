import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { TransferSwapper__factory } from './../../typechain/factories/TransferSwapper__factory';
import { verify } from './../configs/functions';

dotenv.config();

const deployFunc: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const xswapDeployment = await deployments.get('TransferSwapper');
  const codec = await deploy('OneInchCodec', {
    from: deployer,
    log: true
  });
  const factory = await ethers.getContractFactory<TransferSwapper__factory>('TransferSwapper');
  const xswap = factory.attach(xswapDeployment.address);

  let tx = await xswap.setCodec('uniswapV3Swap(uint256,uint256,uint256[])', codec.address);
  await tx.wait(1);
  tx = await xswap.setCodec('unoswap(address,uint256,uint256,bytes32[])', codec.address);
  await tx.wait(1);
  tx = await xswap.setCodec(
    'swap(address,(address,address,address,address,uint256,uint256,uint256,bytes),bytes)',
    codec.address
  );
  await tx.wait(1);
  tx = await xswap.setCodec(
    'fillOrderRFQ((uint256,address,address,address,address,uint256,uint256),bytes,uint256,uint256)',
    codec.address
  );

  await verify(hre, codec);
};

deployFunc.tags = ['OneInchCodec'];
deployFunc.dependencies = [];
export default deployFunc;
