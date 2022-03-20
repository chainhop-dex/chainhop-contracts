import * as dotenv from 'dotenv';
import { parseUnits } from 'ethers/lib/utils';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

dotenv.config();

const deployFunc: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const args = [
    ['0xf4B2cbc3bA04c478F0dC824f4806aC39982Dce73', '0xcbe56b00d173a26a5978ce90db2e33622fd95a28'],
    [6, 6],
    parseUnits('3', 3) // mock slippage 0.3%
  ];

  await deploy('MockCurvePool', { from: deployer, log: true, args });
  const curve = await deployments.get('MockCurvePool');

  await hre.run('verify:verify', {
    address: curve.address,
    constructorArguments: args
  });
};

deployFunc.tags = ['MockCurvePool'];
deployFunc.dependencies = [];
export default deployFunc;
