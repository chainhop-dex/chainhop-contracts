import { keccak256 } from '@ethersproject/solidity';
import { BigNumber, BigNumberish } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import { Types } from '../../typechain/TransferSwapper';
import { ICodec } from '../../typechain';
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

export function slip(amount: BigNumber, perc: number): BigNumber {
  const percent = 100 - perc;
  return amount.mul(parseUnits(percent.toString(), 4)).div(parseUnits('100', 4));
}

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

export function encodeMessage(
  id: string,
  swaps: ICodec.SwapDescriptionStruct[],
  receiver: string,
  nativeOut: boolean,
  fee: BigNumber,
  allowPartialFill = false
): string {
  const encoded = ethers.utils.defaultAbiCoder.encode(
    ['(bytes32, (address dex, bytes data)[], address, bool, uint256, bool, bytes)'],
    [[id, swaps, receiver, nativeOut, fee, allowPartialFill, "0x"]]
  );
  return encoded;
}

export function computeId(sender: string, receiver: string, srcChainId: number, nonce: BigNumberish): string {
  return keccak256(['address', 'address', 'uint64', 'uint64'], [sender, receiver, srcChainId, nonce]);
}

export interface ComputeTranferIdOverride {
  token?: string;
  amount?: BigNumber;
  receiver?: string;
  dstChainId?: number;
  srcChainId?: number;
}

export function computeTransferId(c: IntegrationTestContext, o?: ComputeTranferIdOverride) {
  const sender = c.bridgeAdapter.address;
  const receiver = o?.receiver ?? c.receiver.address;
  const token = o?.token ?? c.tokenB.address;
  const amount = o?.amount ?? parseUnits('100');
  const dstChainId = o?.dstChainId ?? c.chainId + 1;
  const nonce = 1;
  const srcChainId = o?.srcChainId ?? c.chainId;
  return keccak256(
    ['address', 'address', 'address', 'uint256', 'uint64', 'uint64', 'uint64'],
    [sender, receiver, token, amount, dstChainId, nonce, srcChainId]
  );
}

export interface FeeSigOverride {
  srcChainId?: number;
  dstChainId?: number;
  amountIn?: BigNumber;
  tokenIn?: string;
  feeDeadline?: BigNumber;
  fee?: BigNumber;
}

export async function signFee(c: IntegrationTestContext, opts?: FeeSigOverride) {
  const srcChainId = opts?.srcChainId ?? c.chainId;
  const dstChainId = opts?.dstChainId ?? c.chainId + 1;
  const amountIn = opts?.amountIn ?? parseUnits('100');
  const tokenIn = opts?.tokenIn ?? c.tokenA.address;
  const feeDeadline = opts?.feeDeadline ?? BigNumber.from(Math.floor(Date.now() / 1000 + 1200));
  const fee = opts?.fee ?? parseUnits('1');
  const hash = keccak256(
    ['string', 'uint64', 'uint64', 'uint256', 'address', 'uint256', 'uint256'],
    ['executor fee', srcChainId, dstChainId, amountIn, tokenIn, feeDeadline, fee]
  );
  const signData = hex2Bytes(hash);
  return c.signer.signMessage(signData);
}

// 0x3df02124 exchange(int128,int128,uint256,uint256)
// 0x38ed1739 swapExactTokensForTokens(uint256,uint256,address[],address,uint256)
// 0x41060ae0 exactInputSingle(address,address,uint24,address,uint256,uint256,uint256,uint160)

export function buildUniV2Swap(
  dex: string,
  amountIn: BigNumber,
  amountOutMin: BigNumber,
  tokenIn: string,
  tokenOut: string,
  to: string
): ICodec.SwapDescriptionStruct {
  let data = ethers.utils.defaultAbiCoder.encode(
    ['uint256', 'uint256', 'address[]', 'address', 'uint256'],
    [amountIn, amountOutMin, [tokenIn, tokenOut], to, UINT64_MAX]
  );
  data = data.slice(2); // strip 0x
  data = '0x38ed1739' + data; // prepend selector
  return { dex, data };
}

export function build1inchSwap(
    dex: string,
    amountIn: BigNumber,
    amountOutMin: BigNumber,
    tokenIn: string,
    tokenOut: string,
    to: string
): ICodec.SwapDescriptionStruct {
  let data = ethers.utils.defaultAbiCoder.encode(
      ['uint256', 'uint256', 'address','address', 'address'],
      [amountIn, amountOutMin, to, tokenIn, tokenOut]
  );
  data = data.slice(2); // strip 0x
  data = '0xeab90da6' + data; // prepend selector
  return { dex, data };
}

export interface UniV2SwapsOverride {
  amountOutMin?: BigNumber;
  tokenIn?: string;
  tokenOut?: string;
  to?: string;
  num?: number;
}

