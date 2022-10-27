import { parseUnits } from '@ethersproject/units';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { loadFixture } from './lib/common';
import { ZERO_ADDR } from './lib/constants';
import { chainhopFixture, IntegrationTestContext } from './lib/fixtures';
import * as utils from './lib/utils';

let c: IntegrationTestContext;

const prepareContext = async () => {
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
};

describe('transferWithSwap', () => {
  beforeEach(prepareContext);
  it('should revert if the tx results in a noop', async function () {
    const desc = await utils.buildTransferDesc(c, '0x', { dstChainId: c.chainId, dstTransferSwapper: c.xswap.address });
    await expect(c.xswap.connect(c.sender).transferWithSwap(desc, utils.emptySwap, utils.emptySwap)).to.be.revertedWith('nop');
  });
  it('should revert if invalid fee sig', async function () {
    const amountIn = utils.defaultAmountIn;
    const dstSwap = utils.buildUniV2Swap(c, amountIn);
    const invalidSig = await utils.signQuote(c, { feeInBridgeOutToken: parseUnits('123123123123') });
    const desc = await utils.buildTransferDesc(c, invalidSig, {
      amountIn: amountIn
    });
    await c.tokenA.connect(c.sender).approve(c.xswap.address, amountIn);
    const tx = c.xswap.connect(c.sender).transferWithSwap(desc, utils.emptySwap, dstSwap, { value: 1000 });
    await expect(tx).to.be.revertedWith('invalid signer');
  });
  it('should revert if fee deadline has passed', async function () {
    const amountIn = utils.defaultAmountIn;
    const dstSwap = utils.buildUniV2Swap(c, amountIn);
    const deadline = BigNumber.from(Math.floor(Date.now() / 1000 - 300));
    const quoteSig = await utils.signQuote(c, { deadline });
    const desc = await utils.buildTransferDesc(c, quoteSig, {
      deadline: deadline
    });
    await c.tokenA.connect(c.sender).approve(c.xswap.address, amountIn);
    const tx = c.xswap.connect(c.sender).transferWithSwap(desc, utils.emptySwap, dstSwap, { value: 1000 });
    await expect(tx).to.be.revertedWith('deadline exceeded');
  });
  it('should revert if native in but not enough value', async function () {
    const amountIn = utils.defaultAmountIn;
    const srcSwap = utils.buildUniV2Swap(c, amountIn, { tokenIn: c.weth.address });
    const quoteSig = await utils.signQuote(c);
    const desc = await utils.buildTransferDesc(c, quoteSig, {
      tokenIn: c.weth.address,
      nativeIn: true
    });
    const tx = c.xswap.connect(c.sender).transferWithSwap(desc, srcSwap, utils.emptySwap, { value: amountIn.sub(parseUnits('95')) });
    await expect(tx).to.be.revertedWith('insufficient native amount');
  });
  it('should bridge -> swap', async function () {
    const amountIn = utils.defaultAmountIn;
    const dstSwaps = utils.buildUniV2Swap(c, amountIn);
    const quoteSig = await utils.signQuote(c);
    const desc = await utils.buildTransferDesc(c, quoteSig, {
      amountIn: amountIn
    });
    await c.tokenA.connect(c.sender).approve(c.xswap.address, amountIn);
    const tx = await c.xswap.connect(c.sender).transferWithSwap(desc, utils.emptySwap, dstSwaps, { value: 1000 });
    const expectId = utils.computeId(c.sender.address, c.receiver.address, c.chainId, desc.nonce);
    const pocket = utils.getPocketAddr(expectId, c.receiver.address);
    const expectXferId = utils.computeTransferId(c, {
      token: c.tokenA.address,
      receiver: pocket
    });
    await expect(tx)
      .to.emit(c.xswap, 'SrcExecuted')
      .withArgs(
        expectId,
        desc.dstChainId,
        amountIn,
        c.tokenA.address,
        amountIn,
        c.tokenA.address,
        c.tokenB.address,
        'cbridge',
        pocket,
        expectXferId
      );
  });
  it('should swap -> bridge', async function () {
    const amountIn = utils.defaultAmountIn;
    const srcSwap = utils.buildUniV2Swap(c, amountIn);
    const quoteSig = await utils.signQuote(c);
    const desc = await utils.buildTransferDesc(c, quoteSig, {
      dstTransferSwapper: c.receiver.address
    });
    await c.tokenA.connect(c.sender).approve(c.xswap.address, amountIn);
    const tx = await c.xswap.connect(c.sender).transferWithSwap(desc, srcSwap, utils.emptySwap, { value: 1000 });
    const expectId = utils.computeId(c.sender.address, c.receiver.address, c.chainId, desc.nonce);
    const expectAmountOut = utils.slipUniV2(amountIn);
    const expectXferId = utils.computeTransferId(c, {
      amount: expectAmountOut,
      token: c.tokenB.address
    });
    await expect(tx)
      .to.emit(c.xswap, 'SrcExecuted')
      .withArgs(
        expectId,
        desc.dstChainId,
        amountIn,
        c.tokenA.address,
        expectAmountOut,
        c.tokenB.address,
        c.tokenB.address,
        'cbridge',
        c.receiver.address,
        expectXferId
      );
  });
  it('should swap -> bridge -> swap', async function () {
    const amountIn = utils.defaultAmountIn;
    const srcSwap = utils.buildUniV2Swap(c, amountIn);
    const expectedBridgeOutAmt = utils.slipUniV2(amountIn);
    const dstSwap = utils.buildUniV2Swap(c, expectedBridgeOutAmt, { tokenIn: c.tokenB.address, tokenOut: c.tokenA.address });
    const quoteSig = await utils.signQuote(c);
    const desc = await utils.buildTransferDesc(c, quoteSig, {
      dstTokenOut: c.tokenA.address
    });

    await c.tokenA.connect(c.sender).approve(c.xswap.address, amountIn);
    const tx = await c.xswap.connect(c.sender).transferWithSwap(desc, srcSwap, dstSwap, { value: 1000 });
    const expectId = utils.computeId(c.sender.address, c.receiver.address, c.chainId, desc.nonce);
    const pocket = utils.getPocketAddr(expectId, c.receiver.address);
    const expectXferId = utils.computeTransferId(c, { amount: expectedBridgeOutAmt, receiver: pocket, token: c.tokenB.address });

    await expect(tx)
      .to.emit(c.xswap, 'SrcExecuted')
      .withArgs(
        expectId,
        desc.dstChainId,
        amountIn,
        c.tokenA.address,
        expectedBridgeOutAmt,
        c.tokenB.address,
        c.tokenA.address,
        'cbridge',
        pocket,
        expectXferId
      );
  });
  it('should revert if using wrapped bridge token but tokenOut from dex != canonical', async function () {
    const amountIn = utils.defaultAmountIn;
    const srcSwap = utils.buildUniV2Swap(c, amountIn);
    const quoteSig = await utils.signQuote(c);
    const desc = await utils.buildTransferDesc(c, quoteSig, {
      wrappedBridgeToken: c.wrappedBridgeToken.address
    });
    await c.tokenA.connect(c.sender).approve(c.xswap.address, amountIn);
    const tx = c.xswap.connect(c.sender).transferWithSwap(desc, srcSwap, srcSwap, { value: 1000 });
    await expect(tx).to.be.revertedWith('canonical != _token');
  });
  it('should revert if using wrapped bridge token but tokenIn != canonical', async function () {
    const amountIn = utils.defaultAmountIn;
    const quoteSig = await utils.signQuote(c, { tokenIn: c.tokenB.address });
    const desc = await utils.buildTransferDesc(c, quoteSig, {
      wrappedBridgeToken: c.wrappedBridgeToken.address,
      tokenIn: c.tokenB.address, // wrong token
      amountIn: amountIn
    });
    await c.tokenB.connect(c.sender).approve(c.xswap.address, amountIn);
    const tx = c.xswap.connect(c.sender).transferWithSwap(desc, utils.emptySwap, utils.emptySwap, { value: 1000 });
    await expect(tx).to.be.revertedWith('canonical != _token');
  });
  it('should bridge using wrapped bridge token', async function () {
    const amountIn = utils.defaultAmountIn;
    const maxSlippage = 1000000;
    const quoteSig = await utils.signQuote(c);
    const desc = await utils.buildTransferDesc(c, quoteSig, {
      amountIn: amountIn,
      tokenIn: c.tokenA.address,
      wrappedBridgeToken: c.wrappedBridgeToken.address, // wraps tokenA
      maxSlippage: maxSlippage,
      dstTransferSwapper: c.receiver.address
    });
    await c.tokenA.connect(c.sender).approve(c.xswap.address, amountIn);
    const tx = await c.xswap.connect(c.sender).transferWithSwap(desc, utils.emptySwap, utils.emptySwap, { value: 1000 });
    const expectId = utils.computeId(c.sender.address, c.receiver.address, c.chainId, desc.nonce);
    const expectXferId = utils.computeTransferId(c, {
      amount: amountIn,
      token: c.wrappedBridgeToken.address
    });
    await expect(tx)
      .to.emit(c.xswap, 'SrcExecuted')
      .withArgs(
        expectId,
        desc.dstChainId,
        amountIn,
        c.tokenA.address,
        amountIn,
        c.tokenA.address,
        c.tokenB.address,
        'cbridge',
        c.receiver.address,
        expectXferId
      );
  });
  it('should swap -> bridge (native in)', async function () {
    const amountIn = parseUnits('1');
    const srcSwap = utils.buildUniV2Swap(c, amountIn, { tokenIn: c.weth.address });
    const quoteSig = await utils.signQuote(c, { tokenIn: c.weth.address, amountIn: amountIn });
    const desc = await utils.buildTransferDesc(c, quoteSig, {
      amountIn: amountIn,
      tokenIn: c.weth.address,
      nativeIn: true
    });
    const tx = await c.xswap.connect(c.sender).transferWithSwap(desc, srcSwap, utils.emptySwap, { value: amountIn.add(1000) });
    const expectId = utils.computeId(c.sender.address, c.receiver.address, c.chainId, desc.nonce);
    const expectAmountOut = utils.slipUniV2(amountIn);
    const expectXferId = utils.computeTransferId(c, {
      amount: expectAmountOut,
      token: c.tokenB.address
    });
    await expect(tx)
      .to.emit(c.xswap, 'SrcExecuted')
      .withArgs(
        expectId,
        desc.dstChainId,
        amountIn,
        c.weth.address,
        expectAmountOut,
        c.tokenB.address,
        c.tokenB.address,
        'cbridge',
        c.receiver.address,
        expectXferId
      );
  });
  it('should directly swap', async function () {
    const amountIn = utils.defaultAmountIn;
    const srcSwap = utils.buildUniV2Swap(c, amountIn);
    const quoteSig = await utils.signQuote(c);
    const desc = await utils.buildTransferDesc(c, quoteSig, {
      dstChainId: c.chainId
    });
    await c.tokenA.connect(c.sender).approve(c.xswap.address, amountIn);
    const tx = await c.xswap.connect(c.sender).transferWithSwap(desc, srcSwap, utils.emptySwap);
    const expectId = utils.computeId(c.sender.address, c.receiver.address, c.chainId, desc.nonce);
    const expectAmountOut = utils.slipUniV2(amountIn);
    await expect(tx)
      .to.emit(c.xswap, 'SrcExecuted')
      .withArgs(expectId, c.chainId, amountIn, c.tokenA.address, expectAmountOut, c.tokenB.address, c.tokenB.address, '', ZERO_ADDR, '0x');
    await expect(tx).to.not.emit(c.bridge, 'Send');
  });
  it('should directly swap (native in)', async function () {
    const amountIn = parseUnits('1');
    const srcSwap = utils.buildUniV2Swap(c, amountIn, { tokenIn: c.weth.address });
    const quoteSig = await utils.signQuote(c, { amountIn, tokenIn: c.weth.address });
    const desc = await utils.buildTransferDesc(c, quoteSig, {
      tokenIn: c.weth.address,
      dstChainId: c.chainId,
      nativeIn: true,
      amountIn: amountIn
    });

    const tx = await c.xswap.connect(c.sender).transferWithSwap(desc, srcSwap, utils.emptySwap, { value: amountIn });
    const expectId = utils.computeId(c.sender.address, c.receiver.address, c.chainId, desc.nonce);
    const expectAmountOut = utils.slipUniV2(amountIn);
    await expect(tx)
      .to.emit(c.xswap, 'SrcExecuted')
      .withArgs(expectId, c.chainId, amountIn, c.weth.address, expectAmountOut, c.tokenB.address, c.tokenB.address, '', ZERO_ADDR, '0x');
    await expect(tx).to.not.emit(c.bridge, 'Send');
  });
});

