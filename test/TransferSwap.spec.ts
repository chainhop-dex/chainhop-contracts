import { keccak256 } from '@ethersproject/solidity';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import { loadFixture } from './lib/common';
import { ZERO_ADDR, ZERO_AMOUNT } from './lib/constants';
import { chainhopFixture, TestContext } from './lib/fixtures';
import * as utils from './lib/utils';

let c: TestContext;

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
    const desc = await utils.buildTransferDesc(c, '0x');

    await expect(c.xswap.connect(c.sender).transferWithSwap(c.xswap.address, desc, [], [])).to.be.revertedWith('nop');
    desc.dstChainId = c.chainId + 1;
    desc.amountIn = parseUnits('0');
    await expect(c.xswap.connect(c.sender).transferWithSwap(c.xswap.address, desc, [], [])).to.be.revertedWith('nop');
  });
  it('should revert if invalid fee sig', async function () {
    const amountIn = parseUnits('100');
    const srcSwaps = utils.buildUniV2Swaps(c, amountIn);
    const invalidSig = await utils.signFee(c, { fee: parseUnits('123123123123') });
    const desc = await utils.buildTransferDesc(c, invalidSig);

    await c.tokenA.connect(c.sender).approve(c.xswap.address, amountIn);
    const tx = c.xswap.connect(c.sender).transferWithSwap(c.receiver.address, desc, srcSwaps, []);
    await expect(tx).to.be.revertedWith('invalid signer');
  });
  it('should revert if fee deadline has passed', async function () {
    const amountIn = parseUnits('100');
    const srcSwaps = utils.buildUniV2Swaps(c, amountIn);
    const feeDeadline = BigNumber.from(Math.floor(Date.now() / 1000 - 300));
    const feeSig = await utils.signFee(c, { feeDeadline });
    const desc = await utils.buildTransferDesc(c, feeSig, { feeDeadline });

    await c.tokenA.connect(c.sender).approve(c.xswap.address, amountIn);
    const tx = c.xswap.connect(c.sender).transferWithSwap(c.receiver.address, desc, srcSwaps, []);
    await expect(tx).to.be.revertedWith('deadline exceeded');
  });
  it('should revert if native in but not enough value', async function () {
    const amountIn = parseUnits('100');
    const srcSwaps = utils.buildUniV2Swaps(c, amountIn, { tokenIn: c.weth.address });
    const feeSig = await utils.signFee(c);
    const desc = await utils.buildTransferDesc(c, feeSig, { tokenIn: c.weth.address });
    const tx = c.xswap
      .connect(c.sender)
      .transferWithSwap(c.receiver.address, desc, srcSwaps, [], { value: amountIn.sub(parseUnits('95')) });
    await expect(tx).to.be.revertedWith('insfcnt amt');
  });
  it('should directly transfer', async function () {
    const amountIn = parseUnits('100');
    const dstSwaps = utils.buildUniV2Swaps(c, amountIn);
    const feeSig = await utils.signFee(c);
    const desc = await utils.buildTransferDesc(c, feeSig, { amountIn, tokenIn: c.tokenA.address });

    await c.tokenA.connect(c.sender).approve(c.xswap.address, amountIn);
    const tx = await c.xswap.connect(c.sender).transferWithSwap(c.receiver.address, desc, [], dstSwaps);
    const expectId = utils.computeId(c.sender.address, c.receiver.address, c.chainId, desc.nonce);

    await expect(tx)
      .to.emit(c.xswap, 'RequestSent')
      .withArgs(expectId, desc.dstChainId, amountIn, c.tokenA.address, c.tokenB.address);

    const srcXferId = keccak256(
      ['address', 'address', 'address', 'uint256', 'uint64', 'uint64', 'uint64'],
      [c.xswap.address, c.receiver.address, c.tokenA.address, amountIn, desc.dstChainId, desc.nonce, c.chainId]
    );
    await expect(tx)
      .to.emit(c.bridge, 'Send')
      .withArgs(
        srcXferId,
        c.xswap.address,
        c.receiver.address,
        c.tokenA.address,
        amountIn,
        desc.dstChainId,
        desc.nonce,
        desc.maxBridgeSlippage
      );
  });
  it('should swap and transfer', async function () {
    const amountIn = parseUnits('100');
    const srcSwaps = utils.buildUniV2Swaps(c, amountIn);
    const feeSig = await utils.signFee(c);
    const desc = await utils.buildTransferDesc(c, feeSig);

    await c.tokenA.connect(c.sender).approve(c.xswap.address, amountIn);
    const tx = await c.xswap.connect(c.sender).transferWithSwap(c.receiver.address, desc, srcSwaps, []);
    const expectId = utils.computeId(c.sender.address, c.receiver.address, c.chainId, desc.nonce);

    await expect(tx)
      .to.emit(c.xswap, 'RequestSent')
      .withArgs(expectId, desc.dstChainId, amountIn, c.tokenA.address, c.tokenB.address);

    const expectedSendAmt = utils.slip(amountIn, 5);
    const srcXferId = keccak256(
      ['address', 'address', 'address', 'uint256', 'uint64', 'uint64', 'uint64'],
      [c.xswap.address, c.receiver.address, c.tokenB.address, expectedSendAmt, desc.dstChainId, desc.nonce, c.chainId]
    );
    await expect(tx)
      .to.emit(c.bridge, 'Send')
      .withArgs(
        srcXferId,
        c.xswap.address,
        c.receiver.address,
        c.tokenB.address,
        expectedSendAmt,
        desc.dstChainId,
        desc.nonce,
        desc.maxBridgeSlippage
      );
  });
  it('should directly swap', async function () {
    const amountIn = parseUnits('100');
    const srcSwaps = utils.buildUniV2Swaps(c, amountIn);
    const feeSig = await utils.signFee(c);
    const desc = await utils.buildTransferDesc(c, feeSig, { dstChainId: c.chainId });
    await c.tokenA.connect(c.sender).approve(c.xswap.address, amountIn);
    const tx = await c.xswap.connect(c.sender).transferWithSwap(c.receiver.address, desc, srcSwaps, []);
    const expectId = utils.computeId(c.sender.address, c.receiver.address, c.chainId, desc.nonce);
    const expectAmountOut = utils.slip(amountIn, 5);
    await expect(tx)
      .to.emit(c.xswap, 'DirectSwap')
      .withArgs(expectId, amountIn, c.tokenA.address, expectAmountOut, c.tokenB.address);
    await expect(tx).to.not.emit(c.bridge, 'Send');
  });
  it('should directly swap (native in)', async function () {
    const amountIn = parseUnits('1');
    const srcSwaps = utils.buildUniV2Swaps(c, amountIn, { tokenIn: c.weth.address });
    const feeSig = await utils.signFee(c, { amountIn, tokenIn: c.weth.address });
    const desc = await utils.buildTransferDesc(c, feeSig, { tokenIn: c.weth.address, dstChainId: c.chainId });

    const tx = await c.xswap
      .connect(c.sender)
      .transferWithSwap(c.receiver.address, desc, srcSwaps, [], { value: amountIn });
    const expectId = utils.computeId(c.sender.address, c.receiver.address, c.chainId, desc.nonce);
    const expectAmountOut = utils.slip(amountIn, 5);
    await expect(tx)
      .to.emit(c.xswap, 'DirectSwap')
      .withArgs(expectId, amountIn, c.weth.address, expectAmountOut, c.tokenB.address);
    await expect(tx).to.not.emit(c.bridge, 'Send');
  });
});

