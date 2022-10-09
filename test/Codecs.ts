import { expect } from 'chai';
import { BytesLike } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import { ICodec, ISwapRouter } from '../typechain';
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
    const fee = 10000;
    const path = ethers.utils.solidityPack(['address', 'uint24', 'address'], [tokenA, fee, tokenB]);
    const amountIn = '111111';
    const params: ISwapRouter.ExactInputParamsStruct = {
      path,
      amountOutMinimum: amountIn,
      deadline: '33333333',
      amountIn,
      recipient: user
    };
    let data = ethers.utils.defaultAbiCoder.encode(
      ['(bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum)'],
      [params]
    );
    data = data.slice(2); // strip 0x
    data = '0x12121212' + data;
    const swap: ICodec.SwapDescriptionStruct = { dex: ZERO_ADDR, data: data };
    const res = await c.v3Codec.decodeCalldata(swap);

    expect(res[0]).equal(amountIn);
    expect(res.tokenIn).equal(tokenA);
    expect(res.tokenOut).equal(tokenB);
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

describe('PlatypusRouter01Codec', () => {
  beforeEach(prepareContext);
  it('should decode calldata', async function () {
    const tokenPath = [tokenA, tokenB];
    const poolPath = [user];
    const amountOutMin = '123';
    const amountIn = '321321';
    const receiver = ZERO_ADDR;
    const deadline = '123123123123';
    let data = ethers.utils.defaultAbiCoder.encode(
      ['address[]', 'address[]', 'uint256', 'uint256', 'address', 'uint256'],
      [tokenPath, poolPath, amountIn, amountOutMin, receiver, deadline]
    );
    data = data.slice(2); // strip 0x
    data = '0x12121212' + data;
    const swap: ICodec.SwapDescriptionStruct = { dex: ZERO_ADDR, data: data };
    const res = await c.platypusCodec.decodeCalldata(swap);
    expect(res.amountIn).equal(amountIn);
    expect(res.tokenIn).equal(tokenA);
    expect(res.tokenOut).equal(tokenB);
  });

  it('should encode calldata with override', async function () {
    const tokenPath = [tokenA, tokenB];
    const poolPath = [user];
    const amountOutMin = '123';
    const amountIn = '321321';
    const receiver = ZERO_ADDR;
    const deadline = '123123123123';
    let data = ethers.utils.defaultAbiCoder.encode(
      ['address[]', 'address[]', 'uint256', 'uint256', 'address', 'uint256'],
      [tokenPath, poolPath, amountIn, amountOutMin, receiver, deadline]
    );
    data = data.slice(2); // strip 0x
    data = '0x12121212' + data;
    const amountInOverride = '123123';
    const receiverOverride = user;
    const res = await c.platypusCodec.encodeCalldataWithOverride(data, amountInOverride, receiverOverride);
    let expectData = ethers.utils.defaultAbiCoder.encode(
      ['address[]', 'address[]', 'uint256', 'uint256', 'address', 'uint256'],
      [tokenPath, poolPath, amountInOverride, amountOutMin, receiverOverride, deadline]
    );
    expectData = expectData.slice(2); // strip 0x
    expectData = '0x12121212' + expectData;
    expect(res).equal(expectData);
  });
});

