import { expect } from 'chai';
import { loadFixture } from './lib/deploy';
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

describe('execute()', () => {
  beforeEach(prepareContext);

  // it('should revert if invalid fee sig', async function () {
  //   const amountIn = utils.defaultAmountIn;
  //   const dstSwap = utils.buildUniV2Swap(c, amountIn);
  //   const id = utils.computeId(c.chainId + 1, c.receiver.address);
  //   const execs = [
  //     utils.newExecutionInfo({
  //       chainId: c.chainId,
  //       bridge: utils.newBridgeInfo({
  //         toChainId: c.chainId + 1,
  //         bridgeProvider: 'cbridge',
  //         bridgeParams: utils.encodeBridgeParams()
  //       }),
  //       remoteExecutionNode: c.receiver.address
  //     }),
  //     utils.newExecutionInfo({ chainId: c.chainId + 1, swap: dstSwap, bridgeOutToken: c.tokenB.address })
  //   ];
  //   const src = utils.newSourceInfo({ chainId: c.chainId, tokenIn: c.tokenA.address });
  //   const dst = utils.newDestinationInfo({ chainId: c.chainId + 1, receiver: c.receiver.address });
  //   const data = utils.encodeSignData(execs, src, dst);
  //   const sig = await c.signer.signMessage(data);
  //   src.quoteSig = sig;
  //   execs[1].chainId = BigNumber.from(execs[1].chainId).add(1); // chainId will not match what's encoded in sig
  //   await c.tokenA.connect(c.sender).approve(c.enode.address, amountIn);
  //   const tx = c.enode.connect(c.sender).execute(id, execs, src, dst, { value: 10000 });
  //   await expect(tx).to.revertedWith('invalid signer');
  // });

  // it('should revert if fee deadline has passed', async function () {
  //   const amountIn = utils.defaultAmountIn;
  //   const dstSwap = utils.buildUniV2Swap(c, amountIn);
  //   const id = utils.computeId(c.chainId + 1, c.receiver.address);
  //   const execs = [
  //     utils.newExecutionInfo({
  //       chainId: c.chainId,
  //       bridge: utils.newBridgeInfo({ toChainId: c.chainId + 1, bridgeProvider: 'cbridge' }),
  //       remoteExecutionNode: c.receiver.address
  //     }),
  //     utils.newExecutionInfo({ chainId: c.chainId + 1, swap: dstSwap, bridgeOutToken: c.tokenB.address })
  //   ];
  //   const src = utils.newSourceInfo({
  //     chainId: c.chainId,
  //     tokenIn: c.tokenA.address,
  //     deadline: BigNumber.from(Math.floor(Date.now() / 1000 - 300))
  //   });
  //   const dst = utils.newDestinationInfo({ chainId: c.chainId + 1, receiver: c.receiver.address });
  //   const data = utils.encodeSignData(execs, src, dst);
  //   const sig = await c.signer.signMessage(data);
  //   src.quoteSig = sig;
  //   execs[1].chainId; // chainId will not match what's encoded in sig
  //   await c.tokenA.connect(c.sender).approve(c.enode.address, amountIn);
  //   const tx = c.enode.connect(c.sender).execute(id, execs, src, dst);
  //   await expect(tx).to.be.revertedWith('deadline exceeded');
  // });

  // it('should revert if native in but not enough value', async function () {
  //   const amountIn = utils.defaultAmountIn;
  //   const srcSwap = utils.buildUniV2Swap(c, amountIn, { tokenIn: c.weth.address });
  //   const id = utils.computeId(c.chainId + 1, c.receiver.address);
  //   const execs = [
  //     utils.newExecutionInfo({
  //       chainId: c.chainId,
  //       swap: srcSwap,
  //       bridge: utils.newBridgeInfo({ toChainId: c.chainId + 1, bridgeProvider: 'cbridge' }),
  //       remoteExecutionNode: c.receiver.address
  //     })
  //   ];
  //   const src = utils.newSourceInfo({ chainId: c.chainId, tokenIn: c.weth.address, nativeIn: true });
  //   const dst = utils.newDestinationInfo({ chainId: c.chainId, receiver: c.receiver.address });
  //   const data = utils.encodeSignData(execs, src, dst);
  //   const sig = await c.signer.signMessage(data);
  //   src.quoteSig = sig;
  //   await c.tokenA.connect(c.sender).approve(c.enode.address, amountIn);
  //   const tx = c.enode.connect(c.sender).execute(id, execs, src, dst, { value: amountIn.sub(parseUnits('95')) });
  //   await expect(tx).to.be.revertedWith('insufficient native amount');
  // });

  // it('should revert if swap fails on src chain', async function () {
  //   const amountIn = utils.defaultAmountIn;
  //   const srcSwap = utils.buildUniV2Swap(c, amountIn, { tokenIn: c.tokenA.address, amountOutMin: amountIn });
  //   const id = utils.computeId(c.chainId + 1, c.receiver.address);
  //   const execs = [
  //     utils.newExecutionInfo({
  //       chainId: c.chainId,
  //       swap: srcSwap,
  //       bridge: utils.newBridgeInfo({ toChainId: c.chainId + 1, bridgeProvider: 'cbridge' }),
  //       remoteExecutionNode: c.receiver.address
  //     })
  //   ];
  //   const src = utils.newSourceInfo({ chainId: c.chainId, tokenIn: c.tokenA.address });
  //   const dst = utils.newDestinationInfo({ chainId: c.chainId, receiver: c.receiver.address });
  //   const data = utils.encodeSignData(execs, src, dst);
  //   const sig = await c.signer.signMessage(data);
  //   src.quoteSig = sig;
  //   await c.tokenA.connect(c.sender).approve(c.enode.address, amountIn);
  //   const tx = c.enode.connect(c.sender).execute(id, execs, src, dst);
  //   await expect(tx).to.be.revertedWith('swap fail');
  // });

  // it('should bridge -> swap', async function () {
  //   const amountIn = utils.defaultAmountIn;
  //   const dstSwap = utils.buildUniV2Swap(c, amountIn);
  //   const id = utils.computeId(c.chainId + 1, c.receiver.address);
  //   const execs = [
  //     utils.newExecutionInfo({
  //       chainId: c.chainId,
  //       bridge: utils.newBridgeInfo({
  //         toChainId: c.chainId + 1,
  //         bridgeProvider: 'cbridge',
  //         bridgeParams: utils.encodeBridgeParams()
  //       }),
  //       remoteExecutionNode: c.receiver.address
  //     }),
  //     utils.newExecutionInfo({ chainId: c.chainId + 1, swap: dstSwap, bridgeOutToken: c.tokenB.address })
  //   ];
  //   const src = utils.newSourceInfo({ chainId: c.chainId, tokenIn: c.tokenA.address });
  //   const dst = utils.newDestinationInfo({ chainId: c.chainId + 1, receiver: c.receiver.address });
  //   const data = utils.encodeSignData(execs, src, dst);
  //   const sig = await c.signer.signMessage(data);
  //   src.quoteSig = sig;
  //   await c.tokenA.connect(c.sender).approve(c.enode.address, amountIn);
  //   const tx = c.enode.connect(c.sender).execute(id, execs, src, dst, { value: 10000 });

  //   await expect(tx).to.emit(c.enode, 'StepExecuted').withArgs(id, amountIn, c.tokenA.address);
  //   const pocket = utils.getPocketAddr(id, c.receiver.address);
  //   const xferId = utils.computeTransferId(c, {
  //     token: c.tokenA.address,
  //     receiver: pocket
  //   });
  //   await expect(tx)
  //     .to.emit(c.bridge, 'Send')
  //     .withArgs(
  //       xferId,
  //       c.cbridgeAdapter.address,
  //       pocket,
  //       c.tokenA.address,
  //       amountIn,
  //       c.chainId + 1,
  //       utils.defaultNonce,
  //       utils.defaultMaxSlippage
  //     );
  // });

  it('should swap -> bridge', async function () {
    const amountIn = utils.defaultAmountIn;
    const srcSwap = utils.buildUniV2Swap(c, amountIn);
    const id = utils.computeId(c.chainId + 1, c.receiver.address);
    const execs = [
      utils.newExecutionInfo({
        chainId: c.chainId,
        swap: srcSwap,
        bridge: utils.newBridgeInfo({
          toChainId: c.chainId + 1,
          bridgeProvider: 'cbridge',
          bridgeParams: utils.encodeBridgeParams()
        })
      })
    ];
    const src = utils.newSourceInfo({ chainId: c.chainId, tokenIn: c.tokenA.address });
    const dst = utils.newDestinationInfo({ chainId: c.chainId + 1, receiver: c.receiver.address });
    const data = utils.encodeSignData(execs, src, dst);
    const sig = await c.signer.signMessage(data);
    src.quoteSig = sig;
    await c.tokenA.connect(c.sender).approve(c.enode.address, amountIn);
    const tx = c.enode.connect(c.sender).execute(id, execs, src, dst, { value: 10000 });

    const amountOut = utils.slipUniV2(amountIn);
    const xferId = utils.computeTransferId(c, {
      amount: amountOut,
      token: c.tokenB.address
    });
    await expect(tx).to.emit(c.enode, 'StepExecuted').withArgs(id, amountOut, c.tokenB.address);
    await expect(tx)
      .to.emit(c.bridge, 'Send')
      .withArgs(
        xferId,
        c.cbridgeAdapter.address,
        c.receiver.address,
        c.tokenB.address,
        amountOut,
        c.chainId + 1,
        utils.defaultNonce,
        utils.defaultMaxSlippage
      );
  });
  // it('should swap -> bridge -> swap', async function () {
  //   const amountIn = utils.defaultAmountIn;
  //   const srcSwap = utils.buildUniV2Swap(c, amountIn);
  //   const srcAmountOut = utils.slipUniV2(amountIn);
  //   const dstSwap = utils.buildUniV2Swap(c, srcAmountOut, { tokenIn: c.tokenB.address, tokenOut: c.tokenA.address });
  //   const quoteSig = await utils.signQuote(c);
  //   const desc = await utils.buildTransferDesc(c, quoteSig, {
  //     dstTokenOut: c.tokenA.address
  //   });

  //   await c.tokenA.connect(c.sender).approve(c.enode.address, amountIn);
  //   const tx = await c.enode.connect(c.sender).transferWithSwap(desc, srcSwap, dstSwap, { value: 1000 });
  //   const expectId = utils.computeId(c);
  //   const pocket = utils.getPocketAddr(expectId, c.receiver.address);
  //   const expectXferId = utils.computeTransferId(c, { amount: srcAmountOut, receiver: pocket, token: c.tokenB.address });

  //   await expect(tx).to.emit(c.enode, 'StepExecuted').withArgs(c.chainId, expectId, srcAmountOut, c.tokenB.address);
  //   await expect(tx)
  //     .to.emit(c.bridge, 'Send')
  //     .withArgs(
  //       expectXferId,
  //       c.cbridgeAdapter.address,
  //       pocket,
  //       c.tokenB.address,
  //       srcAmountOut,
  //       c.chainId + 1,
  //       utils.defaultNonce,
  //       utils.defaultMaxSlippage
  //     );
  // });
  // it('should revert if using wrapped bridge token but tokenOut from dex != canonical', async function () {
  //   const amountIn = utils.defaultAmountIn;
  //   const srcSwap = utils.buildUniV2Swap(c, amountIn);
  //   const quoteSig = await utils.signQuote(c);
  //   const desc = await utils.buildTransferDesc(c, quoteSig, {
  //     wrappedBridgeToken: c.wrappedBridgeToken.address
  //   });
  //   await c.tokenA.connect(c.sender).approve(c.enode.address, amountIn);
  //   const tx = c.enode.connect(c.sender).transferWithSwap(desc, srcSwap, srcSwap, { value: 1000 });
  //   await expect(tx).to.be.revertedWith('canonical != _token');
  // });
  // it('should revert if using wrapped bridge token but tokenIn != canonical', async function () {
  //   const amountIn = utils.defaultAmountIn;
  //   const quoteSig = await utils.signQuote(c, { tokenIn: c.tokenB.address });
  //   const desc = await utils.buildTransferDesc(c, quoteSig, {
  //     wrappedBridgeToken: c.wrappedBridgeToken.address,
  //     tokenIn: c.tokenB.address, // wrong token
  //     amountIn: amountIn
  //   });
  //   await c.tokenB.connect(c.sender).approve(c.enode.address, amountIn);
  //   const tx = c.enode.connect(c.sender).transferWithSwap(desc, utils.emptySwap, utils.emptySwap, { value: 1000 });
  //   await expect(tx).to.be.revertedWith('canonical != _token');
  // });
  // it('should bridge using wrapped bridge token', async function () {
  //   const amountIn = utils.defaultAmountIn;
  //   const maxSlippage = 1000000;
  //   const quoteSig = await utils.signQuote(c);
  //   const desc = await utils.buildTransferDesc(c, quoteSig, {
  //     amountIn: amountIn,
  //     tokenIn: c.tokenA.address,
  //     wrappedBridgeToken: c.wrappedBridgeToken.address, // wraps tokenA
  //     maxSlippage: maxSlippage,
  //     dstTransferSwapper: c.receiver.address
  //   });
  //   await c.tokenA.connect(c.sender).approve(c.enode.address, amountIn);
  //   const tx = await c.enode.connect(c.sender).transferWithSwap(desc, utils.emptySwap, utils.emptySwap, { value: 1000 });
  //   const expectId = utils.computeId(c);
  //   const expectXferId = utils.computeTransferId(c, {
  //     amount: amountIn,
  //     token: c.wrappedBridgeToken.address
  //   });
  //   await expect(tx).to.emit(c.enode, 'StepExecuted').withArgs(c.chainId, expectId, amountIn, c.tokenA.address);
  //   await expect(tx)
  //     .to.emit(c.bridge, 'Send')
  //     .withArgs(
  //       expectXferId,
  //       c.cbridgeAdapter.address,
  //       c.receiver.address,
  //       c.wrappedBridgeToken.address,
  //       amountIn,
  //       c.chainId + 1,
  //       utils.defaultNonce,
  //       utils.defaultMaxSlippage
  //     );
  // });
  // it('should swap -> bridge (native in)', async function () {
  //   const amountIn = parseUnits('1');
  //   const srcSwap = utils.buildUniV2Swap(c, amountIn, { tokenIn: c.weth.address });
  //   const quoteSig = await utils.signQuote(c, { tokenIn: c.weth.address, amountIn: amountIn });
  //   const desc = await utils.buildTransferDesc(c, quoteSig, {
  //     amountIn: amountIn,
  //     tokenIn: c.weth.address,
  //     nativeIn: true
  //   });
  //   const tx = await c.enode.connect(c.sender).transferWithSwap(desc, srcSwap, utils.emptySwap, { value: amountIn.add(1000) });
  //   const expectId = utils.computeId(c);
  //   const srcAmountOut = utils.slipUniV2(amountIn);
  //   const expectXferId = utils.computeTransferId(c, {
  //     amount: srcAmountOut,
  //     token: c.tokenB.address
  //   });
  //   await expect(tx).to.emit(c.enode, 'StepExecuted').withArgs(c.chainId, expectId, srcAmountOut, c.tokenB.address);
  //   await expect(tx)
  //     .to.emit(c.bridge, 'Send')
  //     .withArgs(
  //       expectXferId,
  //       c.cbridgeAdapter.address,
  //       c.receiver.address,
  //       c.tokenB.address,
  //       srcAmountOut,
  //       c.chainId + 1,
  //       utils.defaultNonce,
  //       utils.defaultMaxSlippage
  //     );
  // });
  // it('should directly swap', async function () {
  //   const amountIn = utils.defaultAmountIn;
  //   const srcSwap = utils.buildUniV2Swap(c, amountIn);
  //   const quoteSig = await utils.signQuote(c);
  //   const desc = await utils.buildTransferDesc(c, quoteSig, {
  //     dstChainId: c.chainId
  //   });
  //   await c.tokenA.connect(c.sender).approve(c.enode.address, amountIn);
  //   const tx = await c.enode.connect(c.sender).transferWithSwap(desc, srcSwap, utils.emptySwap);
  //   const expectId = utils.computeId(c, true);
  //   const amountOut = utils.slipUniV2(amountIn);
  //   await expect(tx).to.emit(c.enode, 'StepExecuted').withArgs(c.chainId, expectId, amountOut, c.tokenB.address);
  //   await expect(tx).to.not.emit(c.bridge, 'Send');
  // });
  // it('should directly swap (native in)', async function () {
  //   const amountIn = parseUnits('1');
  //   const srcSwap = utils.buildUniV2Swap(c, amountIn, { tokenIn: c.weth.address });
  //   const quoteSig = await utils.signQuote(c, { amountIn, tokenIn: c.weth.address });
  //   const desc = await utils.buildTransferDesc(c, quoteSig, {
  //     tokenIn: c.weth.address,
  //     dstChainId: c.chainId,
  //     nativeIn: true,
  //     amountIn: amountIn
  //   });
  //   const tx = await c.enode.connect(c.sender).transferWithSwap(desc, srcSwap, utils.emptySwap, { value: amountIn });
  //   const expectId = utils.computeId(c, true);
  //   const expectAmountOut = utils.slipUniV2(amountIn);
  //   await expect(tx).to.emit(c.enode, 'StepExecuted').withArgs(c.chainId, expectId, expectAmountOut, c.tokenB.address);
  //   await expect(tx).to.not.emit(c.bridge, 'Send');
  // });
});

