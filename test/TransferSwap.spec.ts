import { keccak256 } from '@ethersproject/solidity';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import { loadFixture } from './lib/common';
import { ZERO_ADDR, ZERO_AMOUNT } from './lib/constants';
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
    const desc = await utils.buildTransferDesc(c, '0x', { dstTransferSwapper: c.xswap.address });

    await expect(c.xswap.connect(c.sender).transferWithSwap(desc, [], [])).to.be.revertedWith('nop');
    desc.dstChainId = c.chainId + 1;
    desc.amountIn = parseUnits('0');
    await expect(c.xswap.connect(c.sender).transferWithSwap(desc, [], [])).to.be.revertedWith('nop');
  });
  it('should revert if invalid fee sig', async function () {
    const amountIn = parseUnits('100');
    const srcSwaps = utils.buildUniV2Swaps(c, amountIn);
    const invalidSig = await utils.signFee(c, { fee: parseUnits('123123123123') });
    const desc = await utils.buildTransferDesc(c, invalidSig, { dstTransferSwapper: c.receiver.address });

    await c.tokenA.connect(c.sender).approve(c.xswap.address, amountIn);
    const tx = c.xswap.connect(c.sender).transferWithSwap(desc, srcSwaps, []);
    await expect(tx).to.be.revertedWith('invalid signer');
  });
  it('should revert if fee deadline has passed', async function () {
    const amountIn = parseUnits('100');
    const srcSwaps = utils.buildUniV2Swaps(c, amountIn);
    const feeDeadline = BigNumber.from(Math.floor(Date.now() / 1000 - 300));
    const feeSig = await utils.signFee(c, { feeDeadline });
    const desc = await utils.buildTransferDesc(c, feeSig, { feeDeadline: feeDeadline, dstTransferSwapper: c.receiver.address });

    await c.tokenA.connect(c.sender).approve(c.xswap.address, amountIn);
    const tx = c.xswap.connect(c.sender).transferWithSwap(desc, srcSwaps, []);
    await expect(tx).to.be.revertedWith('deadline exceeded');
  });
  it('should revert if native in but not enough value', async function () {
    const amountIn = parseUnits('100');
    const srcSwaps = utils.buildUniV2Swaps(c, amountIn, { tokenIn: c.weth.address });
    const feeSig = await utils.signFee(c);
    const desc = await utils.buildTransferDesc(c, feeSig, { tokenIn: c.weth.address, nativeIn: true, dstTransferSwapper: c.receiver.address });
    const tx = c.xswap
      .connect(c.sender)
      .transferWithSwap(desc, srcSwaps, [], { value: amountIn.sub(parseUnits('95')) });
    await expect(tx).to.be.revertedWith('insfcnt amt');
  });
  it('should directly transfer', async function () {
    const amountIn = parseUnits('100');
    const maxSlippage = 1000000;
    const dstSwaps = utils.buildUniV2Swaps(c, amountIn);
    const feeSig = await utils.signFee(c);
    const desc = await utils.buildTransferDesc(c, feeSig, { amountIn: amountIn, maxSlippage: maxSlippage, dstTransferSwapper: c.receiver.address });

    await c.tokenA.connect(c.sender).approve(c.xswap.address, amountIn);
    const senderBal = await c.tokenA.balanceOf(c.sender.address);
    const tx = await c.xswap
      .connect(c.sender)
      .transferWithSwap(desc, [], dstSwaps, { value: 1000 });
    const expectId = utils.computeId(c.sender.address, c.receiver.address, c.chainId, desc.nonce);
    const expectXferId = utils.computeTransferId(c, { token: c.tokenA.address });

    await expect(tx)
      .to.emit(c.xswap, 'RequestSent')
      .withArgs(
        expectId,
        expectXferId,
        desc.dstChainId,
        amountIn,
        c.tokenA.address,
        c.tokenB.address,
        c.receiver.address,
        c.tokenA.address,
        amountIn,
        "cbridge"
      );

    const senderBalAfter = await c.tokenA.balanceOf(c.sender.address);
    const senderBalDiff = senderBal.sub(senderBalAfter);
    await expect(senderBalDiff).to.equal(amountIn);

    const srcXferId = keccak256(
      ['address', 'address', 'address', 'uint256', 'uint64', 'uint64', 'uint64'],
      [c.bridgeAdapter.address, c.receiver.address, c.tokenA.address, amountIn, desc.dstChainId, desc.nonce, c.chainId]
    );
    await expect(tx)
      .to.emit(c.bridge, 'Send')
      .withArgs(
        srcXferId,
        c.bridgeAdapter.address,
        c.receiver.address,
        c.tokenA.address,
        amountIn,
        desc.dstChainId,
        desc.nonce,
        maxSlippage
      );
  });
  it('should swap and directly bridge tokens to receiver with Uniswap V2 (no dst swap)', async function () {
    const amountIn = parseUnits('100');
    const maxSlippage = 1000000;
    const srcSwaps = utils.buildUniV2Swaps(c, amountIn);
    const feeSig = await utils.signFee(c);
    const desc = await utils.buildTransferDesc(c, feeSig, { receiver: c.sender.address, maxSlippage: maxSlippage, dstTransferSwapper: c.receiver.address });
    await c.tokenA.connect(c.sender).approve(c.xswap.address, amountIn);
    const tx = await c.xswap
      .connect(c.sender)
      .transferWithSwap(desc, srcSwaps, [], { value: 1000 });
    const expectId = utils.computeId(c.sender.address, c.sender.address, c.chainId, desc.nonce);
    const expectXferId = utils.computeTransferId(c, { amount: utils.slipUniV2(amountIn), receiver: c.sender.address });
    await expect(tx)
      .to.emit(c.xswap, 'RequestSent')
      .withArgs(
        expectId,
        expectXferId,
        desc.dstChainId,
        amountIn,
        c.tokenA.address,
        c.tokenB.address,
        c.sender.address,
        c.tokenB.address,
        utils.slipUniV2(amountIn),
        "cbridge"
      );
    const expectedSendAmt = utils.slipUniV2(amountIn);
    const srcXferId = keccak256(
      ['address', 'address', 'address', 'uint256', 'uint64', 'uint64', 'uint64'],
      [c.bridgeAdapter.address, c.sender.address, c.tokenB.address, expectedSendAmt, desc.dstChainId, desc.nonce, c.chainId]
    );
    await expect(tx).to.emit(c.bridge, 'Send').withArgs(
      srcXferId,
      c.bridgeAdapter.address,
      c.sender.address, // sender receives bridge out token because there is no dst swap
      c.tokenB.address,
      expectedSendAmt,
      desc.dstChainId,
      desc.nonce,
      maxSlippage
    );
  });
  it('should swap and transfer with Uniswap V2 (has dst swap)', async function () {
    const amountIn = parseUnits('100');
    const maxSlippage = 1000000;
    const srcSwaps = utils.buildUniV2Swaps(c, amountIn);
    const feeSig = await utils.signFee(c);
    const desc = await utils.buildTransferDesc(c, feeSig, { maxSlippage:maxSlippage, dstTransferSwapper: c.receiver.address });

    await c.tokenA.connect(c.sender).approve(c.xswap.address, amountIn);
    const tx = await c.xswap
      .connect(c.sender)
      .transferWithSwap(desc, srcSwaps, srcSwaps, { value: 1000 });
    const expectId = utils.computeId(c.sender.address, c.receiver.address, c.chainId, desc.nonce);
    const expectXferId = utils.computeTransferId(c, { amount: utils.slipUniV2(amountIn) });
    await expect(tx)
      .to.emit(c.xswap, 'RequestSent')
      .withArgs(
        expectId,
        expectXferId,
        desc.dstChainId,
        amountIn,
        c.tokenA.address,
        c.tokenB.address,
        c.receiver.address,
        c.tokenB.address,
        utils.slipUniV2(amountIn),
        "cbridge"
      );

    const expectedSendAmt = utils.slipUniV2(amountIn);
    await expect(tx)
      .to.emit(c.bridge, 'Send')
      .withArgs(
        expectXferId,
        c.bridgeAdapter.address,
        c.receiver.address,
        c.tokenB.address,
        expectedSendAmt,
        desc.dstChainId,
        desc.nonce,
        maxSlippage
      );
  });
  it('should revert if using wrapped bridge token but tokenOut from dex != canonical', async function () {
    const amountIn = parseUnits('100');
    const srcSwaps = utils.buildUniV2Swaps(c, amountIn);
    const feeSig = await utils.signFee(c);
    const desc = await utils.buildTransferDesc(c, feeSig, {
      wrappedBridgeToken: c.wrappedBridgeToken.address, 
      dstTransferSwapper: c.receiver.address
    });
    await c.tokenA.connect(c.sender).approve(c.xswap.address, amountIn);
    const tx = c.xswap
      .connect(c.sender)
      .transferWithSwap(desc, srcSwaps, srcSwaps, { value: 1000 });
    await expect(tx).to.be.revertedWith('canonical != _token');
  });
  it('should revert if using wrapped bridge token but tokenIn != canonical', async function () {
    const amountIn = parseUnits('100');
    const feeSig = await utils.signFee(c, { tokenIn: c.tokenB.address });
    const desc = await utils.buildTransferDesc(c, feeSig, {
      wrappedBridgeToken: c.wrappedBridgeToken.address,
      tokenIn: c.tokenB.address, // wrong token
      amountIn: amountIn,
      dstTransferSwapper: c.receiver.address
    });
    await c.tokenB.connect(c.sender).approve(c.xswap.address, amountIn);
    const tx = c.xswap.connect(c.sender).transferWithSwap(desc, [], [], { value: 1000 });
    await expect(tx).to.be.revertedWith('canonical != _token');
  });
  it('should bridge using wrapped bridge token', async function () {
    const amountIn = parseUnits('100');
    const maxSlippage = 1000000;
    const feeSig = await utils.signFee(c);
    const desc = await utils.buildTransferDesc(c, feeSig, {
      amountIn: amountIn,
      tokenIn: c.tokenA.address,
      wrappedBridgeToken: c.wrappedBridgeToken.address, // wraps tokenA
      maxSlippage: maxSlippage,
      dstTransferSwapper: c.receiver.address
    });
    await c.tokenA.connect(c.sender).approve(c.xswap.address, amountIn);
    const tx = await c.xswap.connect(c.sender).transferWithSwap(desc, [], [], { value: 1000 });
    const expectId = utils.computeId(c.sender.address, c.receiver.address, c.chainId, desc.nonce);
    const expectXferId = utils.computeTransferId(c, {
      amount: amountIn,
      token: c.wrappedBridgeToken.address
    });
    await expect(tx)
      .to.emit(c.xswap, 'RequestSent')
      .withArgs(
        expectId,
        expectXferId,
        desc.dstChainId,
        amountIn,
        c.tokenA.address,
        c.tokenB.address,
        c.receiver.address,
        c.tokenA.address,
        amountIn,
        "cbridge"
      );
    await expect(tx)
      .to.emit(c.bridge, 'Send')
      .withArgs(
        expectXferId,
        c.bridgeAdapter.address,
        c.receiver.address,
        c.wrappedBridgeToken.address,
        amountIn,
        desc.dstChainId,
        desc.nonce,
        maxSlippage
      );
  });
  it('should swap and transfer with Uniswap V2 (native in, has dst swap)', async function () {
    const amountIn = parseUnits('1');
    const maxSlippage = 1000000;
    const srcSwaps = utils.buildUniV2Swaps(c, amountIn, { tokenIn: c.weth.address });
    const feeSig = await utils.signFee(c, { tokenIn: c.weth.address, amountIn: amountIn });
    const desc = await utils.buildTransferDesc(c, feeSig, { tokenIn: c.weth.address, nativeIn: true, maxSlippage: maxSlippage, dstTransferSwapper: c.receiver.address });

    const tx = await c.xswap
      .connect(c.sender)
      .transferWithSwap(desc, srcSwaps, srcSwaps, { value: amountIn.add(1000) });
    const expectId = utils.computeId(c.sender.address, c.receiver.address, c.chainId, desc.nonce);
    const expectXferId = utils.computeTransferId(c, { amount: utils.slipUniV2(amountIn) });
    await expect(tx)
      .to.emit(c.xswap, 'RequestSent')
      .withArgs(
        expectId,
        expectXferId,
        desc.dstChainId,
        amountIn,
        c.weth.address,
        c.tokenB.address,
        c.receiver.address,
        c.tokenB.address,
        utils.slipUniV2(amountIn),
        "cbridge"
      );

    const expectedSendAmt = utils.slipUniV2(amountIn);
    const srcXferId = keccak256(
      ['address', 'address', 'address', 'uint256', 'uint64', 'uint64', 'uint64'],
      [c.bridgeAdapter.address, c.receiver.address, c.tokenB.address, expectedSendAmt, desc.dstChainId, desc.nonce, c.chainId]
    );
    await expect(tx)
      .to.emit(c.bridge, 'Send')
      .withArgs(
        srcXferId,
        c.bridgeAdapter.address,
        c.receiver.address,
        c.tokenB.address,
        expectedSendAmt,
        desc.dstChainId,
        desc.nonce,
        maxSlippage
      );
  });
  it('should swap and transfer with Curve Pool (has dst swap)', async function () {
    const amountIn = parseUnits('100');
    const maxSlippage = 1000000;
    const srcSwaps = utils.buildCurveSwaps(c, amountIn);
    const feeSig = await utils.signFee(c);
    const desc = await utils.buildTransferDesc(c, feeSig, { maxSlippage:maxSlippage, dstTransferSwapper: c.receiver.address });

    await c.tokenA.connect(c.sender).approve(c.xswap.address, amountIn);
    const tx = await c.xswap
      .connect(c.sender)
      .transferWithSwap(desc, srcSwaps, srcSwaps, { value: 1000 });
    const expectId = utils.computeId(c.sender.address, c.receiver.address, c.chainId, desc.nonce);
    const expectedSendAmt = utils.slipCurve(amountIn);
    const expectXferId = utils.computeTransferId(c, { amount: expectedSendAmt });
    await expect(tx)
      .to.emit(c.xswap, 'RequestSent')
      .withArgs(
        expectId,
        expectXferId,
        desc.dstChainId,
        amountIn,
        c.tokenA.address,
        c.tokenB.address,
        c.receiver.address,
        c.tokenB.address,
        utils.slipCurve(amountIn),
        "cbridge"
      );

    const srcXferId = keccak256(
      ['address', 'address', 'address', 'uint256', 'uint64', 'uint64', 'uint64'],
      [c.bridgeAdapter.address, c.receiver.address, c.tokenB.address, expectedSendAmt, desc.dstChainId, desc.nonce, c.chainId]
    );
    await expect(tx)
      .to.emit(c.bridge, 'Send')
      .withArgs(
        srcXferId,
        c.bridgeAdapter.address,
        c.receiver.address,
        c.tokenB.address,
        expectedSendAmt,
        desc.dstChainId,
        desc.nonce,
        maxSlippage
      );
  });
  it('should directly swap', async function () {
    const amountIn = parseUnits('100');
    const srcSwaps = utils.buildUniV2Swaps(c, amountIn);
    const feeSig = await utils.signFee(c);
    const desc = await utils.buildTransferDesc(c, feeSig, { dstChainId: c.chainId, dstTransferSwapper: c.receiver.address });
    await c.tokenA.connect(c.sender).approve(c.xswap.address, amountIn);
    const tx = await c.xswap.connect(c.sender).transferWithSwap(desc, srcSwaps, []);
    const expectId = utils.computeId(c.sender.address, c.receiver.address, c.chainId, desc.nonce);
    const expectAmountOut = utils.slipUniV2(amountIn);
    await expect(tx)
      .to.emit(c.xswap, 'DirectSwap')
      .withArgs(expectId, amountIn, c.tokenA.address, expectAmountOut, c.tokenB.address);
    await expect(tx).to.not.emit(c.bridge, 'Send');
  });
  it('should directly swap (native in)', async function () {
    const amountIn = parseUnits('1');
    const srcSwaps = utils.buildUniV2Swaps(c, amountIn, { tokenIn: c.weth.address });
    const feeSig = await utils.signFee(c, { amountIn, tokenIn: c.weth.address });
    const desc = await utils.buildTransferDesc(c, feeSig, {
      tokenIn: c.weth.address,
      dstChainId: c.chainId,
      nativeIn: true,
      dstTransferSwapper: c.receiver.address
    });

    const tx = await c.xswap
      .connect(c.sender)
      .transferWithSwap(desc, srcSwaps, [], { value: amountIn });
    const expectId = utils.computeId(c.sender.address, c.receiver.address, c.chainId, desc.nonce);
    const expectAmountOut = utils.slipUniV2(amountIn);
    await expect(tx)
      .to.emit(c.xswap, 'DirectSwap')
      .withArgs(expectId, amountIn, c.weth.address, expectAmountOut, c.tokenB.address);
    await expect(tx).to.not.emit(c.bridge, 'Send');
  });
});