export interface OneinchSwapsOverride {
  amountOutMin?: BigNumber;
  tokenIn?: string;
  tokenOut?: string;
  to?: string;
  num?: number;
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

interface MockCurveAddress {
  mockCurve: {
    address: string;
  };
}

export function buildUniV2Swaps(c: ChainhopFixture & MockV2Address, amountIn: BigNumber, opts?: UniV2SwapsOverride) {
  const amountOutMin = opts?.amountOutMin ?? slipUniV2(amountIn);
  const tokenIn = opts?.tokenIn ?? c.tokenA.address;
  const tokenOut = opts?.tokenOut ?? c.tokenB.address;
  const to = opts?.to ?? c.xswap.address;
  const num = opts?.num ?? 1;
  const swaps: ICodec.SwapDescriptionStruct[] = [];
  const swap = buildUniV2Swap(c.mockV2.address, amountIn, amountOutMin, tokenIn, tokenOut, to);
  for (let i = 0; i < num; i++) {
    swaps.push(swap);
  }
  return swaps;
}

export function build1inchSwaps(c: ChainhopFixture & Mock1inchAddress, amountIn: BigNumber, opts?: OneinchSwapsOverride) {
  const amountOutMin = opts?.amountOutMin ?? slipUniV2(amountIn);
  const tokenIn = opts?.tokenIn ?? c.tokenA.address;
  const tokenOut = opts?.tokenOut ?? c.tokenB.address;
  const to = opts?.to ?? c.xswap.address;
  const num = opts?.num ?? 1;
  const swaps: ICodec.SwapDescriptionStruct[] = [];
  const swap = build1inchSwap(c.mock1inch.address, amountIn, amountOutMin, tokenIn, tokenOut, to);
  for (let i = 0; i < num; i++) {
    swaps.push(swap);
  }
  return swaps;
}

export function buildCurveSwap(
  dex: string,
  amountIn: BigNumber,
  amountOutMin: BigNumber,
  i: number,
  j: number
): ICodec.SwapDescriptionStruct {
  let data = ethers.utils.defaultAbiCoder.encode(
    ['uint128', 'uint128', 'uint256', 'uint256'],
    [i, j, amountIn, amountOutMin]
  );
  data = data.slice(2); // strip 0x
  data = '0x3df02124' + data; // prepend selector
  return { dex, data };
}
export interface CurveSwapsOverride {
  amountOutMin?: BigNumber;
  tokenIn?: string;
  tokenOut?: string;
}

export function buildCurveSwaps(c: ChainhopFixture & MockCurveAddress, amountIn: BigNumber, o?: CurveSwapsOverride) {
  const tokenIndices = {
    [c.tokenA.address]: 0,
    [c.tokenB.address]: 1,
    [c.weth.address]: 2
  };
  const amountOutMin = o?.amountOutMin ?? slipCurve(amountIn);
  const tokenIn = o?.tokenIn ?? c.tokenA.address;
  const tokenOut = o?.tokenOut ?? c.tokenB.address;
  return [buildCurveSwap(c.mockCurve.address, amountIn, amountOutMin, tokenIndices[tokenIn], tokenIndices[tokenOut])];
}

export interface TransferDescOpts {
  receiver?: string;
  dstChainId?: number;
  dstTransferSwapper?: string;
  bridgeProvider?: string;
  fee?: BigNumber;
  feeDeadline?: BigNumber;
  feeSig?: string;
  amountIn?: BigNumber;
  tokenIn?: string;
  bridgeTokenIn?: string;
  wrappedBridgeToken?: string;
  nativeIn?: boolean;
  nativeOut?: boolean;
  dstTokenOut?: string;
  allowPartialFill?: boolean;
  maxSlippage?: number;
}

export function buildTransferDesc(c: IntegrationTestContext, feeSig: string, opts?: TransferDescOpts) {
  const dstChainId = opts?.dstChainId ?? c.chainId + 1;

  const fee = opts?.fee ?? parseUnits('1');
  const feeDeadline = opts?.feeDeadline ?? BigNumber.from(Math.floor(Date.now() / 1000 + 1200));
  const nonce = 1;
  let bridgeParams = ethers.utils.defaultAbiCoder.encode(
    ['uint256', 'uint32', 'address', 'uint64'],
    [BridgeType.Liquidity, opts?.maxSlippage ?? 1000000, opts?.wrappedBridgeToken || ZERO_ADDR, nonce]
  );

  const desc: Types.TransferDescriptionStruct = {
    receiver: opts?.receiver ?? c.receiver.address,
    dstChainId: dstChainId,
    dstTransferSwapper: opts?.dstTransferSwapper ?? c.receiver.address,
    nonce: nonce,
    bridgeProvider: opts?.bridgeProvider ?? "cbridge",
    bridgeParams: bridgeParams,
    nativeIn: opts?.nativeIn ?? false,
    nativeOut: opts?.nativeOut ?? false,
    fee: fee,
    feeDeadline: feeDeadline,
    feeSig: feeSig,
    amountIn: opts?.amountIn || parseUnits('0'),
    tokenIn: opts?.tokenIn || c.tokenA.address,
    bridgeTokenIn: opts?.bridgeTokenIn || c.tokenB.address,
    dstTokenOut: opts?.dstTokenOut ?? c.tokenB.address,
    allowPartialFill: false,
    forward: '0x'
  };

  return desc;
}