// describe('executeMessage', function () {
//   beforeEach(async () => {
//     await prepareContext();
//   });
//   it('should revert if pocket does not have enough fund', async function () {
//     const amountIn = utils.defaultAmountIn;
//     const swap = utils.buildUniV2Swap(c, amountIn, { amountOutMin: amountIn });
//     const id = utils.computeId(c);
//     const pocket = utils.getPocketAddr(id, c.enode.address);
//     const msg = utils.encodeMessage(id, swap, c.receiver.address, false, {
//       bridgeOutToken: c.tokenA.address,
//       bridgeOutMin: amountIn.add(1) // bridge out min is greater than pocket balance, should revert
//     });
//     await c.tokenA.transfer(pocket, amountIn);
//     const tx = c.enode.executeMessage(ZERO_ADDR, 0, msg, ZERO_ADDR);
//     await expect(tx).to.be.revertedWith('MSGBUS::REVERT');
//   });
//   it('should refund if it receives fallback token', async function () {
//     const amountIn = utils.defaultAmountIn;
//     const swap = utils.buildUniV2Swap(c, amountIn);
//     const id = utils.computeId(c);
//     const pocket = utils.getPocketAddr(id, c.enode.address);
//     const refundAmount = amountIn.sub(utils.defaultFee);
//     const msg = utils.encodeMessage(id, swap, c.receiver.address, false, {
//       bridgeOutToken: c.tokenA.address,
//       bridgeOutFallbackToken: c.tokenB.address,
//       feeInBridgeOutFallbackToken: utils.defaultFee
//     });
//     await c.tokenB.transfer(pocket, amountIn);
//     const tx = c.enode.executeMessage(ZERO_ADDR, 0, msg, ZERO_ADDR);
//     await expect(tx).to.emit(c.enode, 'StepExecuted').withArgs(c.chainId, id, refundAmount, c.tokenB.address);
//   });
//   it('should refund if swap fails', async function () {
//     const amountIn = utils.defaultAmountIn;
//     const swap = utils.buildUniV2Swap(c, amountIn, { amountOutMin: amountIn });
//     const id = utils.computeId(c);
//     const pocket = utils.getPocketAddr(id, c.enode.address);
//     const msg = utils.encodeMessage(id, swap, c.receiver.address, false, {
//       bridgeOutToken: c.tokenA.address,
//       bridgeOutFallbackToken: c.tokenB.address
//     });
//     await c.tokenA.transfer(pocket, amountIn);
//     const tx = c.enode.executeMessage(ZERO_ADDR, 0, msg, ZERO_ADDR);
//     await expect(tx).to.emit(c.enode, 'StepExecuted').withArgs(c.chainId, id, amountIn.sub(utils.defaultFee), c.tokenA.address);
//   });
//   it('should collect all fallback amount as fee if fallback amount <= fee', async function () {
//     const amountIn = utils.defaultFee.sub(1);
//     const swap = utils.buildUniV2Swap(c, amountIn);
//     const id = utils.computeId(c);
//     const pocket = utils.getPocketAddr(id, c.enode.address);
//     const msg = utils.encodeMessage(id, swap, c.receiver.address, false, {
//       bridgeOutToken: c.tokenA.address,
//       bridgeOutFallbackToken: c.tokenB.address,
//       feeInBridgeOutToken: utils.defaultFee,
//       feeInBridgeOutFallbackToken: utils.defaultFee
//     });
//     await c.tokenB.transfer(pocket, amountIn);
//     const tx = c.enode.executeMessage(ZERO_ADDR, 0, msg, ZERO_ADDR);
//     await expect(tx).to.emit(c.enode, 'StepExecuted').withArgs(c.chainId, id, 0, c.tokenB.address);
//   });
//   it('should collect all received amount as fee if amount <= fee', async function () {
//     const amountIn = utils.defaultFee.sub(1);
//     const swap = utils.buildUniV2Swap(c, amountIn);
//     const id = utils.computeId(c);
//     const pocket = utils.getPocketAddr(id, c.enode.address);
//     const msg = utils.encodeMessage(id, swap, c.receiver.address, false, {
//       bridgeOutToken: c.tokenA.address,
//       bridgeOutFallbackToken: c.tokenB.address,
//       feeInBridgeOutToken: utils.defaultFee,
//       feeInBridgeOutFallbackToken: utils.defaultFee
//     });
//     await c.tokenA.transfer(pocket, amountIn);
//     const tx = c.enode.executeMessage(ZERO_ADDR, 0, msg, ZERO_ADDR);
//     await expect(tx).to.emit(c.enode, 'StepExecuted').withArgs(c.chainId, id, 0, c.tokenA.address);
//   });
//   it('should send swap out token to receiver', async function () {
//     const amountIn = utils.defaultAmountIn;
//     const amountInSubFee = amountIn.sub(utils.defaultFee);
//     const swap = utils.buildUniV2Swap(c, amountInSubFee);
//     const id = utils.computeId(c);
//     const pocket = utils.getPocketAddr(id, c.enode.address);
//     const msg = utils.encodeMessage(id, swap, c.receiver.address, false, {
//       bridgeOutToken: c.tokenA.address,
//       feeInBridgeOutToken: utils.defaultFee
//     });
//     await c.tokenA.transfer(pocket, amountIn);
//     const tx = c.enode.executeMessage(ZERO_ADDR, 0, msg, ZERO_ADDR);
//     await expect(tx).to.emit(c.enode, 'StepExecuted').withArgs(c.chainId, id, utils.slipUniV2(amountInSubFee), c.tokenB.address);
//   });
//   it('should send swap out token to receiver (bridge out is native)', async function () {
//     const amountIn = parseUnits('1');
//     const fee = parseUnits('0.01');
//     const amountInSubFee = amountIn.sub(fee);
//     const swap = utils.buildUniV2Swap(c, amountInSubFee, { tokenIn: c.weth.address });
//     const id = utils.computeId(c);
//     const pocket = utils.getPocketAddr(id, c.enode.address);
//     const msg = utils.encodeMessage(id, swap, c.receiver.address, false, {
//       bridgeOutToken: c.weth.address,
//       feeInBridgeOutToken: fee
//     });
//     await c.admin.sendTransaction({
//       to: pocket,
//       value: parseUnits('1')
//     });
//     const tx = c.enode.executeMessage(ZERO_ADDR, 0, msg, ZERO_ADDR);
//     await expect(tx).to.emit(c.enode, 'StepExecuted').withArgs(c.chainId, id, utils.slipUniV2(amountInSubFee), c.tokenB.address);
//   });
//   it('should send swap out token to receiver (native out)', async function () {
//     const amountIn = parseUnits('1');
//     const fee = parseUnits('0.01');
//     const amountInSubFee = amountIn.sub(fee);
//     const swap = utils.buildUniV2Swap(c, amountInSubFee, { tokenOut: c.weth.address });
//     const id = utils.computeId(c);
//     const pocket = utils.getPocketAddr(id, c.enode.address);
//     const msg = utils.encodeMessage(id, swap, c.receiver.address, true, {
//       bridgeOutToken: c.tokenA.address,
//       feeInBridgeOutToken: fee
//     });
//     await c.tokenA.transfer(pocket, amountIn);
//     const tx = c.enode.executeMessage(ZERO_ADDR, 0, msg, ZERO_ADDR);
//     await expect(tx).to.emit(c.enode, 'StepExecuted').withArgs(c.chainId, id, utils.slipUniV2(amountInSubFee), c.weth.address);
//   });
//   it('should send swap out token to receiver (forward to another chain)', async function () {
//     const amountIn = utils.defaultAmountIn;
//     const amountInSubFee = amountIn.sub(utils.defaultFee);
//     const swap = utils.buildUniV2Swap(c, amountInSubFee);
//     const id = utils.computeId(c);
//     const pocket = utils.getPocketAddr(id, c.enode.address);
//     const msg = utils.encodeMessage(id, swap, c.receiver.address, false, {
//       bridgeOutToken: c.tokenA.address,
//       feeInBridgeOutToken: utils.defaultFee,
//       forward: {
//         bridgeParams: utils.buildBridgeParams(),
//         bridgeProvider: 'cbridge',
//         dstChainId: c.chainId + 1
//       }
//     });
//     const amountOut = utils.slipUniV2(amountInSubFee);
//     const xferId = utils.computeTransferId(c, {
//       amount: amountOut,
//       token: c.tokenB.address
//     });
//     await c.tokenA.transfer(pocket, amountIn);
//     const tx = c.enode.executeMessage(ZERO_ADDR, 0, msg, ZERO_ADDR, { value: 1000 });
//     await expect(tx).to.emit(c.enode, 'StepExecuted').withArgs(c.chainId, id, amountOut, c.tokenB.address);
//     await expect(tx)
//       .to.emit(c.bridge, 'Send')
//       .withArgs(
//         xferId,
//         c.cbridgeAdapter.address,
//         c.receiver.address,
//         c.tokenB.address,
//         amountOut,
//         c.chainId + 1,
//         utils.defaultNonce,
//         utils.defaultMaxSlippage
//       );
//   });
// });

