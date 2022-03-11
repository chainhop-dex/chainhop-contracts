import { keccak256 } from '@ethersproject/solidity';
import { expect } from 'chai';
import { BigNumber, Wallet } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import { TransferSwapper } from './../typechain/TransferSwapper';
import { loadFixture } from './lib/common';
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

describe('Test transferWithSwap', () => {
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

  // it('should directly swap', async function () {
  // srcSwap.path = [c.tokenA.address, c.tokenB.address];
  // dstSwap.path = [];
  // await c.tokenA.connect(sender).approve(xswap.address, amountIn);
  // const recvBalBefore = await c.tokenB.connect(receiver).balanceOf(receiver.address);
  // const tx = await xswap
  //   .connect(sender)
  //   .transferWithSwap(receiver.address, amountIn, chainId, srcSwap, dstSwap, maxBridgeSlippage, 1);
  // const recvBalAfter = await c.tokenB.connect(receiver).balanceOf(receiver.address);
  // const expectId = computeDirectSwapId(sender.address, srcChainId, receiver.address, nonce, srcSwap);
  // await expect(tx).to.not.emit(xswap, 'SwapRequestSent');
  // await expect(tx).to.not.emit(bridge, 'Send');
  // await expect(tx)
  //   .to.emit(xswap, 'DirectSwap')
  //   .withArgs(expectId, chainId, amountIn, c.tokenA.address, slip(amountIn, 5), c.tokenB.address);
  // expect(recvBalAfter).equal(recvBalBefore.add(slip(amountIn, 5)));
  // });
});

// describe('Test transferWithSwapNative', function () {
//   // let srcChainId: number;
//   // const dstChainId = 2; // doesn't matter

//   // const amountIn2 = parseUnits('10');

//   // beforeEach(async () => {
//   //   // await prepare();
//   //   // srcChainId = chainId;
//   // });

//   it('should revert if native in does not match amountIn (native in)', async function () {
//     // srcSwap.path = [weth.address, c.tokenB.address];
//     // dstSwap.path = [c.tokenB.address, weth.address];
//     // await expect(
//     //   xswap
//     //     .connect(sender)
//     //     .transferWithSwapNative(receiver.address, amountIn2, dstChainId, srcSwap, dstSwap, maxBridgeSlippage, 1, true, {
//     //       value: amountIn2.div(2)
//     //     })
//     // ).to.be.revertedWith('Amount insufficient');
//   });

//   it('should swap and send (native in)', async function () {
//     // srcSwap.path = [weth.address, c.tokenB.address];
//     // srcSwap.minRecvAmt = slip(amountIn2, 10);
//     // dstSwap.path = [c.tokenB.address, weth.address];
//     // dstSwap.minRecvAmt = slip(amountIn2, 10);
//     // const balBefore = await sender.getBalance();
//     // const tx = await xswap
//     //   .connect(sender)
//     //   .transferWithSwapNative(receiver.address, amountIn2, dstChainId, srcSwap, dstSwap, maxBridgeSlippage, 1, true, {
//     //     value: amountIn2
//     //   });
//     // const balAfter = await sender.getBalance();
//     // expect(balAfter.lte(balBefore.sub(amountIn2)));
//     // const message = encodeMessage(dstSwap, sender.address, nonce, true);
//     // const expectId = computeId(sender.address, srcChainId, dstChainId, message);
//     // await expect(tx)
//     //   .to.emit(xswap, 'SwapRequestSent')
//     //   .withArgs(expectId, dstChainId, amountIn2, srcSwap.path[0], dstSwap.path[1]);
//     // const expectedSendAmt = slip(amountIn2, 5);
//     // const srcXferId = keccak256(
//     //   ['address', 'address', 'address', 'uint256', 'uint64', 'uint64', 'uint64'],
//     //   [xswap.address, receiver.address, c.tokenB.address, expectedSendAmt, dstChainId, nonce, srcChainId]
//     // );
//     // await expect(tx)
//     //   .to.emit(bridge, 'Send')
//     //   .withArgs(
//     //     srcXferId,
//     //     xswap.address,
//     //     receiver.address,
//     //     c.tokenB.address,
//     //     expectedSendAmt,
//     //     dstChainId,
//     //     nonce,
//     //     maxBridgeSlippage
//     //   );
//   });
// });

