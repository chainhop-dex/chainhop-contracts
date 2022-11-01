import { keccak256 } from '@ethersproject/solidity';
import { BigNumber, BigNumberish } from 'ethers';
import { AbiCoder, parseUnits, solidityKeccak256 } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import { ICodec } from '../../typechain';
import { Types } from './../../typechain/ExecutionNode';
import { Pocket__factory } from './../../typechain/factories/Pocket__factory';
import { CURVE_SLIPPAGE, UINT64_MAX, UNISWAP_V2_SLIPPAGE, ZERO_ADDR } from './constants';
import { ChainhopFixture, IntegrationTestContext } from './fixtures';

export enum BridgeType {
  Null,
  Liquidity,
  PegDeposit,
  PegBurn,
  PegDepositV2,
  PegBurnV2
}

export function slip(amount: BigNumberish, perc: number): BigNumber {
  const percent = 100 - perc;
  const amt = BigNumber.from(amount);
  return amt.mul(parseUnits(percent.toString(), 4)).div(parseUnits('100', 4));
}

export const defaultFee = parseUnits('1');
export const defaultAmountIn = parseUnits('100');
export const defaultBridgeOutMin = slip(defaultAmountIn, 50);
export const defaultNonce = 1;
export const defaultMaxSlippage = 1000000;
export const defaultDeadline = BigNumber.from(Math.floor(Date.now() / 1000 + 1200));
export const emptySwap: ICodec.SwapDescriptionStruct = { dex: ZERO_ADDR, data: '0x', amountOutMin: 0 };

export function slipUniV2(amount: BigNumber) {
  return slip(amount, UNISWAP_V2_SLIPPAGE);
}

export function slipCurve(amount: BigNumber) {
  return slip(amount, CURVE_SLIPPAGE);
}

export function hex2Bytes(hexString: string): number[] {
  let hex = hexString;
  const result = [];
  if (hex.substr(0, 2) === '0x') {
    hex = hex.slice(2);
  }
  if (hex.length % 2 === 1) {
    hex = '0' + hex;
  }
  for (let i = 0; i < hex.length; i += 2) {
    result.push(parseInt(hex.substr(i, 2), 16));
  }
  return result;
}

export interface BridgeInfoOverrides {
  toChainId?: number;
  bridgeProvider?: string;
  bridgeParams?: string;
}

export const emptyBridgeInfo: BridgeInfoOverrides = {
  toChainId: 0,
  bridgeProvider: '',
  bridgeParams: '0x'
};

export const defaultBridgeInfo: Types.BridgeInfoStruct = {
  toChainId: 0,
  bridgeProvider: '',
  bridgeParams: '0x'
};

export function newBridgeInfo(o: BridgeInfoOverrides = emptyBridgeInfo): Types.BridgeInfoStruct {
  return {
    toChainId: o?.toChainId ?? defaultBridgeInfo.toChainId,
    bridgeProvider: o?.bridgeProvider ?? defaultBridgeInfo.bridgeProvider,
    bridgeParams: o?.bridgeParams ?? defaultBridgeInfo.bridgeParams
  };
}

export const emptyExecutionInfo: ExecutionInfoOverrides = {
  chainId: 0,
  swap: emptySwap,
  bridge: defaultBridgeInfo,
  remoteExecutionNode: ZERO_ADDR,
  bridgeOutToken: ZERO_ADDR,
  bridgeOutFallbackToken: ZERO_ADDR,
  bridgeOutMin: 0,
  bridgeOutFallbackMin: 0,
  feeInBridgeOutToken: 0,
  feeInBridgeOutFallbackToken: 0
};

export interface ExecutionInfoOverrides {
  chainId?: number;
  swap?: ICodec.SwapDescriptionStruct;
  bridge?: Types.BridgeInfoStruct;
  remoteExecutionNode?: string;
  bridgeOutToken?: string;
  bridgeOutFallbackToken?: string;
  bridgeOutMin?: BigNumberish;
  bridgeOutFallbackMin?: BigNumberish;
  feeInBridgeOutToken?: BigNumberish;
  feeInBridgeOutFallbackToken?: BigNumberish;
}

export const defaultExecutionInfo: Types.ExecutionInfoStruct = {
  chainId: 0,
  swap: emptySwap,
  bridge: defaultBridgeInfo,
  remoteExecutionNode: ZERO_ADDR,
  bridgeOutToken: ZERO_ADDR,
  bridgeOutFallbackToken: ZERO_ADDR,
  bridgeOutMin: 0,
  bridgeOutFallbackMin: 0,
  feeInBridgeOutToken: 0,
  feeInBridgeOutFallbackToken: 0
};

