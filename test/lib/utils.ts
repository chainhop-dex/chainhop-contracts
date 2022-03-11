import { keccak256 } from '@ethersproject/solidity';
import { BigNumber } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import { ICodec } from './../../typechain/ICodec';
import { UINT64_MAX } from './constants';

function slip(amount: BigNumber, perc: number): BigNumber {
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

function encodeMessage(
  id: string,
  swaps: ICodec.SwapDescriptionStruct[],
  receiver: string,
  nonce: number,
  nativeOut: boolean,
  fee: BigNumber,
  feeDeadline: BigNumber
): string {
  const encoded = ethers.utils.defaultAbiCoder.encode(
    ['bytes32, ((address dex, bytes data)[], address, uint64, bool, uint256, uint256)'],
    [[id, swaps, receiver, nonce, nativeOut, fee, feeDeadline]]
  );
  return encoded;
}

function computeId(sender: string, receiver: string, srcChainId: number, nonce: number): string {
  return keccak256(['address', 'address', 'uint64', 'uint64'], [sender, receiver, srcChainId, nonce]);
}

function encodeSignFeeData(fee: BigNumber, feeDeadline: BigNumber, dstChainId: number) {
  const hash = keccak256(['string', 'uint256', 'uint64', 'uint256'], ['executor fee', feeDeadline, dstChainId, fee]);
  return hex2Bytes(hash);
}

// 0x3df02124 exchange(int128,int128,uint256,uint256)
// 0x38ed1739 swapExactTokensForTokens(uint256,uint256,address[],address,uint256)
// 0x41060ae0 exactInputSingle(address,address,uint24,address,uint256,uint256,uint256,uint160)

function buildUniV2Swap(
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

export default { slip, encodeMessage, computeId, buildUniV2Swap, hex2Bytes, encodeSignFeeData };
