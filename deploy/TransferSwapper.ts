import * as dotenv from 'dotenv';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

dotenv.config();

const deployFunc: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy('UniswapV2SwapExactTokensForTokensCodec', { from: deployer, log: true });
  const v2Codec = await deployments.get('UniswapV2SwapExactTokensForTokensCodec');

  await deploy('UniswapV3ExactInputSingleCodec', { from: deployer, log: true });
  const v3Codec = await deployments.get('UniswapV3ExactInputSingleCodec');

  await deploy('CurvePoolCodec', { from: deployer, log: true });
  const curveCodec = await deployments.get('CurvePoolCodec');

  const args = [
    process.env.MESSAGE_BUS,
    process.env.NATIVE_WRAP,
    process.env.FEE_SIGNER,
    process.env.FEE_COLLECTOR,
    [
      'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
      'exactInput((bytes,address,uint256,uint256,uint256))',
      'exchange(int128,int128,uint256,uint256)'
    ],
    [v2Codec.address, v3Codec.address, curveCodec.address]
  ];

  await deploy('TransferSwapper', { from: deployer, log: true, args });
  const xswap = await deployments.get('TransferSwapper');

  await hre.run('verify:verify', { address: v2Codec.address });
  await hre.run('verify:verify', { address: v3Codec.address });
  await hre.run('verify:verify', { address: curveCodec.address });

  await hre.run('verify:verify', {
    address: xswap.address,
    constructorArguments: args
  });
};

deployFunc.tags = ['TransferSwapper'];
deployFunc.dependencies = [];
export default deployFunc;