describe('executeMessage', function () {
  beforeEach(async () => {
    await prepareContext();
  });
  it('should revert if pocket does not have enough fund', async function () {
    const amountIn = utils.defaultAmountIn;
    const swap = utils.buildUniV2Swap(c, amountIn, { amountOutMin: amountIn });
    const id = utils.computeId(c.sender.address, c.receiver.address, c.chainId, utils.defaultNonce);
    const pocket = utils.getPocketAddr(id, c.xswap.address);
    const msg = utils.encodeMessage(id, swap, c.receiver.address, false, {
      bridgeOutToken: c.tokenA.address,
      bridgeOutMin: amountIn.add(1) // bridge out min is greater than pocket balance, should revert
    });

    await c.tokenA.transfer(pocket, amountIn);
    const tx = c.xswap.executeMessage(ZERO_ADDR, 0, msg, ZERO_ADDR);
    await expect(tx).to.be.revertedWith('MSGBUS::REVERT');
  });
  it('should refund if it receives fallback token', async function () {
    const amountIn = utils.defaultAmountIn;
    const swap = utils.buildUniV2Swap(c, amountIn);
    const id = utils.computeId(c.sender.address, c.receiver.address, c.chainId, utils.defaultNonce);
    const pocket = utils.getPocketAddr(id, c.xswap.address);
    const refundAmount = amountIn.sub(utils.defaultFee);
    const msg = utils.encodeMessage(id, swap, c.receiver.address, false, {
      bridgeOutToken: c.tokenA.address,
      bridgeOutFallbackToken: c.tokenB.address,
      feeInBridgeOutFallbackToken: utils.defaultFee
    });
    await c.tokenB.transfer(pocket, amountIn);
    const tx = c.xswap.executeMessage(ZERO_ADDR, 0, msg, ZERO_ADDR);
    await expect(tx).to.emit(c.xswap, 'DstExecuted').withArgs(id, 0, refundAmount, c.tokenB.address, utils.defaultFee, 2, '0x');
  });
  it('should refund if swap fails', async function () {
    const amountIn = utils.defaultAmountIn;
    const swap = utils.buildUniV2Swap(c, amountIn, { amountOutMin: amountIn });
    const id = utils.computeId(c.sender.address, c.receiver.address, c.chainId, utils.defaultNonce);
    const pocket = utils.getPocketAddr(id, c.xswap.address);
    const msg = utils.encodeMessage(id, swap, c.receiver.address, false, {
      bridgeOutToken: c.tokenA.address,
      bridgeOutFallbackToken: c.tokenB.address
    });
    await c.tokenA.transfer(pocket, amountIn);
    const tx = c.xswap.executeMessage(ZERO_ADDR, 0, msg, ZERO_ADDR);
    await expect(tx)
      .to.emit(c.xswap, 'DstExecuted')
      .withArgs(id, 0, amountIn.sub(utils.defaultFee), c.tokenA.address, utils.defaultFee, 2, '0x');
  });
  it('should collect all fallback amount as fee if fallback amount <= fee', async function () {
    const amountIn = utils.defaultFee.sub(1);
    const swap = utils.buildUniV2Swap(c, amountIn);
    const id = utils.computeId(c.sender.address, c.receiver.address, c.chainId, utils.defaultNonce);
    const pocket = utils.getPocketAddr(id, c.xswap.address);
    const msg = utils.encodeMessage(id, swap, c.receiver.address, false, {
      bridgeOutToken: c.tokenA.address,
      bridgeOutFallbackToken: c.tokenB.address,
      feeInBridgeOutToken: utils.defaultFee,
      feeInBridgeOutFallbackToken: utils.defaultFee
    });
    await c.tokenB.transfer(pocket, amountIn);
    const tx = c.xswap.executeMessage(ZERO_ADDR, 0, msg, ZERO_ADDR);
    await expect(tx).to.emit(c.xswap, 'DstExecuted').withArgs(id, 0, 0, c.tokenB.address, amountIn, 2, '0x');
  });
  it('should collect all received amount as fee if amount <= fee', async function () {
    const amountIn = utils.defaultFee.sub(1);
    const swap = utils.buildUniV2Swap(c, amountIn);
    const id = utils.computeId(c.sender.address, c.receiver.address, c.chainId, utils.defaultNonce);
    const pocket = utils.getPocketAddr(id, c.xswap.address);
    const msg = utils.encodeMessage(id, swap, c.receiver.address, false, {
      bridgeOutToken: c.tokenA.address,
      bridgeOutFallbackToken: c.tokenB.address,
      feeInBridgeOutToken: utils.defaultFee,
      feeInBridgeOutFallbackToken: utils.defaultFee
    });
    await c.tokenA.transfer(pocket, amountIn);
    const tx = c.xswap.executeMessage(ZERO_ADDR, 0, msg, ZERO_ADDR);
    await expect(tx).to.emit(c.xswap, 'DstExecuted').withArgs(id, 0, 0, c.tokenA.address, amountIn, 2, '0x');
  });
  it('should send swap out token to receiver', async function () {
    const amountIn = utils.defaultAmountIn;
    const amountInSubFee = amountIn.sub(utils.defaultFee);
    const swap = utils.buildUniV2Swap(c, amountInSubFee);
    const id = utils.computeId(c.sender.address, c.receiver.address, c.chainId, utils.defaultNonce);
    const pocket = utils.getPocketAddr(id, c.xswap.address);
    const msg = utils.encodeMessage(id, swap, c.receiver.address, false, {
      bridgeOutToken: c.tokenA.address,
      feeInBridgeOutToken: utils.defaultFee
    });
    await c.tokenA.transfer(pocket, amountIn);
    const tx = c.xswap.executeMessage(ZERO_ADDR, 0, msg, ZERO_ADDR);
    await expect(tx)
      .to.emit(c.xswap, 'DstExecuted')
      .withArgs(id, utils.slipUniV2(amountInSubFee), 0, c.tokenB.address, utils.defaultFee, 1, '0x');
  });
  it('should send swap out token to receiver (bridge out is native)', async function () {
    const amountIn = parseUnits('1');
    const fee = parseUnits('0.01');
    const amountInSubFee = amountIn.sub(fee);
    const swap = utils.buildUniV2Swap(c, amountInSubFee, { tokenIn: c.weth.address });
    const id = utils.computeId(c.sender.address, c.receiver.address, c.chainId, utils.defaultNonce);
    const pocket = utils.getPocketAddr(id, c.xswap.address);
    const msg = utils.encodeMessage(id, swap, c.receiver.address, false, {
      bridgeOutToken: c.weth.address,
      feeInBridgeOutToken: fee
    });
    await c.admin.sendTransaction({
      to: pocket,
      value: parseUnits('1')
    });
    const tx = c.xswap.executeMessage(ZERO_ADDR, 0, msg, ZERO_ADDR);
    await expect(tx).to.emit(c.xswap, 'DstExecuted').withArgs(id, utils.slipUniV2(amountInSubFee), 0, c.tokenB.address, fee, 1, '0x');
  });
  it('should send swap out token to receiver (native out)', async function () {
    const amountIn = parseUnits('1');
    const fee = parseUnits('0.01');
    const amountInSubFee = amountIn.sub(fee);
    const swap = utils.buildUniV2Swap(c, amountInSubFee, { tokenOut: c.weth.address });
    const id = utils.computeId(c.sender.address, c.receiver.address, c.chainId, utils.defaultNonce);
    const pocket = utils.getPocketAddr(id, c.xswap.address);
    const msg = utils.encodeMessage(id, swap, c.receiver.address, true, {
      bridgeOutToken: c.tokenA.address,
      feeInBridgeOutToken: fee
    });
    await c.tokenA.transfer(pocket, amountIn);
    const tx = c.xswap.executeMessage(ZERO_ADDR, 0, msg, ZERO_ADDR);
    await expect(tx).to.emit(c.xswap, 'DstExecuted').withArgs(id, utils.slipUniV2(amountInSubFee), 0, c.weth.address, fee, 1, '0x');
  });
});

