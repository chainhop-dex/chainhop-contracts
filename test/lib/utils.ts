import { keccak256 } from '@ethersproject/solidity';
import { BigNumber, BigNumberish } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import { TransferSwapper } from '../../typechain';
import { BridgeType } from '../types';
import { ICodec } from './../../typechain/ICodec';
import { UINT64_MAX, ZERO_ADDR } from './constants';
import { TestContext } from './fixtures';

export function slip(amount: BigNumber, perc: number): BigNumber {
  const percent = 100 - perc;
  return amount.mul(parseUnits(percent.toString(), 4)).div(parseUnits('100', 4));
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
  fee: BigNumber
): string {
  const encoded = ethers.utils.defaultAbiCoder.encode(
    ['(bytes32, (address dex, bytes data)[], address, bool, uint256)'],
    [[id, swaps, receiver, nativeOut, fee]]
  );
  return encoded;
}

export function computeId(sender: string, receiver: string, srcChainId: number, nonce: BigNumberish): string {
  return keccak256(['address', 'address', 'uint64', 'uint64'], [sender, receiver, srcChainId, nonce]);
}

export function encodeSignFeeData(fee: BigNumber, feeDeadline: BigNumber, dstChainId: number) {
  const hash = keccak256(['string', 'uint256', 'uint64', 'uint256'], ['executor fee', feeDeadline, dstChainId, fee]);
  return hex2Bytes(hash);
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

export interface SingleUniV2SwapsOpts {
  amountOutMin?: BigNumber;
  tokenIn?: string;
  tokenOut?: string;
  to?: string;
}

export function buildSingleUniV2Swaps(c: TestContext, amountIn: BigNumber, opts?: SingleUniV2SwapsOpts) {
  const amountOutMin = opts?.amountOutMin ?? slip(amountIn, 5);
  const tokenIn = opts?.tokenIn ?? c.tokenA.address;
  const tokenOut = opts?.tokenOut ?? c.tokenB.address;
  const to = opts?.to ?? c.xswap.address;
  return [buildUniV2Swap(c.mockV2.address, amountIn, amountOutMin, tokenIn, tokenOut, to)];
}

export interface TransferDescOpts {
  dstChainId?: number;
  fee?: BigNumber;
  feeDeadline?: BigNumber;
  feeSig?: string;
  amountIn?: BigNumber;
  tokenIn?: string;
  nativeOut?: boolean;
}

export async function buildTransferDesc(c: TestContext, opts?: TransferDescOpts) {
  const dstChainId = opts?.dstChainId ?? c.chainId + 1;

  const fee = opts?.fee ?? BigNumber.from(1000000);
  const feeDeadline = opts?.feeDeadline ?? BigNumber.from(Math.floor(Date.now() / 1000 + 600));
  const feeSig = opts?.feeSig ?? (await c.signer.signMessage(encodeSignFeeData(fee, feeDeadline, dstChainId)));

  const desc: TransferSwapper.TransferDescriptionStruct = {
    bridgeType: BridgeType.Liquidity,
    maxBridgeSlippage: 1000000,
    nonce: 1,
    receiver: c.receiver.address,

    allowPartialFill: false,
    nativeOut: opts?.nativeOut ?? false,
    dstChainId: dstChainId,
    fee: fee,
    feeDeadline: feeDeadline,
    feeSig: feeSig,
    amountIn: opts?.amountIn || parseUnits('0'),
    tokenIn: opts?.tokenIn || ZERO_ADDR
  };
  return desc;
}