describe('1inchCodec', () => {
  beforeEach(prepareContext);
  it('should decode and override clipperSwap calldata', async function () {
    const amountIn = 111111;
    const amountOutMin = 100000;

    // "b0431182": "clipperSwap(address srcToken, address dstToken, uint256 amount, uint256 minReturn)",
    let data = ethers.utils.defaultAbiCoder.encode(
      ['address srcToken', 'address dstToken', 'uint256 amount', 'uint256 minReturn'],
      [tokenA, tokenB, amountIn, amountOutMin]
    );
    data = data.slice(2); // strip 0x
    data = '0xb0431182' + data;
    const swap: ICodec.SwapDescriptionStruct = { dex: ZERO_ADDR, data: data };
    const res0 = await c.oneinchCodec.decodeCalldata(swap);

    expect(res0[0]).equal(amountIn);
    expect(res0.tokenIn).equal(tokenA);
    expect(res0.tokenOut).equal(tokenB);

    const amountInOverride = '123123';
    const res1 = await c.oneinchCodec.encodeCalldataWithOverride(data, amountInOverride, user);
    let expectData = ethers.utils.defaultAbiCoder.encode(
      ['address srcToken', 'address dstToken', 'uint256 amount', 'uint256 minReturn'],
      [tokenA, tokenB, amountInOverride, amountOutMin]
    );
    expectData = expectData.slice(2); // strip 0x
    expectData = '0xb0431182' + expectData;
    expect(res1).equal(expectData);
  });
  it('should decode and override fillOrderRFQ calldata', async function () {
    const amountIn = 111111;
    const amountOutMin = 100000;
    const sig: BytesLike = '0x00';

    // "d0a3b665": "fillOrderRFQ((uint256 info, address makerAsset, address takerAsset, address maker, address allowedSender, uint256 makingAmount, uint256 takingAmount) order, bytes signature, uint256 makingAmount, uint256 takingAmount)",
    const rfq = {
      info: amountIn,
      makerAsset: tokenA,
      takerAsset: tokenB,
      maker: user,
      allowedSender: user,
      makingAmount: amountIn,
      takingAmount: amountOutMin
    };
    let data = ethers.utils.defaultAbiCoder.encode(
      [
        'tuple(uint256 info, address makerAsset, address takerAsset, address maker, address allowedSender, uint256 makingAmount, uint256 takingAmount) order',
        'bytes signature',
        'uint256 makingAmount',
        'uint256 takingAmount'
      ],
      [rfq, sig, amountIn, amountOutMin]
    );
    data = data.slice(2); // strip 0x
    data = '0xd0a3b665' + data;
    const swap: ICodec.SwapDescriptionStruct = { dex: ZERO_ADDR, data: data };
    const res0 = await c.oneinchCodec.decodeCalldata(swap);

    expect(res0[0]).equal(amountIn);
    expect(res0.tokenIn).equal(tokenA);
    expect(res0.tokenOut).equal(tokenB);

    const amountInOverride = '123123';
    rfq.makingAmount = 123123;
    const res1 = await c.oneinchCodec.encodeCalldataWithOverride(data, amountInOverride, user);
    let expectData = ethers.utils.defaultAbiCoder.encode(
      [
        'tuple(uint256 info, address makerAsset, address takerAsset, address maker, address allowedSender, uint256 makingAmount, uint256 takingAmount) order',
        'bytes signature',
        'uint256 makingAmount',
        'uint256 takingAmount'
      ],
      [rfq, sig, amountInOverride, amountOutMin]
    );
    expectData = expectData.slice(2); // strip 0x
    expectData = '0xd0a3b665' + expectData;
    expect(res1).equal(expectData);
  });
  it('should decode and override swap calldata', async function () {
    const amountIn = 111111;
    const amountOutMin = 100000;

    const desc = {
      srcToken: tokenA,
      dstToken: tokenB,
      srcReceiver: user,
      dstReceiver: user,
      amount: amountIn,
      minReturnAmount: amountOutMin,
      flags: '0x00',
      permit: '0x00'
    };

    // "7c025200": "swap(address caller,(address srcToken, address dstToken, address srcReceiver, address dstReceiver, uint256 amount, uint256 minReturnAmount, uint256 flags, bytes permit) desc, bytes data)",
    let data = ethers.utils.defaultAbiCoder.encode(
      [
        'address caller',
        'tuple(address srcToken, address dstToken, address srcReceiver, address dstReceiver, uint256 amount, uint256 minReturnAmount, uint256 flags, bytes permit) desc',
        'bytes data'
      ],
      [user, desc, '0x00']
    );
    data = data.slice(2); // strip 0x
    data = '0x7c025200' + data;
    const swap: ICodec.SwapDescriptionStruct = { dex: ZERO_ADDR, data: data };
    const res0 = await c.oneinchCodec.decodeCalldata(swap);

    expect(res0[0]).equal(amountIn);
    expect(res0.tokenIn).equal(tokenA);
    expect(res0.tokenOut).equal(tokenB);

    const amountInOverride = '123123';
    desc.amount = 123123;
    const res1 = await c.oneinchCodec.encodeCalldataWithOverride(data, amountInOverride, user);
    let expectData = ethers.utils.defaultAbiCoder.encode(
      [
        'address caller',
        'tuple(address srcToken, address dstToken, address srcReceiver, address dstReceiver, uint256 amount, uint256 minReturnAmount, uint256 flags, bytes permit) desc',
        'bytes data'
      ],
      [user, desc, '0x00']
    );
    expectData = expectData.slice(2); // strip 0x
    expectData = '0x7c025200' + expectData;
    expect(res1).equal(expectData);
  });
});
