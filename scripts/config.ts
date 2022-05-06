import hre from 'hardhat';

async function main() {
  hre.run('node', { tags: 'TransferSwapper,Multicall2', hostname: '0.0.0.0' });
  // await hre.network.provider.send('evm_setAutomine', [false]);
  // await hre.network.provider.send('evm_setIntervalMining', [200]);
}

main();
