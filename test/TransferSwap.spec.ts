import { keccak256 } from '@ethersproject/solidity';
import { expect } from 'chai';
import { BigNumber, Wallet } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import { TransferSwapper } from './../typechain/TransferSwapper';
import { loadFixture } from './lib/common';
import { ZERO_ADDR } from './lib/constants';
import { ChainhopFixture, chainhopFixture } from './lib/fixtures';
import utils from './lib/utils';
import { BridgeType } from './types';

const maxBridgeSlippage = parseUnits('100', 4); // 100%
const nonce = 1;

interface TestContext extends ChainhopFixture {
  sender: Wallet;
  receiver: Wallet;
}

let c: TestContext;

describe('transferWithSwap', () => {
  beforeEach(async () => {
    const fixture = await loadFixture(chainhopFixture);
    const accounts = fixture.accounts;
    c = {
      ...fixture,
      accounts,
      signer: accounts[0],
      feeCollector: accounts[1],
      sender: accounts[2],
      receiver: accounts[3]
    };
  });

  it('should revert if the tx results in a noop', async function () {
    const amountIn = parseUnits('100', 18);
    const desc: TransferSwapper.TransferDescriptionStruct = {
      bridgeType: BridgeType.Liquidity,
      dstChainId: c.chainId,
      fee: BigNumber.from(112312),
      feeDeadline: BigNumber.from(123131231231),
      feeSig: '0x',
      maxBridgeSlippage: 1000000,
      nativeOut: false,
      nonce: nonce,
      receiver: c.receiver.address,
      amountIn: amountIn,
      tokenIn: c.tokenA.address
    };
    await expect(c.xswap.connect(c.sender).transferWithSwap(c.xswap.address, desc, [], [])).to.be.revertedWith('nop');
    desc.dstChainId = c.chainId + 1;
    desc.amountIn = parseUnits('0');
    await expect(c.xswap.connect(c.sender).transferWithSwap(c.xswap.address, desc, [], [])).to.be.revertedWith('nop');
  });

  it('should revert if fee deadline has passed', async function () {
    const amountIn = parseUnits('100', 18);
    const srcSwaps = [
      utils.buildUniV2Swap(
        c.mockV2.address,
        amountIn,
        utils.slip(amountIn, 5),
        c.tokenA.address,
        c.tokenB.address,
        c.xswap.address
      )
    ];
    const dstChainId = c.chainId + 1; // don't matter as long as it's not src chain id
    const fee = BigNumber.from(112312);
    const feeDeadline = BigNumber.from(Math.floor(Date.now() / 1000 - 60)); // now - 60s
    const feeSig = await c.signer.signMessage(utils.encodeSignFeeData(fee, feeDeadline, dstChainId));
    const desc: TransferSwapper.TransferDescriptionStruct = {
      bridgeType: BridgeType.Liquidity,
      dstChainId: dstChainId,
      fee: fee,
      feeDeadline,
      feeSig: feeSig,
      maxBridgeSlippage: 1000000,
      nativeOut: false,
      nonce: nonce,
      receiver: c.receiver.address,
      amountIn: amountIn,
      tokenIn: c.tokenA.address
    };

    await c.tokenA.connect(c.sender).approve(c.xswap.address, amountIn);
    const tx = c.xswap.connect(c.sender).transferWithSwap(c.receiver.address, desc, srcSwaps, []);
    await expect(tx).to.be.revertedWith('deadline exceeded');
  });

  it('should directly transfer', async function () {
    const amountIn = parseUnits('100', 18);
    const dstSwaps = [
      utils.buildUniV2Swap(
        c.mockV2.address,
        amountIn,
        utils.slip(amountIn, 10),
        c.tokenA.address,
        c.tokenB.address,
        c.receiver.address
      )
    ];
    const dstChainId = c.chainId + 1; // don't matter as long as it's not src chain id
    const fee = BigNumber.from(112312);
    const feeDeadline = BigNumber.from('1231231231231');
    const feeSig = await c.signer.signMessage(utils.encodeSignFeeData(fee, feeDeadline, dstChainId));

    const desc: TransferSwapper.TransferDescriptionStruct = {
      bridgeType: BridgeType.Liquidity,
      dstChainId: dstChainId,
      fee: fee,
      feeDeadline: feeDeadline,
      feeSig: feeSig,
      maxBridgeSlippage: 1000000,
      nativeOut: false,
      nonce: nonce,
      receiver: c.receiver.address,
      amountIn: amountIn,
      tokenIn: c.tokenA.address
    };

    await c.tokenA.connect(c.sender).approve(c.xswap.address, amountIn);
    const tx = await c.xswap.connect(c.sender).transferWithSwap(c.receiver.address, desc, [], dstSwaps);
    const expectId = utils.computeId(c.sender.address, c.receiver.address, c.chainId, nonce);

    await expect(tx)
      .to.emit(c.xswap, 'RequestSent')
      .withArgs(expectId, dstChainId, amountIn, c.tokenA.address, c.tokenB.address);

    const srcXferId = keccak256(
      ['address', 'address', 'address', 'uint256', 'uint64', 'uint64', 'uint64'],
      [c.xswap.address, c.receiver.address, c.tokenA.address, amountIn, dstChainId, nonce, c.chainId]
    );
    await expect(tx)
      .to.emit(c.bridge, 'Send')
      .withArgs(
        srcXferId,
        c.xswap.address,
        c.receiver.address,
        c.tokenA.address,
        amountIn,
        dstChainId,
        nonce,
        maxBridgeSlippage
      );
  });

  it('should swap and transfer', async function () {
    const amountIn = parseUnits('100', 18);
    const srcSwaps = [
      utils.buildUniV2Swap(
        c.mockV2.address,
        amountIn,
        utils.slip(amountIn, 5),
        c.tokenA.address,
        c.tokenB.address,
        c.xswap.address
      )
    ];
    const dstChainId = c.chainId + 1; // don't matter as long as it's not src chain id
    const fee = BigNumber.from(112312);
    const feeDeadline = BigNumber.from('123123123123123123123121231231231');
    const feeSig = await c.signer.signMessage(utils.encodeSignFeeData(fee, feeDeadline, dstChainId));
    const desc: TransferSwapper.TransferDescriptionStruct = {
      bridgeType: BridgeType.Liquidity,
      dstChainId: dstChainId,
      fee: fee,
      feeDeadline,
      feeSig: feeSig,
      maxBridgeSlippage: 1000000,
      nativeOut: false,
      nonce: nonce,
      receiver: c.receiver.address,
      amountIn: amountIn,
      tokenIn: c.tokenA.address
    };

    await c.tokenA.connect(c.sender).approve(c.xswap.address, amountIn);
    const tx = await c.xswap.connect(c.sender).transferWithSwap(c.receiver.address, desc, srcSwaps, []);
    const expectId = utils.computeId(c.sender.address, c.receiver.address, c.chainId, nonce);

    await expect(tx)
      .to.emit(c.xswap, 'RequestSent')
      .withArgs(expectId, dstChainId, amountIn, c.tokenA.address, c.tokenB.address);

    const expectedSendAmt = utils.slip(amountIn, 5);
    const srcXferId = keccak256(
      ['address', 'address', 'address', 'uint256', 'uint64', 'uint64', 'uint64'],
      [c.xswap.address, c.receiver.address, c.tokenB.address, expectedSendAmt, dstChainId, nonce, c.chainId]
    );
    await expect(tx)
      .to.emit(c.bridge, 'Send')
      .withArgs(
        srcXferId,
        c.xswap.address,
        c.receiver.address,
        c.tokenB.address,
        expectedSendAmt,
        dstChainId,
        nonce,
        maxBridgeSlippage
      );
  });

  it('should directly swap', async function () {
    const amountIn = parseUnits('100', 18);
    const srcSwaps = [
      utils.buildUniV2Swap(
        c.mockV2.address,
        amountIn,
        utils.slip(amountIn, 5),
        c.tokenA.address,
        c.tokenB.address,
        c.xswap.address
      )
    ];
    const desc: TransferSwapper.TransferDescriptionStruct = {
      bridgeType: BridgeType.Liquidity,
      dstChainId: c.chainId, // same as src chain id
      fee: 0,
      feeDeadline: 0,
      feeSig: '0x',
      maxBridgeSlippage: 0,
      nativeOut: false,
      nonce: nonce,
      receiver: c.receiver.address,
      amountIn: 0,
      tokenIn: ZERO_ADDR
    };
    await c.tokenA.connect(c.sender).approve(c.xswap.address, amountIn);
    const tx = await c.xswap.connect(c.sender).transferWithSwap(c.receiver.address, desc, srcSwaps, []);
    const expectId = utils.computeId(c.sender.address, c.receiver.address, c.chainId, nonce);
    const expectAmountOut = utils.slip(amountIn, 5);
    await expect(tx)
      .to.emit(c.xswap, 'DirectSwap')
      .withArgs(expectId, amountIn, c.tokenA.address, expectAmountOut, c.tokenB.address);
    await expect(tx).to.not.emit(c.bridge, 'Send');
  });

  it('should revert if native in but not enough value', async function () {
    const amountIn = parseUnits('100', 18);
    const srcSwaps = [
      utils.buildUniV2Swap(
        c.mockV2.address,
        amountIn,
        utils.slip(amountIn, 5),
        c.weth.address,
        c.tokenB.address,
        c.xswap.address
      )
    ];
    const desc: TransferSwapper.TransferDescriptionStruct = {
      bridgeType: BridgeType.Liquidity,
      dstChainId: c.chainId, // same as src chain id
      fee: 0,
      feeDeadline: 0,
      feeSig: '0x',
      maxBridgeSlippage: 0,
      nativeOut: false,
      nonce: nonce,
      receiver: c.receiver.address,
      amountIn: 0,
      tokenIn: ZERO_ADDR
    };
    const tx = c.xswap
      .connect(c.sender)
      .transferWithSwap(c.receiver.address, desc, srcSwaps, [], { value: amountIn.sub(parseUnits('95')) });
    await expect(tx).to.be.revertedWith('insfcnt amt');
  });

  it('should directly swap (native in)', async function () {
    const amountIn = parseUnits('1');
    const srcSwaps = [
      utils.buildUniV2Swap(
        c.mockV2.address,
        amountIn,
        utils.slip(amountIn, 5),
        c.weth.address,
        c.tokenB.address,
        c.xswap.address
      )
    ];
    const desc: TransferSwapper.TransferDescriptionStruct = {
      bridgeType: BridgeType.Liquidity,
      dstChainId: c.chainId, // same as src chain id
      fee: 0,
      feeDeadline: 0,
      feeSig: '0x',
      maxBridgeSlippage: 0,
      nativeOut: false,
      nonce: nonce,
      receiver: c.receiver.address,
      amountIn: 0,
      tokenIn: ZERO_ADDR
    };
    const tx = await c.xswap
      .connect(c.sender)
      .transferWithSwap(c.receiver.address, desc, srcSwaps, [], { value: amountIn });
    const expectId = utils.computeId(c.sender.address, c.receiver.address, c.chainId, nonce);
    const expectAmountOut = utils.slip(amountIn, 5);
    await expect(tx)
      .to.emit(c.xswap, 'DirectSwap')
      .withArgs(expectId, amountIn, c.weth.address, expectAmountOut, c.tokenB.address);
    await expect(tx).to.not.emit(c.bridge, 'Send');
  });
});