// describe('Test executeMessageWithTransfer', function () {
//   // beforeEach(async () => {
//   //   await prepare();
//   //   // impersonate MessageBus as admin to gain access to calling executeMessageWithTransfer
//   //   await xswap.connect(admin).setMessageBus(admin.address);
//   // });
//   // const srcChainId = 1;
//   // it('should swap', async function () {
//   //   dstSwap.path = [c.tokenA.address, c.tokenB.address];
//   //   const message = encodeMessage(dstSwap, receiver.address, nonce, false);
//   //   const balB1 = await c.tokenB.connect(admin).balanceOf(receiver.address);
//   //   await c.tokenA.connect(admin).transfer(xswap.address, amountIn);
//   //   const tx = await xswap
//   //     .connect(admin)
//   //     .executeMessageWithTransfer(ZERO_ADDR, c.tokenA.address, amountIn, srcChainId, message);
//   //   const balB2 = await c.tokenB.connect(admin).balanceOf(receiver.address);
//   //   const id = computeId(receiver.address, srcChainId, chainId, message);
//   //   const dstAmount = slip(amountIn, 5);
//   //   const expectStatus = 1; // SwapStatus.Succeeded
//   //   await expect(tx).to.emit(xswap, 'SwapRequestDone').withArgs(id, dstAmount, expectStatus);
//   //   expect(balB2).to.equal(balB1.add(dstAmount));
//   // });
//   // it('should swap and send native', async function () {
//   //   dstSwap.path = [c.tokenA.address, weth.address];
//   //   const amountIn2 = parseUnits('10');
//   //   dstSwap.minRecvAmt = slip(amountIn2, 10);
//   //   const message = encodeMessage(dstSwap, receiver.address, nonce, true);
//   //   const bal1 = await receiver.getBalance();
//   //   await c.tokenA.connect(admin).transfer(xswap.address, amountIn2);
//   //   const tx = await xswap
//   //     .connect(admin)
//   //     .executeMessageWithTransfer(ZERO_ADDR, c.tokenA.address, amountIn2, srcChainId, message);
//   //   const bal2 = await receiver.getBalance();
//   //   const id = computeId(receiver.address, srcChainId, chainId, message);
//   //   const dstAmount = slip(amountIn2, 5);
//   //   const expectStatus = 1; // SwapStatus.Succeeded
//   //   await expect(tx).to.emit(xswap, 'SwapRequestDone').withArgs(id, dstAmount, expectStatus);
//   //   expect(bal2.eq(bal1.add(dstAmount)));
//   // });
//   // it('should send bridge token to receiver if no dst swap specified', async function () {
//   //   dstSwap.path = [c.tokenA.address];
//   //   const message = encodeMessage(dstSwap, receiver.address, nonce, false);
//   //   await c.tokenA.connect(admin).transfer(xswap.address, amountIn);
//   //   const balA1 = await c.tokenA.connect(receiver).balanceOf(receiver.address);
//   //   const tx = await xswap
//   //     .connect(admin)
//   //     .executeMessageWithTransfer(ZERO_ADDR, c.tokenA.address, amountIn, srcChainId, message);
//   //   const balA2 = await c.tokenA.connect(receiver).balanceOf(receiver.address);
//   //   const id = computeId(receiver.address, srcChainId, chainId, message);
//   //   const expectStatus = 1; // SwapStatus.Succeeded
//   //   await expect(tx).to.emit(xswap, 'SwapRequestDone').withArgs(id, amountIn, expectStatus);
//   //   expect(balA2).to.equal(balA1.add(amountIn));
//   // });
//   // it('should send bridge token to receiver if swap fails on dst chain', async function () {
//   //   srcSwap.path = [c.tokenA.address, c.tokenB.address];
//   //   dstSwap.path = [c.tokenB.address, c.tokenA.address];
//   //   const bridgeAmount = slip(amountIn, 5);
//   //   dstSwap.minRecvAmt = bridgeAmount; // dst chain swap should fail due to slippage
//   //   const msg = encodeMessage(dstSwap, receiver.address, nonce, false);
//   //   const balA1 = await c.tokenA.balanceOf(receiver.address);
//   //   const balB1 = await c.tokenB.balanceOf(receiver.address);
//   //   await c.tokenB.connect(admin).transfer(xswap.address, bridgeAmount);
//   //   const tx = xswap
//   //     .connect(admin)
//   //     .executeMessageWithTransfer(ZERO_ADDR, c.tokenB.address, bridgeAmount, srcChainId, msg);
//   //   const expectId = computeId(receiver.address, srcChainId, chainId, msg);
//   //   const expectStatus = 3; // SwapStatus.Fallback
//   //   await expect(tx).to.emit(xswap, 'SwapRequestDone').withArgs(expectId, slip(amountIn, 5), expectStatus);
//   //   const balA2 = await c.tokenA.balanceOf(receiver.address);
//   //   const balB2 = await c.tokenB.balanceOf(receiver.address);
//   //   expect(balA2, 'balance A after').equals(balA1);
//   //   expect(balB2, 'balance B after').equals(balB1.add(bridgeAmount));
//   // });
// });