// describe('fee', function () {
//   beforeEach(async () => {
//     await prepareContext();
//   });
//   it('should collect fee', async function () {
//     const amountIn = parseUnits('1');
//     const fee = parseUnits('0.01');
//     const amountInSubFee = amountIn.sub(fee);
//     const swap = utils.buildUniV2Swap(c, amountInSubFee, { tokenOut: c.weth.address });
//     const id = utils.computeId(c);
//     const pocket = utils.getPocketAddr(id, c.enode.address);
//     const msg = utils.encodeMessage(id, swap, c.receiver.address, true, {
//       bridgeOutToken: c.tokenA.address,
//       feeInBridgeOutToken: fee
//     });
//     await c.tokenA.transfer(pocket, amountIn);
//     await c.enode.executeMessage(ZERO_ADDR, 0, msg, ZERO_ADDR);

//     const balBefore = await c.tokenA.balanceOf(c.feeCollector.address);
//     await c.enode.connect(c.feeCollector).collectFee([c.tokenA.address], c.feeCollector.address);
//     const balAfter = await c.tokenA.balanceOf(c.feeCollector.address);
//     await expect(balAfter.sub(balBefore)).to.equal(fee);
//   });
//   it('should collect fee (native)', async function () {
//     const amountIn = parseUnits('1');
//     const fee = parseUnits('0.01');
//     const amountInSubFee = amountIn.sub(fee);
//     const swap = utils.buildUniV2Swap(c, amountInSubFee, { tokenIn: c.weth.address });
//     const id = utils.computeId(c);
//     const pocket = utils.getPocketAddr(id, c.enode.address);
//     const msg = utils.encodeMessage(id, swap, c.receiver.address, false, {
//       bridgeOutToken: c.weth.address,
//       feeInBridgeOutToken: fee
//     });
//     await c.admin.sendTransaction({
//       to: pocket,
//       value: parseUnits('1')
//     });
//     await c.enode.executeMessage(ZERO_ADDR, 0, msg, ZERO_ADDR);