export function newExecutionInfo(o: ExecutionInfoOverrides = emptyExecutionInfo): Types.ExecutionInfoStruct {
  return {
    chainId: o?.chainId ?? defaultExecutionInfo.chainId,
    swap: o?.swap ?? defaultExecutionInfo.swap,
    bridge: o?.bridge ?? defaultExecutionInfo.bridge,
    remoteExecutionNode: o?.remoteExecutionNode ?? defaultExecutionInfo.remoteExecutionNode,
    bridgeOutToken: o?.bridgeOutToken ?? defaultExecutionInfo.bridgeOutToken,
    bridgeOutFallbackToken: o?.bridgeOutFallbackToken ?? defaultExecutionInfo.bridgeOutFallbackToken,
    bridgeOutMin: o?.bridgeOutMin ?? defaultExecutionInfo.bridgeOutMin,
    bridgeOutFallbackMin: o?.bridgeOutFallbackMin ?? defaultExecutionInfo.bridgeOutFallbackMin,
    feeInBridgeOutToken: o?.feeInBridgeOutToken ?? defaultExecutionInfo.feeInBridgeOutToken,
    feeInBridgeOutFallbackToken: o?.feeInBridgeOutFallbackToken ?? defaultExecutionInfo.feeInBridgeOutFallbackToken
  };
}

export const defaultSourceInfo = {
  chainId: 0,
  nonce: defaultNonce,
  deadline: defaultDeadline,
  quoteSig: '0x',
  amountIn: defaultAmountIn,
  tokenIn: ZERO_ADDR,
  nativeIn: false
};

export interface SourceInfoOverrides {
  chainId?: number;
  nonce?: number;
  deadline?: BigNumberish;
  quoteSig?: string;
  amountIn?: BigNumberish;
  tokenIn?: string;
  nativeIn?: boolean;
}

export function newSourceInfo(o: SourceInfoOverrides = defaultSourceInfo) {
  return {
    chainId: o?.chainId ?? defaultSourceInfo.chainId,
    nonce: o?.nonce ?? defaultSourceInfo.nonce,
    deadline: o?.deadline ?? defaultSourceInfo.deadline,
    quoteSig: o?.quoteSig ?? defaultSourceInfo.quoteSig,
    amountIn: o?.amountIn ?? defaultSourceInfo.amountIn,
    tokenIn: o?.tokenIn ?? defaultSourceInfo.tokenIn,
    nativeIn: o?.nativeIn ?? defaultSourceInfo.nativeIn
  };
}

export const defaultDestinationInfo = {
  chainId: 0,
  receiver: ZERO_ADDR,
  nativeOut: false
};

export interface DestinationInfoOverrides {
  chainId?: number;
  receiver?: string;
  nativeOut?: boolean;
}

export function newDestinationInfo(o: DestinationInfoOverrides = defaultDestinationInfo) {
  return {
    chainId: o?.chainId ?? defaultDestinationInfo.chainId,
    receiver: o?.receiver ?? defaultDestinationInfo.receiver,
    nativeOut: o?.nativeOut ?? defaultDestinationInfo.nativeOut
  };
}

// export interface BridgeOpts {
//   pocket?: string;
//   bridgeOutToken?: string;
//   bridgeOutFallbackToken?: string;
//   feeInBridgeOutToken?: BigNumberish;
//   feeInBridgeOutFallbackToken?: BigNumberish;
//   bridgeOutMin?: BigNumberish;
//   bridgeOutFallbackMin?: BigNumberish;
//   forward?: Types.ForwardInfoStruct;
// }

// export function encodeMessage(
//   id: string,
//   swap: ICodec.SwapDescriptionStruct,
//   receiver: string,
//   nativeOut: boolean,
//   o?: BridgeOpts
// ): string {
//   const encoded = ethers.utils.defaultAbiCoder.encode(
//     [
//       '(bytes32, (address dex, bytes data), address, bool, address, address, uint256, uint256, uint256, uint256, (uint64 dstChainId, string bridgeProvider, bytes bridgeParams))'
//     ],
//     [
//       [
//         id,
//         swap,
//         receiver,
//         nativeOut,
//         o?.bridgeOutToken ?? ZERO_ADDR,
//         o?.bridgeOutFallbackToken ?? ZERO_ADDR,
//         o?.feeInBridgeOutToken ?? defaultFee,
//         o?.feeInBridgeOutFallbackToken ?? ZERO_ADDR,
//         o?.bridgeOutMin ?? 0,
//         o?.bridgeOutFallbackMin ?? 0,
//         o?.forward ?? emptyForward
//       ]
//     ]
//   );
//   return encoded;
// }

export function getPocketAddr(id: string, dstTransferSwapper: string) {
  const codeHash = keccak256(['bytes'], [Pocket__factory.bytecode]);
  return ethers.utils.getCreate2Address(dstTransferSwapper, id, codeHash);
}

