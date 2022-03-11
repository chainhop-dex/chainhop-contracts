import * as dotenv from 'dotenv';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

dotenv.config();

const deployFunc: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy('UniswapV2SwapExactTokensForTokensCodec', {
    from: deployer,
    log: true
  });
  const v2Codec = await deployments.get('UniswapV2SwapExactTokensForTokensCodec');

  await deploy('TransferSwapper', {
    from: deployer,
    log: true,
    args: [
      process.env.MESSAGE_BUS,
      process.env.NATIVE_WRAP,
      process.env.FEE_SIGNER,
      process.env.FEE_COLLECTOR,
      ['swapExactTokensForTokens(uint256,uint256,address[],address,uint256)'],
      [v2Codec.address]
    ]
  });
};

deployFunc.tags = ['TransferSwapper'];
deployFunc.dependencies = [];
export default deployFunc;