describe('executeMessageWithTransfer', function () {
  beforeEach(async () => {
    await prepareContext();
  });
  it('should revert if all swaps fail', async function () {
    const amountIn = parseUnits('100');
    const swaps = utils.buildUniV2Swaps(c, amountIn, { amountOutMin: amountIn });
    const id = utils.computeId(c.sender.address, c.receiver.address, 1, 1);
    const fee = parseUnits('1');
    const msg = utils.encodeMessage(id, swaps, c.receiver.address, false, fee, true);

    await c.tokenA.transfer(c.xswap.address, amountIn);
    const tx = c.xswap.executeMessageWithTransfer(ZERO_ADDR, c.tokenA.address, amountIn, 0, msg, ZERO_ADDR);
    await expect(tx).to.be.revertedWith('all swaps failed');
  });
  it('should collect all amount in as fee if amount in <= fee', async function () {
    const amountIn = parseUnits('1');
    const id = utils.computeId(c.sender.address, c.receiver.address, 1, 1);
    const fee = parseUnits('10');
    const msg = utils.encodeMessage(id, [], c.receiver.address, false, fee);

    await c.tokenA.transfer(c.xswap.address, amountIn);
    const tx = await c.xswap.executeMessageWithTransfer(ZERO_ADDR, c.tokenA.address, amountIn, 0, msg, ZERO_ADDR);
    await expect(tx).to.emit(c.xswap, 'RequestDone').withArgs(id, 0, 0, c.tokenA.address, amountIn, 1, "0x");
  });
  it('should swap using bridge out amount', async function () {
    const bridgeOutAmount = parseUnits('100');
    const adulteratedAmountIn = parseUnits('123123');
    const id = utils.computeId(c.sender.address, c.receiver.address, 1, 1);
    const fee = parseUnits('1');
    const swaps = utils.buildUniV2Swaps(c, adulteratedAmountIn, {
      amountOutMin: utils.slipUniV2(bridgeOutAmount.sub(fee))
    });
    const msg = utils.encodeMessage(id, swaps, c.receiver.address, false, fee);

    await c.tokenA.transfer(c.xswap.address, bridgeOutAmount);
    const tx = await c.xswap.executeMessageWithTransfer(
      ZERO_ADDR,
      c.tokenA.address,
      bridgeOutAmount,
      0,
      msg,
      ZERO_ADDR
    );
    const expectAmountOut = utils.slipUniV2(bridgeOutAmount.sub(fee));
    await expect(tx).to.emit(c.xswap, 'RequestDone').withArgs(id, expectAmountOut, 0, c.tokenA.address, fee, 1, "0x");
  });
  it('should swap and send native', async function () {
    const amountIn = parseUnits('10');
    const id = utils.computeId(c.sender.address, c.receiver.address, 1, 1);
    const fee = parseUnits('0.1');
    const swaps = utils.buildUniV2Swaps(c, amountIn, {
      tokenOut: c.weth.address,
      amountOutMin: utils.slipUniV2(amountIn.sub(fee))
    });
    const msg = utils.encodeMessage(id, swaps, c.receiver.address, true, fee);

    await c.tokenA.transfer(c.xswap.address, amountIn);
    const balBefore = await c.receiver.getBalance();
    const tx = await c.xswap.executeMessageWithTransfer(ZERO_ADDR, c.tokenA.address, amountIn, 0, msg, ZERO_ADDR);
    const balAfter = await c.receiver.getBalance();
    const expectAmountOut = utils.slipUniV2(amountIn.sub(fee));
    await expect(tx).to.emit(c.xswap, 'RequestDone').withArgs(id, expectAmountOut, 0, c.tokenA.address, fee, 1, "0x");
    await expect(balAfter.sub(balBefore)).to.equal(expectAmountOut);
  });
  it('should send bridge token to receiver if no swaps', async function () {
    const amountIn = parseUnits('100');
    const id = utils.computeId(c.sender.address, c.receiver.address, 1, 1);
    const fee = parseUnits('1');
    const msg = utils.encodeMessage(id, [], c.receiver.address, false, fee);

    await c.tokenA.transfer(c.xswap.address, amountIn);
    const tx = await c.xswap.executeMessageWithTransfer(ZERO_ADDR, c.tokenA.address, amountIn, 0, msg, ZERO_ADDR);
    const expectAmountOut = amountIn.sub(fee);
    await expect(tx).to.emit(c.xswap, 'RequestDone').withArgs(id, expectAmountOut, 0, c.tokenA.address, fee, 1, "0x");
  });
  it('should unwrap and send native token', async function () {
    const amountIn = parseUnits('1');
    const id = utils.computeId(c.sender.address, c.receiver.address, 1, 1);
    const fee = parseUnits('0.1');
    const msg = utils.encodeMessage(id, [], c.receiver.address, true, fee);

    const balBefore = await c.receiver.getBalance();
    await c.admin.sendTransaction({ value: amountIn, to: c.xswap.address });
    const tx = await c.xswap.executeMessageWithTransfer(ZERO_ADDR, c.weth.address, amountIn, 0, msg, ZERO_ADDR);
    const expectAmountOut = amountIn.sub(fee);
    await expect(tx).to.emit(c.xswap, 'RequestDone').withArgs(id, expectAmountOut, 0, c.weth.address, fee, 1, "0x");
    const balAfter = await c.receiver.getBalance();
    await expect(balAfter.sub(balBefore)).equal(amountIn.sub(fee));
  });
  it('should send wrapped native token', async function () {
    const amountIn = parseUnits('1');
    const id = utils.computeId(c.sender.address, c.receiver.address, 1, 1);
    const fee = parseUnits('0.1');
    const msg = utils.encodeMessage(id, [], c.receiver.address, false, fee);

    const balBefore = await c.weth.balanceOf(c.receiver.address);
    await c.admin.sendTransaction({ value: amountIn, to: c.xswap.address });
    const tx = await c.xswap.executeMessageWithTransfer(ZERO_ADDR, c.weth.address, amountIn, 0, msg, ZERO_ADDR);
    const expectAmountOut = amountIn.sub(fee);
    await expect(tx).to.emit(c.xswap, 'RequestDone').withArgs(id, expectAmountOut, 0, c.weth.address, fee, 1, "0x");
    const balAfter = await c.weth.balanceOf(c.receiver.address);
    await expect(balAfter.sub(balBefore)).equal(amountIn.sub(fee));
  });
});

