import { parseUnits } from '@ethersproject/units';
import { Wallet } from '@ethersproject/wallet';
import { Fixture } from 'ethereum-waffle/dist/esm';
import { ethers, waffle } from 'hardhat';
import {
  Bridge,
  Bridge__factory,
  CBridgeAdapter__factory,
  CurvePoolCodec,
  CurvePoolCodec__factory,
  ExecutionNode,
  ExecutionNode__factory,
  FeeVault__factory,
  IntermediaryOriginalToken__factory,
  MessageBus,
  MessageBus__factory,
  Mock1inch__factory,
  MockCurvePool__factory,
  MockUniswapV2__factory,
  OneInchCodec,
  OneInchCodec__factory,
  PlatypusRouter01Codec,
  PlatypusRouter01Codec__factory,
  TestERC20,
  TestERC20__factory,
  UniswapV2SwapExactTokensForTokensCodec,
  UniswapV2SwapExactTokensForTokensCodec__factory,
  UniswapV3ExactInputCodec,
  UniswapV3ExactInputCodec__factory,
  WETH
} from '../../typechain';
import { CBridgeAdapter } from '../../typechain/CBridgeAdapter';
import { MinimalUniswapV2__factory } from '../../typechain/factories/MinimalUniswapV2__factory';
import { WETH__factory } from '../../typechain/factories/WETH__factory';
import { IntermediaryOriginalToken } from '../../typechain/IntermediaryOriginalToken';
import { MinimalUniswapV2 } from '../../typechain/MinimalUniswapV2';
import { Mock1inch } from '../../typechain/Mock1inch';
import { MockCurvePool } from '../../typechain/MockCurvePool';
import { MockUniswapV2 } from '../../typechain/MockUniswapV2';
import { FeeVault } from './../../typechain/FeeVault';
import * as consts from './constants';

// Workaround for https://github.com/nomiclabs/hardhat/issues/849
// TODO: Remove once fixed upstream.
export function loadFixture<T>(fixture: Fixture<T>): Promise<T> {
  const provider = waffle.provider;
  return waffle.createFixtureLoader(provider.getWallets(), provider)(fixture);
}

export interface BridgeContracts {
  bridge: Bridge;
  messageBus: MessageBus;
}

export interface WrappedBridgeTokens {
  wrappedBridgeToken: IntermediaryOriginalToken;
}

export interface ChainHopContracts {
  enode: ExecutionNode;
  cbridgeAdapter: CBridgeAdapter;
  feeVault: FeeVault;
}

export interface CodecContracts {
  v2Codec: UniswapV2SwapExactTokensForTokensCodec;
  v3Codec: UniswapV3ExactInputCodec;
  curveCodec: CurvePoolCodec;
  platypusCodec: PlatypusRouter01Codec;
  oneinchCodec: OneInchCodec;
}

export interface TokenContracts {
  tokenA: TestERC20;
  tokenB: TestERC20;
  weth: WETH;
}

export interface MockDexContracts {
  mockV2: MockUniswapV2;
  mockCurve: MockCurvePool;
  mock1inch: Mock1inch;
}

export interface MinimalDexContracts {
  mockV2: MinimalUniswapV2;
}

export async function deployBridgeContracts(admin: Wallet, weth: string): Promise<BridgeContracts> {
  const bridgeFactory = (await ethers.getContractFactory('Bridge')) as Bridge__factory;
  const bridge = await bridgeFactory.connect(admin).deploy();
  await bridge.deployed();
  await bridge.setWrap(weth);

  const messageBusFactory = (await ethers.getContractFactory('MessageBus')) as MessageBus__factory;
  const messageBus = await messageBusFactory
    .connect(admin)
    .deploy(
      bridge.address,
      bridge.address,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero
    );
  await messageBus.deployed();
  await messageBus.setFeeBase(1);
  await messageBus.setFeePerByte(1);

  return { bridge, messageBus };
}

export async function deployWrappedBridgeToken(admin: Wallet, canonicalToken: string, bridge: string) {
  const wrappedBridgeTokenFactory = (await ethers.getContractFactory('IntermediaryOriginalToken')) as IntermediaryOriginalToken__factory;
  const wrappedBridgeToken = await wrappedBridgeTokenFactory
    .connect(admin)
    .deploy('TestWrappedBridgeToken', 'TestWrappedBridgeToken', [bridge], canonicalToken);
  await wrappedBridgeToken.deployed();
  return { wrappedBridgeToken };
}

