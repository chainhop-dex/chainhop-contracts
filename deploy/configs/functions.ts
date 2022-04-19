import * as dotenv from 'dotenv';
import fs from 'fs';
import { DeployResult } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import toml from 'toml';
import {
  CurveMetaPoolCodecBase,
  CurvePoolCodec,
  CurveSpecialMetaPoolCodecBase,
  ICodecConfig,
  IDexConfig,
  IMetaPoolArgs,
  IPoolConfig
} from './types';

dotenv.config();

const readCurveConfig = () => {
  const configPath = process.env.CURVE_POOL_CONFIG_PATH;
  if (!configPath) {
    throw Error('empty config path');
  }
  return toml.parse(fs.readFileSync(configPath).toString());
};

const getCurvePools = (chainId: number): IPoolConfig[] => {
  const config = readCurveConfig();
  const pools = config.curve_pool as IPoolConfig[];
  return pools.filter((p) => p['chain_id'] == chainId);
};

export const getSupportedCurvePools = (chainId: number): IDexConfig[] => {
  return getCurvePools(chainId).map((pool) => {
    const dexConfig = { address: pool.address, func: '' };
    switch (pool.type) {
      case 'plain':
        dexConfig.func = CurvePoolCodec.func;
        break;
      case 'meta':
        dexConfig.func = CurveMetaPoolCodecBase.func;
        break;
      case 'meta-special':
        dexConfig.func = CurveSpecialMetaPoolCodecBase.func;
        break;
      default:
        throw Error(`malformed pool type (${pool.type})`);
    }
    return dexConfig;
  });
};

export const getMetaPoolCodecConfig = (chainId: number): ICodecConfig => {
  const args = getCurvePools(chainId)
    .filter((pool) => pool.type === 'meta')
    .reduce<IMetaPoolArgs>(
      (args, p) => {
        args[0].push(p.address);
        args[1].push(p.tokens);
        return args;
      },
      [[], []]
    );
  return { ...CurveMetaPoolCodecBase, args };
};

export const getSpecialMetaPoolCodecConfig = (chainId: number): ICodecConfig => {
  const args = getCurvePools(chainId)
    .filter((pool) => pool.type === 'meta-special')
    .reduce<IMetaPoolArgs>(
      (args, p) => {
        args[0].push(p.address);
        args[1].push(p.tokens);
        return args;
      },
      [[], []]
    );
  return { ...CurveSpecialMetaPoolCodecBase, args };
};

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const verify = async (hre: HardhatRuntimeEnvironment, deployResult: DeployResult, args?: any) => {
  return hre.run('verify:verify', {
    address: deployResult.address,
    constructorArguments: args
  });
};