describe('fee', function () {
  beforeEach(async () => {
    await prepareContext();
  });
  it('should collect fee', async function () {
    const amountIn = parseUnits('1');
    const fee = parseUnits('0.01');
    const amountInSubFee = amountIn.sub(fee);
    const swap = utils.buildUniV2Swap(c, amountInSubFee, { tokenOut: c.weth.address });
    const id = utils.computeId(c.sender.address, c.receiver.address, c.chainId, utils.defaultNonce);
    const pocket = utils.getPocketAddr(id, c.xswap.address);
    const msg = utils.encodeMessage(id, swap, c.receiver.address, true, {
      bridgeOutToken: c.tokenA.address,
      feeInBridgeOutToken: fee
    });
    await c.tokenA.transfer(pocket, amountIn);
    const tx = c.xswap.executeMessage(ZERO_ADDR, 0, msg, ZERO_ADDR);
    await expect(tx).to.emit(c.xswap, 'DstExecuted').withArgs(id, utils.slipUniV2(amountInSubFee), 0, c.weth.address, fee, 1, '0x');

    const balBefore = await c.tokenA.balanceOf(c.feeCollector.address);
    await c.xswap.connect(c.feeCollector).collectFee([c.tokenA.address], c.feeCollector.address);
    const balAfter = await c.tokenA.balanceOf(c.feeCollector.address);
    await expect(balAfter.sub(balBefore)).to.equal(fee);
  });
  it('should collect fee (native)', async function () {
    const amountIn = parseUnits('1');
    const fee = parseUnits('0.01');
    const amountInSubFee = amountIn.sub(fee);
    const swap = utils.buildUniV2Swap(c, amountInSubFee, { tokenIn: c.weth.address });
    const id = utils.computeId(c.sender.address, c.receiver.address, c.chainId, utils.defaultNonce);
    const pocket = utils.getPocketAddr(id, c.xswap.address);
    const msg = utils.encodeMessage(id, swap, c.receiver.address, false, {
      bridgeOutToken: c.weth.address,
      feeInBridgeOutToken: fee
    });
    await c.admin.sendTransaction({
      to: pocket,
      value: parseUnits('1')
    });
    const tx = c.xswap.executeMessage(ZERO_ADDR, 0, msg, ZERO_ADDR);
    await expect(tx).to.emit(c.xswap, 'DstExecuted').withArgs(id, utils.slipUniV2(amountInSubFee), 0, c.tokenB.address, fee, 1, '0x');

    const balBefore = await c.feeCollector.getBalance();
    await c.xswap.connect(c.feeCollector).collectFee([ZERO_ADDR], c.feeCollector.address);
    const balAfter = await c.feeCollector.getBalance();
    await expect(balAfter.sub(balBefore)).to.be.gt(fee.sub(parseUnits('0.005'))); // accounting for gas expenditure
  });
});

describe('claimPocketFund', function () {
  beforeEach(async () => {
    await prepareContext();
  });
  it('should revert if pocket has no fund', async function () {
    const srcChainId = 1;
    const tx = c.xswap.claimPocketFund(c.sender.address, srcChainId, utils.defaultNonce, c.tokenA.address);
    await expect(tx).to.revertedWith('pocket is empty');
  });
  it('should claim erc20 token', async function () {
    const srcChainId = 1;
    const claimAmount = utils.defaultAmountIn;
    const id = utils.computeId(c.sender.address, c.receiver.address, srcChainId, utils.defaultNonce);
    const pocket = utils.getPocketAddr(id, c.xswap.address);
    await c.tokenA.connect(c.admin).transfer(pocket, claimAmount);
    const tx = c.xswap.connect(c.receiver).claimPocketFund(c.sender.address, srcChainId, utils.defaultNonce, c.tokenA.address);
    await expect(tx).to.emit(c.xswap, 'PocketFundClaimed').withArgs(c.receiver.address, claimAmount, c.tokenA.address, 0);
  });
});