export async function deployCodecContracts(admin: Wallet): Promise<CodecContracts> {
  const v2CodecFactory = (await ethers.getContractFactory(
    'UniswapV2SwapExactTokensForTokensCodec'
  )) as UniswapV2SwapExactTokensForTokensCodec__factory;
  const v2Codec = await v2CodecFactory.connect(admin).deploy();
  await v2Codec.deployed();

  const v3CodecFactory = (await ethers.getContractFactory('UniswapV3ExactInputCodec')) as UniswapV3ExactInputCodec__factory;
  const v3Codec = await v3CodecFactory.connect(admin).deploy();
  await v3Codec.deployed();

  const curveCodecFactory = (await ethers.getContractFactory('CurvePoolCodec')) as CurvePoolCodec__factory;
  const curveCodec = await curveCodecFactory.connect(admin).deploy();
  await curveCodec.deployed();

  const platypusCodecFactory = (await ethers.getContractFactory('PlatypusRouter01Codec')) as PlatypusRouter01Codec__factory;
  const platypusCodec = await platypusCodecFactory.connect(admin).deploy();
  await platypusCodec.deployed();

  const oneinchCodecFactory = (await ethers.getContractFactory('OneInchCodec')) as OneInchCodec__factory;
  const oneinchCodec = await oneinchCodecFactory.connect(admin).deploy();
  await oneinchCodec.deployed();

  return { v2Codec, v3Codec, curveCodec, platypusCodec, oneinchCodec };
}

export async function deployChainhopContracts(admin: Wallet, weth: string, messageBus: string): Promise<ChainHopContracts> {
  const ExecutionNodeFactory = (await ethers.getContractFactory('ExecutionNode')) as ExecutionNode__factory;
  const enode = await ExecutionNodeFactory.connect(admin).deploy(true, messageBus, weth);
  await enode.deployed();

  const FeeVaultFactory = (await ethers.getContractFactory('FeeVault')) as FeeVault__factory;
  const feeVault = await FeeVaultFactory.connect(admin).deploy(consts.ZERO_ADDR);
  await feeVault.deployed();

  const bridgeAdapterFactory = (await ethers.getContractFactory('CBridgeAdapter')) as CBridgeAdapter__factory;
  const cbridgeAdapter = await bridgeAdapterFactory.connect(admin).deploy(weth, messageBus);
  await cbridgeAdapter.deployed();

  return { enode: enode, cbridgeAdapter, feeVault };
}

export async function deployTokenContracts(admin: Wallet): Promise<TokenContracts> {
  const wethFactory = (await ethers.getContractFactory('WETH')) as WETH__factory;
  const weth = await wethFactory.connect(admin).deploy();
  await weth.deployed();

  const testERC20Factory = (await ethers.getContractFactory('TestERC20')) as TestERC20__factory;
  const tokenA = await testERC20Factory.connect(admin).deploy();
  await tokenA.deployed();
  const tokenB = await testERC20Factory.connect(admin).deploy();
  await tokenB.deployed();
  const tokenC = await testERC20Factory.connect(admin).deploy();
  await tokenC.deployed();
  const tokenD = await testERC20Factory.connect(admin).deploy();
  await tokenD.deployed();
  const tokenE = await testERC20Factory.connect(admin).deploy();
  await tokenE.deployed();

  return { weth, tokenA, tokenB };
}

export async function deployMockDexContracts(admin: Wallet, tokens: TokenContracts): Promise<MockDexContracts> {
  const mockV2Factory = (await ethers.getContractFactory('MockUniswapV2')) as MockUniswapV2__factory;
  const mockV2 = await mockV2Factory.connect(admin).deploy(parseUnits(consts.UNISWAP_V2_SLIPPAGE.toString(), 4)); // 5% fixed fake slippage
  await mockV2.deployed();

  const mockCurveFactory = (await ethers.getContractFactory('MockCurvePool')) as MockCurvePool__factory;
  const mockCurve = await mockCurveFactory
    .connect(admin)
    .deploy(
      [tokens.tokenA.address, tokens.tokenB.address, tokens.weth.address],
      [18, 18, 18],
      parseUnits(consts.CURVE_SLIPPAGE.toString(), 4)
    ); // 1% fixed fake slippage
  await mockCurve.deployed();

  const mock1inchFactory = (await ethers.getContractFactory('Mock1inch')) as Mock1inch__factory;
  const mock1inch = await mock1inchFactory.connect(admin).deploy();
  await mock1inch.deployed();
  return { mockV2, mockCurve, mock1inch };
}

export async function deployMinimalDexContracts(admin: Wallet): Promise<MinimalDexContracts> {
  const mockV2Factory = (await ethers.getContractFactory('MinimalUniswapV2')) as MinimalUniswapV2__factory;
  const mockV2 = await mockV2Factory.connect(admin).deploy();
  await mockV2.deployed();

  return { mockV2 };
}

export async function getAccounts(admin: Wallet, assets: TestERC20[], num: number): Promise<Wallet[]> {
  const accounts: Wallet[] = [];
  for (let i = 0; i < num; i++) {
    accounts.push(new ethers.Wallet(consts.userPrivKeys[i]).connect(ethers.provider));
    await admin.sendTransaction({
      to: accounts[i].address,
      value: parseUnits('10')
    });
    for (let j = 0; j < assets.length; j++) {
      await assets[j].transfer(accounts[i].address, parseUnits('1000'));
    }
  }
  accounts.sort((a, b) => (a.address.toLowerCase() > b.address.toLowerCase() ? 1 : -1));
  return accounts;
}