describe('executeMessageWithTransfer', function () {
  beforeEach(async () => {
    await prepareContext();
    // impersonate MessageBus as admin to gain access to calling executeMessageWithTransfer
    await c.xswap.connect(c.admin).setMessageBus(c.admin.address);
  });
  it('should revert if all swaps fail', async function () {
    const amountIn = parseUnits('100');
    const swaps = utils.buildUniV2Swaps(c, amountIn, { amountOutMin: amountIn });
    const id = utils.computeId(c.sender.address, c.receiver.address, 1, 1);
    const fee = parseUnits('1');
    const msg = utils.encodeMessage(id, swaps, c.receiver.address, false, fee, true);

    await c.tokenA.transfer(c.xswap.address, amountIn);
    const tx = c.xswap.executeMessageWithTransfer(ZERO_ADDR, c.tokenA.address, amountIn, 0, msg);
    await expect(tx).to.be.revertedWith('all swaps failed');
  });
  it('should collect all amount in as fee if amount in <= fee', async function () {
    const amountIn = parseUnits('1');
    const id = utils.computeId(c.sender.address, c.receiver.address, 1, 1);
    const fee = parseUnits('10');
    const msg = utils.encodeMessage(id, [], c.receiver.address, false, fee);

    await c.tokenA.transfer(c.xswap.address, amountIn);
    const tx = await c.xswap.executeMessageWithTransfer(ZERO_ADDR, c.tokenA.address, amountIn, 0, msg);
    await expect(tx).to.emit(c.xswap, 'RequestDone').withArgs(id, 0, 0, amountIn, 1);
  });
  it('should swap using bridge out amount', async function () {
    const bridgeOutAmount = parseUnits('100');
    const adulteratedAmountIn = parseUnits('123123');
    const id = utils.computeId(c.sender.address, c.receiver.address, 1, 1);
    const fee = parseUnits('1');
    const swaps = utils.buildUniV2Swaps(c, adulteratedAmountIn, {
      amountOutMin: utils.slip(bridgeOutAmount.sub(fee), 5)
    });
    const msg = utils.encodeMessage(id, swaps, c.receiver.address, false, fee);

    await c.tokenA.transfer(c.xswap.address, bridgeOutAmount);
    const tx = await c.xswap.executeMessageWithTransfer(ZERO_ADDR, c.tokenA.address, bridgeOutAmount, 0, msg);
    const expectAmountOut = utils.slip(bridgeOutAmount.sub(fee), 5);
    await expect(tx).to.emit(c.xswap, 'RequestDone').withArgs(id, expectAmountOut, 0, fee, 1);
  });
  it('should swap and send native', async function () {
    const amountIn = parseUnits('10');
    const id = utils.computeId(c.sender.address, c.receiver.address, 1, 1);
    const fee = parseUnits('0.1');
    const swaps = utils.buildUniV2Swaps(c, amountIn, {
      tokenOut: c.weth.address,
      amountOutMin: utils.slip(amountIn.sub(fee), 5)
    });
    const msg = utils.encodeMessage(id, swaps, c.receiver.address, true, fee);

    await c.tokenA.transfer(c.xswap.address, amountIn);
    const balBefore = await c.receiver.getBalance();
    const tx = await c.xswap.executeMessageWithTransfer(ZERO_ADDR, c.tokenA.address, amountIn, 0, msg);
    const balAfter = await c.receiver.getBalance();
    const expectAmountOut = utils.slip(amountIn.sub(fee), 5);
    await expect(tx).to.emit(c.xswap, 'RequestDone').withArgs(id, expectAmountOut, 0, fee, 1);
    await expect(balAfter.sub(balBefore)).to.equal(expectAmountOut);
  });
  it('should send bridge token to receiver if no swaps', async function () {
    const amountIn = parseUnits('100');
    const id = utils.computeId(c.sender.address, c.receiver.address, 1, 1);
    const fee = parseUnits('1');
    const msg = utils.encodeMessage(id, [], c.receiver.address, false, fee);

    await c.tokenA.transfer(c.xswap.address, amountIn);
    const tx = await c.xswap.executeMessageWithTransfer(ZERO_ADDR, c.tokenA.address, amountIn, 0, msg);
    const expectAmountOut = amountIn.sub(fee);
    await expect(tx).to.emit(c.xswap, 'RequestDone').withArgs(id, expectAmountOut, 0, fee, 1);
  });
});

