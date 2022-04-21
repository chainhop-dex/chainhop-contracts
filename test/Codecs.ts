import { expect } from 'chai';
import { ethers } from 'hardhat';
import { ICodec } from '../typechain';
import { ISwapRouter } from './../typechain/ISwapRouter';
import { CodecContracts, loadFixture } from './lib/common';
import { ZERO_ADDR } from './lib/constants';
import { codecFixture } from './lib/fixtures';

const tokenA = '0x9532f934EfcE6c4Bf5BA078b25fDd81a780FBdfB';
const tokenB = '0x62755b3461348afA014f7dB75F05d8F3C3d3924E';
const user = '0x58b529F9084D7eAA598EB3477Fe36064C5B7bbC1';

let c: CodecContracts;

const prepareContext = async () => {
  c = await loadFixture(codecFixture);
};

describe('UniswapV3ExactInputCodec', () => {
  beforeEach(prepareContext);
  it('should decode calldata', async function () {
    const fee = 12312;
    const path = ethers.utils.solidityPack(['address', 'uint24', 'address'], [tokenA, fee, tokenB]);
    const amountIn = '321321';
    const params: ISwapRouter.ExactInputParamsStruct = {
      path,
      amountIn,
      amountOutMinimum: amountIn,
      deadline: '1233123',
      recipient: user
    };
    let data = ethers.utils.defaultAbiCoder.encode(
      ['(bytes path, address recipient, uint256 amountOutMinimum, uint256 deadline, uint256 amountIn)'],
      [params]
    );
    data = data.slice(2); // strip 0x
    data = '0x12121212' + data;
    const swap: ICodec.SwapDescriptionStruct = { dex: ZERO_ADDR, data: data };
    const res = await c.v3Codec.decodeCalldata(swap);

    expect(amountIn).equal(amountIn);
    expect(res[1]).equal(tokenA);
    expect(res[2]).equal(tokenB);
  });

  it('should revert if path is malformed', async function () {
    const fee = 12312;
    const malformedPath = ethers.utils.solidityPack(
      ['address', 'uint24', 'address', 'address'],
      [tokenA, fee, tokenB, tokenB]
    );
    const amountIn = '321321';
    const params: ISwapRouter.ExactInputParamsStruct = {
      path: malformedPath,
      amountIn,
      amountOutMinimum: amountIn,
      deadline: '1233123',
      recipient: user
    };
    let data = ethers.utils.defaultAbiCoder.encode(
      ['(bytes path, address recipient, uint256 amountOutMinimum, uint256 deadline, uint256 amountIn)'],
      [params]
    );
    data = data.slice(2); // strip 0x
    data = '0x12121212' + data;
    const swap: ICodec.SwapDescriptionStruct = { dex: ZERO_ADDR, data: data };
    const res = c.v3Codec.decodeCalldata(swap);
    await expect(res).to.be.revertedWith('malformed path');
  });
});
