import * as dotenv from 'dotenv';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

dotenv.config();

const deployFunc: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  let res = await deploy('UniswapV2SwapExactTokensForTokensCodec', { from: deployer, log: true });
  const newUniV2 = res.newlyDeployed;
  const v2Codec = await deployments.get('UniswapV2SwapExactTokensForTokensCodec');

  res = await deploy('UniswapV3ExactInputCodec', { from: deployer, log: true });
  const newUniV3 = res.newlyDeployed;
  const v3Codec = await deployments.get('UniswapV3ExactInputCodec');

  res = await deploy('CurvePoolCodec', { from: deployer, log: true });
  const newCurve = res.newlyDeployed;
  const curveCodec = await deployments.get('CurvePoolCodec');

  const supportedDexList = process.env.SUPPORTED_DEX?.split(',').map((dex) => dex.trim());

  const args = [
    process.env.MESSAGE_BUS,
    process.env.NATIVE_WRAP,
    process.env.FEE_SIGNER,
    process.env.FEE_COLLECTOR,
    [
      'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
      'exchange(int128,int128,uint256,uint256)',
      'exactInput((bytes,address,uint256,uint256,uint256))'
    ],
    [v2Codec.address, curveCodec.address, v3Codec.address],
    supportedDexList
  ];
  console.log(args);
  await deploy('TransferSwapper', { from: deployer, log: true, args });
  const xswap = await deployments.get('TransferSwapper');

  if (newUniV2) {
    await hre.run('verify:verify', { address: v2Codec.address });
  }
  if (newUniV3) {
    await hre.run('verify:verify', { address: v3Codec.address });
  }
  if (newCurve) {
    await hre.run('verify:verify', { address: curveCodec.address });
  }

  await hre.run('verify:verify', {
    address: xswap.address,
    constructorArguments: args
  });
};

deployFunc.tags = ['TransferSwapper'];
deployFunc.dependencies = [];
export default deployFunc;