describe('executeMessageWithTransfer multi route', function () {
  beforeEach(async () => {
    await prepareContext();
  });
  it('should revert if all swaps fail', async function () {
    const amountIn = parseUnits('100');
    const failSwap = utils.buildUniV2Swaps(c, amountIn.div(2), { amountOutMin: amountIn }); // amt min too large
    const failSwap2 = utils.buildCurveSwaps(c, amountIn.div(2), { amountOutMin: amountIn });
    const swaps = [...failSwap, ...failSwap2];
    const id = utils.computeId(c.sender.address, c.receiver.address, 1, 1);
    const fee = parseUnits('1');
    const msg = utils.encodeMessage(id, swaps, c.receiver.address, false, fee, true);

    await c.tokenA.transfer(c.xswap.address, amountIn);
    const tx = c.xswap.executeMessageWithTransfer(ZERO_ADDR, c.tokenA.address, amountIn, 0, msg, ZERO_ADDR);
    await expect(tx).to.be.revertedWith('all swaps failed');
  });
  it('should revert if partial fill is off and some swaps fail', async function () {
    const amountIn = parseUnits('100');
    const successSwap = utils.buildUniV2Swaps(c, amountIn.div(2), { amountOutMin: ZERO_AMOUNT });
    const failSwap = utils.buildCurveSwaps(c, amountIn.div(2), { amountOutMin: amountIn }); // amt min too large
    const swaps = [...successSwap, ...failSwap];
    const id = utils.computeId(c.sender.address, c.receiver.address, 1, 1);
    const fee = parseUnits('1');
    const msg = utils.encodeMessage(id, swaps, c.receiver.address, false, fee, false);

    await c.tokenA.transfer(c.xswap.address, amountIn);
    const tx = c.xswap.executeMessageWithTransfer(ZERO_ADDR, c.tokenA.address, amountIn, 0, msg, ZERO_ADDR);
    await expect(tx).to.be.revertedWith('swap failed');
  });
  it('should partially fill', async function () {
    const amountIn = parseUnits('100');
    const successSwap = utils.buildUniV2Swaps(c, amountIn.div(2), { amountOutMin: ZERO_AMOUNT });
    const failSwap = utils.buildCurveSwaps(c, amountIn.div(2), { amountOutMin: amountIn }); // amt min too large
    const swaps = [...successSwap, ...failSwap];
    const id = utils.computeId(c.sender.address, c.receiver.address, 1, 1);
    const fee = parseUnits('1');
    const msg = utils.encodeMessage(id, swaps, c.receiver.address, false, fee, true);

    await c.tokenA.transfer(c.xswap.address, amountIn);
    const tx = c.xswap.executeMessageWithTransfer(ZERO_ADDR, c.tokenA.address, amountIn, 0, msg, ZERO_ADDR);
    const expectAmountOut = utils.slipUniV2(amountIn.sub(fee).div(2));
    const expectRefundAmt = amountIn.sub(fee).div(2);
    await expect(tx)
      .to.emit(c.xswap, 'RequestDone')
      .withArgs(id, expectAmountOut, expectRefundAmt, c.tokenA.address, fee, 1, "0x");
  });
  it('should execute all swaps', async function () {
    const amountIn = parseUnits('100');
    const swap = utils.buildUniV2Swaps(c, amountIn.div(2), { amountOutMin: ZERO_AMOUNT });
    const swap2 = utils.buildCurveSwaps(c, amountIn.div(2), { amountOutMin: ZERO_AMOUNT }); // amt min too large
    const swaps = [...swap, ...swap2];
    const id = utils.computeId(c.sender.address, c.receiver.address, 1, 1);
    const fee = parseUnits('1');
    const msg = utils.encodeMessage(id, swaps, c.receiver.address, false, fee, true);

    await c.tokenA.transfer(c.xswap.address, amountIn);
    const tx = c.xswap.executeMessageWithTransfer(ZERO_ADDR, c.tokenA.address, amountIn, 0, msg, ZERO_ADDR);
    const expectAmountOut = utils.slipUniV2(amountIn.sub(fee).div(2));
    const expectAmountOut2 = utils.slipCurve(amountIn.sub(fee).div(2));
    await expect(tx)
      .to.emit(c.xswap, 'RequestDone')
      .withArgs(id, expectAmountOut.add(expectAmountOut2), 0, c.tokenA.address, fee, 1, "0x");
  });
});