//     const balBefore = await c.feeCollector.getBalance();
//     await c.enode.connect(c.feeCollector).collectFee([ZERO_ADDR], c.feeCollector.address);
//     const balAfter = await c.feeCollector.getBalance();
//     await expect(balAfter.sub(balBefore)).to.be.gt(fee.sub(parseUnits('0.005'))); // accounting for gas expenditure
//   });
// });

// describe('claimPocketFund', function () {
//   beforeEach(async () => {
//     await prepareContext();
//   });
//   it('should revert if pocket has no fund', async function () {
//     const srcChainId = 1;
//     const tx = c.enode.claimPocketFund(c.sender.address, c.receiver.address, srcChainId, utils.defaultNonce, c.tokenA.address);
//     await expect(tx).to.revertedWith('pocket is empty');
//   });
//   it('should claim erc20 token', async function () {
//     const claimAmount = utils.defaultAmountIn;
//     const id = utils.computeId(c, true);
//     const pocket = utils.getPocketAddr(id, c.enode.address);
//     await c.tokenA.connect(c.admin).transfer(pocket, claimAmount);
//     const tx = c.enode
//       .connect(c.receiver)
//       .claimPocketFund(c.sender.address, c.receiver.address, c.chainId, utils.defaultNonce, c.tokenA.address);
//     await expect(tx).to.emit(c.enode, 'PocketFundClaimed').withArgs(c.receiver.address, claimAmount, c.tokenA.address, 0);
//   });
//   it('should claim native token', async function () {
//     const claimAmount = parseUnits('1');
//     const id = utils.computeId(c, true);
//     const pocket = utils.getPocketAddr(id, c.enode.address);
//     await c.admin.sendTransaction({
//       to: pocket,
//       value: claimAmount
//     });
//     const tx = c.enode
//       .connect(c.receiver)
//       .claimPocketFund(c.sender.address, c.receiver.address, c.chainId, utils.defaultNonce, c.weth.address);
//     await expect(tx).to.emit(c.enode, 'PocketFundClaimed').withArgs(c.receiver.address, 0, c.weth.address, claimAmount);
//   });
// });
