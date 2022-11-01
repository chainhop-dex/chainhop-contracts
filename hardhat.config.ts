import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-etherscan';
import '@nomiclabs/hardhat-waffle';
import '@typechain/hardhat';
import * as dotenv from 'dotenv';
import 'hardhat-contract-sizer';
import 'hardhat-deploy';
import 'hardhat-gas-reporter';
import { HardhatUserConfig } from 'hardhat/types';

dotenv.config();

const DEFAULT_ENDPOINT = 'http://localhost:8545';
const DEFAULT_PRIVATE_KEY = process.env.DEFAULT_PRIVATE_KEY || 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

// Testnets
const goerliEndpoint = process.env.GOERLI_ENDPOINT || DEFAULT_ENDPOINT;
const goerliPrivateKey = process.env.GOERLI_PRIVATE_KEY || DEFAULT_PRIVATE_KEY;

const bscTestEndpoint = process.env.BSC_TEST_ENDPOINT || DEFAULT_ENDPOINT;
const bscTestPrivateKey = process.env.BSC_TEST_PRIVATE_KEY || DEFAULT_PRIVATE_KEY;

// Mainnets
const ethMainnetEndpoint = process.env.ETH_MAINNET_ENDPOINT || DEFAULT_ENDPOINT;
const ethMainnetPrivateKey = process.env.ETH_MAINNET_PRIVATE_KEY || DEFAULT_PRIVATE_KEY;

const bscEndpoint = process.env.BSC_ENDPOINT || DEFAULT_ENDPOINT;
const bscPrivateKey = process.env.BSC_PRIVATE_KEY || DEFAULT_PRIVATE_KEY;

const arbitrumEndpoint = process.env.ARBITRUM_ENDPOINT || DEFAULT_ENDPOINT;
const arbitrumPrivateKey = process.env.ARBITRUM_PRIVATE_KEY || DEFAULT_PRIVATE_KEY;

const polygonEndpoint = process.env.POLYGON_ENDPOINT || DEFAULT_ENDPOINT;
const polygonPrivateKey = process.env.POLYGON_PRIVATE_KEY || DEFAULT_PRIVATE_KEY;

const fantomEndpoint = process.env.FANTOM_ENDPOINT || DEFAULT_ENDPOINT;
const fantomPrivateKey = process.env.FANTOM_PRIVATE_KEY || DEFAULT_PRIVATE_KEY;

const avalancheEndpoint = process.env.AVALANCHE_ENDPOINT || DEFAULT_ENDPOINT;
const avalanchePrivateKey = process.env.AVALANCHE_PRIVATE_KEY || DEFAULT_PRIVATE_KEY;

const optimismEndpoint = process.env.OPTIMISM_ENDPOINT || DEFAULT_ENDPOINT;
const optimismPrivateKey = process.env.OPTIMISM_PRIVATE_KEY || DEFAULT_PRIVATE_KEY;

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {},
    goerli: {
      url: goerliEndpoint,
      accounts: [`0x${goerliPrivateKey}`]
    },
    bscTest: {
      url: bscTestEndpoint,
      accounts: [`0x${bscTestPrivateKey}`]
    },
    ethMainnet: {
      url: ethMainnetEndpoint,
      accounts: [`0x${ethMainnetPrivateKey}`]
    },
    bsc: {
      url: bscEndpoint,
      accounts: [`0x${bscPrivateKey}`]
    },
    arbitrum: {
      url: arbitrumEndpoint,
      accounts: [`0x${arbitrumPrivateKey}`]
    },
    polygon: {
      url: polygonEndpoint,
      accounts: [`0x${polygonPrivateKey}`],
      gasPrice: 176591248443
    },
    fantom: {
      url: fantomEndpoint,
      accounts: [`0x${fantomPrivateKey}`]
    },
    avalanche: {
      url: avalancheEndpoint,
      accounts: [`0x${avalanchePrivateKey}`]
    },
    optimism: {
      url: optimismEndpoint,
      accounts: [`0x${optimismPrivateKey}`]
    }
  },
  namedAccounts: {
    deployer: {
      default: 0
    }
  },
  solidity: {
    version: '0.8.15',
    settings: {
      optimizer: {
        enabled: true,
        runs: 800
      }
      // viaIR: true
    }
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: false,
    disambiguatePaths: false
  },
  gasReporter: {
    enabled: !!process.env.REPORT_GAS,
    noColors: true,
    currency: 'USD',
    outputFile: process.env.BENCHMARK ? `reports/gas_usage/benchmark-${process.env.BENCHMARK}.txt` : 'reports/gas_usage/summary.txt'
  },
  typechain: {
    outDir: 'typechain',
    target: 'ethers-v5'
  },
  etherscan: {
    apiKey: {
      goerli: process.env.ETHERSCAN_API_KEY || '',
      bscTestnet: process.env.BSCSCAN_API_KEY || '',

      mainnet: process.env.ETHERSCAN_API_KEY || '',
      optimisticEthereum: process.env.OPTIMISTIC_ETHERSCAN_API_KEY || '',
      avalanche: process.env.SNOWTRACE_API_KEY || '',
      bsc: process.env.BSCSCAN_API_KEY || '',
      arbitrumOne: process.env.ARBISCAN_API_KEY || '',
      opera: process.env.FTMSCAN_API_KEY || '',
      polygon: process.env.POLYGONSCAN_API_KEY || ''
    }
  }
};

export default config;