describe('executeMessageWithTransferFallback', function () {
  beforeEach(async () => {
    await prepareContext();
  });
  it('should send bridge out tokens to user', async function () {
    const amountIn = parseUnits('100');
    const swaps = utils.buildUniV2Swaps(c, amountIn, { amountOutMin: amountIn }); // doesn't matter
    const id = utils.computeId(c.sender.address, c.receiver.address, 1, 1);
    const fee = parseUnits('1');
    const msg = utils.encodeMessage(id, swaps, c.receiver.address, false, fee);

    await c.tokenA.transfer(c.xswap.address, amountIn);
    const tx = c.xswap.executeMessageWithTransferFallback(ZERO_ADDR, c.tokenA.address, amountIn, 0, msg, ZERO_ADDR);
    const expectRefundAmt = amountIn.sub(fee);
    await expect(tx).to.emit(c.xswap, 'RequestDone').withArgs(id, 0, expectRefundAmt, c.tokenA.address, fee, 2, "0x"); // 2 fallback
  });
});

describe('fee', function () {
  beforeEach(async () => {
    await prepareContext();
  });
  it('should collect fee', async function () {
    const amountIn = parseUnits('100');
    const id = utils.computeId(c.sender.address, c.receiver.address, 1, 1);
    const fee = parseUnits('1');
    const msg = utils.encodeMessage(id, [], c.receiver.address, false, fee);

    await c.tokenA.transfer(c.xswap.address, amountIn);
    const tx = await c.xswap.executeMessageWithTransfer(ZERO_ADDR, c.tokenA.address, amountIn, 0, msg, ZERO_ADDR);
    const expectAmountOut = amountIn.sub(fee);
    await expect(tx).to.emit(c.xswap, 'RequestDone').withArgs(id, expectAmountOut, 0, c.tokenA.address, fee, 1, "0x");

    const balBefore = await c.tokenA.balanceOf(c.feeCollector.address);
    await c.xswap.connect(c.feeCollector).collectFee([c.tokenA.address], c.feeCollector.address);
    const balAfter = await c.tokenA.balanceOf(c.feeCollector.address);
    await expect(balAfter.sub(balBefore)).to.equal(fee);
  });
  it('should collect fee (native)', async function () {
    const amountIn = parseUnits('1');
    const id = utils.computeId(c.sender.address, c.receiver.address, 1, 1);
    const fee = parseUnits('0.1');
    const msg = utils.encodeMessage(id, [], c.receiver.address, false, fee);

    const balBefore = await c.feeCollector.getBalance();
    await c.admin.sendTransaction({ value: amountIn, to: c.xswap.address });
    await c.xswap.executeMessageWithTransfer(ZERO_ADDR, c.weth.address, amountIn, 0, msg, ZERO_ADDR);
    await c.xswap.connect(c.feeCollector).collectFee([ZERO_ADDR], c.feeCollector.address);
    const balAfter = await c.feeCollector.getBalance();
    await expect(balAfter.gt(balBefore));
  });
});