// describe('executeMessageWithTransfer', function () {
//   beforeEach(async () => {
//     // impersonate MessageBus as admin to gain access to calling executeMessageWithTransfer
//     await c.xswap.connect(c.admin).setMessageBus(c.admin.address);
//   });
//   it('should swap using bridge out amount', async function () {
//     const bridgeOutAmount = parseUnits('100');
//     const amountIn = parseUnits('123123');
//     const swaps = [
//       utils.buildUniV2Swap(
//         c.mockV2.address,
//         amountIn,
//         utils.slip(bridgeOutAmount, 5),
//         c.tokenA.address,
//         c.tokenB.address,
//         c.xswap.address
//       )
//     ];
//     const id = utils.computeId(c.sender.address, c.receiver.address, 1, nonce);
//     const fee = parseUnits('1');
//     const msg = utils.encodeMessage(id, swaps, c.receiver.address, false, fee);
//     const tx = await c.xswap.executeMessageWithTransfer(ZERO_ADDR, c.tokenA.address, bridgeOutAmount, 0, msg);
//     const expectAmountOut = utils.slip(bridgeOutAmount, 5).sub(fee);
//     await expect(tx).to.emit(c.xswap, 'RequestDone').withArgs(id);
//   });
//   it('should swap and send native', async function () {});
//   it('should send bridge token to receiver if no dst swap specified', async function () {});
//   it('should send bridge token to receiver if swap fails on dst chain', async function () {});
// });