describe('executeMessageWithTransfer multi route', function () {
  beforeEach(async () => {
    await prepareContext();
    // impersonate MessageBus as admin to gain access to calling executeMessageWithTransfer
    await c.xswap.connect(c.admin).setMessageBus(c.admin.address);
  });
  it('should revert if all swaps fail', async function () {
    const amountIn = parseUnits('100');
    const failSwap = utils.buildUniV2Swaps(c, amountIn.div(2), { amountOutMin: amountIn }); // amt min too large
    const swaps = [...failSwap, ...failSwap];
    const id = utils.computeId(c.sender.address, c.receiver.address, 1, 1);
    const fee = parseUnits('1');
    const msg = utils.encodeMessage(id, swaps, c.receiver.address, false, fee, true);

    await c.tokenA.transfer(c.xswap.address, amountIn);
    const tx = c.xswap.executeMessageWithTransfer(ZERO_ADDR, c.tokenA.address, amountIn, 0, msg);
    await expect(tx).to.be.revertedWith('all swaps failed');
  });
  it('should revert if partial fill is off and some swaps fail', async function () {
    const amountIn = parseUnits('100');
    const successSwap = utils.buildUniV2Swaps(c, amountIn.div(2), { amountOutMin: ZERO_AMOUNT });
    const failSwap = utils.buildUniV2Swaps(c, amountIn.div(2), { amountOutMin: amountIn }); // amt min too large
    const swaps = [...successSwap, ...failSwap];
    const id = utils.computeId(c.sender.address, c.receiver.address, 1, 1);
    const fee = parseUnits('1');
    const msg = utils.encodeMessage(id, swaps, c.receiver.address, false, fee, false);

    await c.tokenA.transfer(c.xswap.address, amountIn);
    const tx = c.xswap.executeMessageWithTransfer(ZERO_ADDR, c.tokenA.address, amountIn, 0, msg);
    await expect(tx).to.be.revertedWith('swap failed');
  });
  it('should partially fill', async function () {
    const amountIn = parseUnits('100');
    const successSwap = utils.buildUniV2Swaps(c, amountIn.div(2), { amountOutMin: ZERO_AMOUNT });
    const failSwap = utils.buildUniV2Swaps(c, amountIn.div(2), { amountOutMin: amountIn }); // amt min too large
    const swaps = [...successSwap, ...failSwap];
    const id = utils.computeId(c.sender.address, c.receiver.address, 1, 1);
    const fee = parseUnits('1');
    const msg = utils.encodeMessage(id, swaps, c.receiver.address, false, fee, true);

    await c.tokenA.transfer(c.xswap.address, amountIn);
    const tx = c.xswap.executeMessageWithTransfer(ZERO_ADDR, c.tokenA.address, amountIn, 0, msg);
    const expectAmountOut = utils.slip(amountIn.sub(fee).div(2), 5);
    const expectRefundAmt = amountIn.sub(fee).div(2);
    await expect(tx).to.emit(c.xswap, 'RequestDone').withArgs(id, expectAmountOut, expectRefundAmt, fee, 1);
  });
});

describe('executeMessageWithTransferFallback', function () {
  beforeEach(async () => {
    await prepareContext();
    // impersonate MessageBus as admin to gain access to calling executeMessageWithTransfer
    await c.xswap.connect(c.admin).setMessageBus(c.admin.address);
  });
  it('should send bridge out tokens to user', async function () {
    const amountIn = parseUnits('100');
    const swaps = utils.buildUniV2Swaps(c, amountIn, { amountOutMin: amountIn }); // doesn't matter
    const id = utils.computeId(c.sender.address, c.receiver.address, 1, 1);
    const fee = parseUnits('1');
    const msg = utils.encodeMessage(id, swaps, c.receiver.address, false, fee);

    await c.tokenA.transfer(c.xswap.address, amountIn);
    const tx = c.xswap.executeMessageWithTransferFallback(ZERO_ADDR, c.tokenA.address, amountIn, 0, msg);
    const expectRefundAmt = amountIn.sub(fee);
    await expect(tx).to.emit(c.xswap, 'RequestDone').withArgs(id, 0, expectRefundAmt, fee, 2); // 2 fallback
  });
});