export function computeId(dstChainId: number, receiver: string, nonce: number = defaultNonce): string {
  return keccak256(['uint64', 'address', 'uint64'], [dstChainId, receiver, nonce]);
}

export interface ComputeTranferIdOverride {
  token?: string;
  amount?: BigNumber;
  receiver?: string;
  dstChainId?: number;
  srcChainId?: number;
}

export function computeTransferId(c: IntegrationTestContext, o?: ComputeTranferIdOverride) {
  const sender = c.cbridgeAdapter.address;
  const receiver = o?.receiver ?? c.receiver.address;
  const token = o?.token ?? c.tokenA.address;
  const amount = o?.amount ?? defaultAmountIn;
  const dstChainId = o?.dstChainId ?? c.chainId + 1;
  const nonce = 1;
  const srcChainId = o?.srcChainId ?? c.chainId;
  return keccak256(
    ['address', 'address', 'address', 'uint256', 'uint64', 'uint64', 'uint64'],
    [sender, receiver, token, amount, dstChainId, nonce, srcChainId]
  );
}

const abi = new AbiCoder();

export function encodeSignData(execs: Types.ExecutionInfoStruct[], src: Types.SourceInfoStruct, dst: Types.DestinationInfoStruct) {
  if (!execs || execs.length == 1) {
    return hex2Bytes('0x');
  }
  let data = abi.encode(
    ['string', 'uint64', 'uint64', 'uint256', 'address', 'uint64'],
    ['chainhop quote', src.chainId, dst.chainId, src.amountIn, src.tokenIn, src.deadline]
  );
  for (let i = 1; i < execs.length; i++) {
    const ex = execs[i];
    const execData = abi.encode(
      ['uint64', 'uint256', 'address', 'uint256', 'address'],
      [ex.chainId, ex.feeInBridgeOutToken, ex.bridgeOutToken, ex.feeInBridgeOutFallbackToken, ex.bridgeOutFallbackToken]
    );
    data = data.concat(execData.replace('0x', ''));
  }
  data = solidityKeccak256(['bytes'], [data]);
  return hex2Bytes(data);
}

interface MockV2Address {
  mockV2: {
    address: string;
  };
}

interface Mock1inchAddress {
  mock1inch: {
    address: string;
  };
}

export interface UniV2SwapsOverride {
  amountOutMin?: BigNumber;
  tokenIn?: string;
  tokenOut?: string;
  to?: string;
}

export function buildUniV2Swap(c: ChainhopFixture & MockV2Address, amountIn: BigNumber, opts?: UniV2SwapsOverride) {
  const amountOutMin = opts?.amountOutMin ?? slipUniV2(amountIn);
  const tokenIn = opts?.tokenIn ?? c.tokenA.address;
  const tokenOut = opts?.tokenOut ?? c.tokenB.address;
  const to = opts?.to ?? c.enode.address;
  let data = ethers.utils.defaultAbiCoder.encode(
    ['uint256', 'uint256', 'address[]', 'address', 'uint256'],
    [amountIn, amountOutMin, [tokenIn, tokenOut], to, UINT64_MAX]
  );
  data = data.slice(2); // strip 0x
  data = '0x38ed1739' + data; // prepend selector
  return { dex: c.mockV2.address, data, amountOutMin: amountOutMin };
}

export interface OneinchSwapsOverride {
  amountOutMin?: BigNumber;
  tokenIn?: string;
  tokenOut?: string;
  to?: string;
}

export function build1inchSwap(c: ChainhopFixture & Mock1inchAddress, amountIn: BigNumber, opts?: OneinchSwapsOverride) {
  const amountOutMin = opts?.amountOutMin ?? slipUniV2(amountIn);
  const tokenIn = opts?.tokenIn ?? c.tokenA.address;
  const tokenOut = opts?.tokenOut ?? c.tokenB.address;
  const to = opts?.to ?? c.enode.address;
  let data = ethers.utils.defaultAbiCoder.encode(
    ['uint256', 'uint256', 'address', 'address', 'address'],
    [amountIn, amountOutMin, to, tokenIn, tokenOut]
  );
  data = data.slice(2); // strip 0x
  data = '0xeab90da6' + data; // prepend selector
  return { dex: c.mock1inch.address, data, amountOutMin: '0' };
}
export interface CurveSwapsOverride {
  amountOutMin?: BigNumber;
  tokenIn?: string;
  tokenOut?: string;
}

export function encodeBridgeParams(
  maxSlippage: number = defaultMaxSlippage,
  wrappedBridgeToken: string = ZERO_ADDR,
  nonce: number = defaultNonce
) {
  return ethers.utils.defaultAbiCoder.encode(
    ['uint256', 'uint32', 'address', 'uint64'],
    [BridgeType.Liquidity, maxSlippage, wrappedBridgeToken, nonce]
  );
}
