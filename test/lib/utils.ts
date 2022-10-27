import { keccak256 } from '@ethersproject/solidity';
import { BigNumber, BigNumberish } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import { ICodec } from '../../typechain';
import { Types } from '../../typechain/TransferSwapper';
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
export const emptyForward: Types.ForwardInfoStruct = { dstChainId: 0, bridgeProvider: '', bridgeParams: '0x' };

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

export interface BridgeOpts {
  pocket?: string;
  bridgeOutToken?: string;
  bridgeOutFallbackToken?: string;
  feeInBridgeOutToken?: BigNumberish;
  feeInBridgeOutFallbackToken?: BigNumberish;
  bridgeOutMin?: BigNumberish;
  bridgeOutFallbackMin?: BigNumberish;
}

export function encodeMessage(
  id: string,
  swap: ICodec.SwapDescriptionStruct,
  receiver: string,
  nativeOut: boolean,
  o?: BridgeOpts
): string {
  const encoded = ethers.utils.defaultAbiCoder.encode(
    [
      '(bytes32, (address dex, bytes data), address, bool, address, address, uint256, uint256, uint256, uint256, (uint64 dstChainId, string bridgeProvider, bytes bridgeParams))'
    ],
    [
      [
        id,
        swap,
        receiver,
        nativeOut,
        o?.bridgeOutToken ?? ZERO_ADDR,
        o?.bridgeOutFallbackToken ?? ZERO_ADDR,
        o?.feeInBridgeOutToken ?? defaultFee,
        o?.feeInBridgeOutFallbackToken ?? ZERO_ADDR,
        o?.bridgeOutMin ?? 0,
        o?.bridgeOutFallbackMin ?? 0,
        emptyForward
      ]
    ]
  );
  return encoded;
}

export function getPocketAddr(id: string, dstTransferSwapper: string) {
  const codeHash = keccak256(['bytes'], [Pocket__factory.bytecode]);
  return ethers.utils.getCreate2Address(dstTransferSwapper, id, codeHash);
}

export function computeId(c: IntegrationTestContext, sameChain?: boolean): string {
  return keccak256(
    ['address', 'address', 'uint64', 'uint64', 'uint64'],
    [c.sender.address, c.receiver.address, c.chainId, sameChain ? c.chainId : c.chainId + 1, defaultNonce]
  );
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

export interface FeeSigOverride {
  srcChainId?: number;
  dstChainId?: number;
  amountIn?: BigNumber;
  tokenIn?: string;
  deadline?: BigNumber;
  feeInBridgeOutToken?: BigNumber;
  feeInBridgeOutFallbackToken?: BigNumber;
}

export async function signQuote(c: IntegrationTestContext, opts?: FeeSigOverride) {
  const srcChainId = opts?.srcChainId ?? c.chainId;
  const dstChainId = opts?.dstChainId ?? c.chainId + 1;
  const amountIn = opts?.amountIn ?? parseUnits('100');
  const tokenIn = opts?.tokenIn ?? c.tokenA.address;
  const deadline = opts?.deadline ?? defaultDeadline;
  const feeInBridgeOutToken = opts?.feeInBridgeOutToken ?? defaultFee;
  const feeInBridgeOutFallbackToken = opts?.feeInBridgeOutFallbackToken ?? defaultFee;
  const hash = keccak256(
    ['string', 'uint64', 'uint64', 'uint256', 'address', 'uint256', 'uint256', 'uint256'],
    ['chainhop quote', srcChainId, dstChainId, amountIn, tokenIn, deadline, feeInBridgeOutToken, feeInBridgeOutFallbackToken]
  );
  const signData = hex2Bytes(hash);
  return c.signer.signMessage(signData);
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
  const to = opts?.to ?? c.xswap.address;
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
  const to = opts?.to ?? c.xswap.address;
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

export interface TransferDescOpts {
  // TransferDescription
  receiver?: string;
  dstTransferSwapper?: string;
  dstChainId?: number;
  bridgeProvider?: string;
  bridgeOutToken?: string;
  bridgeOutFallbackToken?: string;
  bridgeOutMin?: string;
  bridgeOutFallbackMin?: string;
  nativeIn?: boolean;
  nativeOut?: boolean;
  feeInBridgeOutToken?: BigNumberish;
  feeInBridgeOutFallbackToken?: BigNumberish;
  deadline?: BigNumberish;
  quoteSig?: string;
  amountIn?: BigNumberish;
  tokenIn?: string;
  dstTokenOut?: string;
  // cbridge adapter params
  wrappedBridgeToken?: string;
  maxSlippage?: number;
}

export function buildTransferDesc(c: IntegrationTestContext, quoteSig: string, opts?: TransferDescOpts) {
  const dstChainId = opts?.dstChainId ?? c.chainId + 1;

  const fee = opts?.feeInBridgeOutToken ?? defaultFee;
  const deadline = opts?.deadline ?? defaultDeadline;
  const nonce = 1;
  const bridgeParams = ethers.utils.defaultAbiCoder.encode(
    ['uint256', 'uint32', 'address', 'uint64'],
    [BridgeType.Liquidity, opts?.maxSlippage ?? defaultMaxSlippage, opts?.wrappedBridgeToken || ZERO_ADDR, nonce]
  );

  const amountIn = opts?.amountIn || defaultAmountIn;

  // defaults
  // token in - tokenA
  // bridge in - tokenB
  // bridge out - tokenC
  // bridge out fallback - tokenD
  // dst out - tokenE
  const desc: Types.TransferDescriptionStruct = {
    receiver: opts?.receiver ?? c.receiver.address,
    dstTransferSwapper: opts?.dstTransferSwapper ?? c.receiver.address,
    dstChainId: dstChainId,
    nonce: nonce,
    bridgeProvider: opts?.bridgeProvider ?? 'cbridge',
    bridgeParams: bridgeParams,
    bridgeOutToken: opts?.bridgeOutToken ?? c.tokenB.address,
    bridgeOutFallbackToken: opts?.bridgeOutFallbackToken ?? c.tokenA.address,
    bridgeOutMin: opts?.bridgeOutMin ?? defaultBridgeOutMin,
    bridgeOutFallbackMin: opts?.bridgeOutFallbackMin ?? defaultBridgeOutMin,
    nativeIn: opts?.nativeIn ?? false,
    nativeOut: opts?.nativeOut ?? false,
    feeInBridgeOutToken: opts?.feeInBridgeOutToken ?? fee,
    feeInBridgeOutFallbackToken: opts?.feeInBridgeOutFallbackToken ?? fee,
    deadline: deadline,
    quoteSig: quoteSig,
    amountIn: amountIn,
    tokenIn: opts?.tokenIn || c.tokenA.address,
    dstTokenOut: opts?.dstTokenOut ?? c.tokenB.address,
    forward: emptyForward
  };

  return desc;
}
