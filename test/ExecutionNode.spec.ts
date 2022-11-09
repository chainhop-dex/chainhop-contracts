import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
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
    receiver: accounts[3],
    remote: accounts[4]
  };
};

describe('execute() on src chain', () => {
  beforeEach(prepareContext);

  it('should verify quote sig', async function () {
    const amountIn = utils.defaultAmountIn;
    const dstSwap = utils.buildUniV2Swap(c, amountIn);
    const id = utils.computeId(c.sender.address, c.receiver.address);
    const execs = [
      utils.newExecutionInfo({
        chainId: c.chainId,
        bridge: utils.newBridgeInfo({
          toChainId: c.chainId + 1,
          bridgeProvider: 'cbridge',
          bridgeParams: utils.encodeBridgeParams()
        }),
        remoteExecutionNode: c.remote.address
      }),
      utils.newExecutionInfo({ chainId: c.chainId + 1, swap: dstSwap, bridgeOutToken: c.tokenB.address })
    ];
    const src = utils.newSourceInfo({ chainId: c.chainId, tokenIn: c.tokenA.address });
    const dst = utils.newDestinationInfo({ chainId: c.chainId + 1, receiver: c.receiver.address });
    const data = utils.encodeSignData(execs, src, dst);
    const sig = await c.signer.signMessage(data);
    src.quoteSig = sig;
    await c.tokenA.connect(c.sender).approve(c.enode.address, amountIn);
    const tx = c.enode.connect(c.sender).execute(id, execs, src, dst, { value: 2000 });
    await expect(tx).to.not.revertedWith('invalid signer');
  });

  it('should revert if invalid quote sig', async function () {
    const amountIn = utils.defaultAmountIn;
    const dstSwap = utils.buildUniV2Swap(c, amountIn);
    const id = utils.computeId(c.sender.address, c.receiver.address);
    const execs = [
      utils.newExecutionInfo({
        chainId: c.chainId,
        bridge: utils.newBridgeInfo({
          toChainId: c.chainId + 1,
          bridgeProvider: 'cbridge',
          bridgeParams: utils.encodeBridgeParams()
        }),
        remoteExecutionNode: c.remote.address
      }),
      utils.newExecutionInfo({ chainId: c.chainId + 1, swap: dstSwap, bridgeOutToken: c.tokenB.address })
    ];
    const src = utils.newSourceInfo({ chainId: c.chainId, tokenIn: c.tokenA.address });
    const dst = utils.newDestinationInfo({ chainId: c.chainId + 1, receiver: c.receiver.address });
    const data = utils.encodeSignData(execs, src, dst);
    const sig = await c.signer.signMessage(data);
    src.quoteSig = sig;
    execs[1].chainId = BigNumber.from(execs[1].chainId).add(1); // chainId will not match what's encoded in sig
    await c.tokenA.connect(c.sender).approve(c.enode.address, amountIn);
    const tx = c.enode.connect(c.sender).execute(id, execs, src, dst, { value: 2000 });
    await expect(tx).to.revertedWith('invalid signer');
  });

  it('should revert if deadline has passed', async function () {
    const amountIn = utils.defaultAmountIn;
    const dstSwap = utils.buildUniV2Swap(c, amountIn);
    const id = utils.computeId(c.sender.address, c.receiver.address);
    const execs = [
      utils.newExecutionInfo({
        chainId: c.chainId,
        bridge: utils.newBridgeInfo({ toChainId: c.chainId + 1, bridgeProvider: 'cbridge' }),
        remoteExecutionNode: c.remote.address
      }),
      utils.newExecutionInfo({ chainId: c.chainId + 1, swap: dstSwap, bridgeOutToken: c.tokenB.address })
    ];
    const src = utils.newSourceInfo({
      chainId: c.chainId,
      tokenIn: c.tokenA.address,
      deadline: BigNumber.from(Math.floor(Date.now() / 1000 - 300))
    });
    const dst = utils.newDestinationInfo({ chainId: c.chainId + 1, receiver: c.receiver.address });
    const data = utils.encodeSignData(execs, src, dst);
    const sig = await c.signer.signMessage(data);
    src.quoteSig = sig;
    execs[1].chainId; // chainId will not match what's encoded in sig
    await c.tokenA.connect(c.sender).approve(c.enode.address, amountIn);
    const tx = c.enode.connect(c.sender).execute(id, execs, src, dst);
    await expect(tx).to.be.revertedWith('deadline exceeded');
  });

  it('should revert if native in but not enough value', async function () {
    const amountIn = utils.defaultAmountIn;
    const srcSwap = utils.buildUniV2Swap(c, amountIn, { tokenIn: c.weth.address });
    const id = utils.computeId(c.sender.address, c.receiver.address);
    const execs = [
      utils.newExecutionInfo({
        chainId: c.chainId,
        swap: srcSwap,
        bridge: utils.newBridgeInfo({ toChainId: c.chainId + 1, bridgeProvider: 'cbridge' }),
        remoteExecutionNode: c.remote.address
      })
    ];
    const src = utils.newSourceInfo({ chainId: c.chainId, tokenIn: c.weth.address, nativeIn: true });
    const dst = utils.newDestinationInfo({ chainId: c.chainId, receiver: c.receiver.address });
    const data = utils.encodeSignData(execs, src, dst);
    const sig = await c.signer.signMessage(data);
    src.quoteSig = sig;
    await c.tokenA.connect(c.sender).approve(c.enode.address, amountIn);
    const tx = c.enode.connect(c.sender).execute(id, execs, src, dst, { value: amountIn.sub(parseUnits('95')) });
    await expect(tx).to.be.revertedWith('insufficient native amount');
  });

  it('should revert if swap fails on src chain', async function () {
    const amountIn = utils.defaultAmountIn;
    const srcSwap = utils.buildUniV2Swap(c, amountIn, { tokenIn: c.tokenA.address, amountOutMin: amountIn });
    const id = utils.computeId(c.sender.address, c.receiver.address);
    const execs = [
      utils.newExecutionInfo({
        chainId: c.chainId,
        swap: srcSwap,
        bridge: utils.newBridgeInfo({ toChainId: c.chainId + 1, bridgeProvider: 'cbridge' }),
        remoteExecutionNode: c.remote.address
      })
    ];
    const src = utils.newSourceInfo({ chainId: c.chainId, tokenIn: c.tokenA.address });
    const dst = utils.newDestinationInfo({ chainId: c.chainId, receiver: c.receiver.address });
    const data = utils.encodeSignData(execs, src, dst);
    const sig = await c.signer.signMessage(data);
    src.quoteSig = sig;
    await c.tokenA.connect(c.sender).approve(c.enode.address, amountIn);
    const tx = c.enode.connect(c.sender).execute(id, execs, src, dst);
    await expect(tx).to.be.revertedWith('swap fail');
  });

  it('should bridge -> swap', async function () {
    const amountIn = utils.defaultAmountIn;
    const dstSwap = utils.buildUniV2Swap(c, amountIn);
    const id = utils.computeId(c.sender.address, c.receiver.address);
    const execs = [
      utils.newExecutionInfo({
        chainId: c.chainId,
        bridge: utils.newBridgeInfo({
          toChainId: c.chainId + 1,
          bridgeProvider: 'cbridge',
          bridgeParams: utils.encodeBridgeParams()
        }),
        remoteExecutionNode: c.remote.address
      }),
      utils.newExecutionInfo({ chainId: c.chainId + 1, swap: dstSwap, bridgeOutToken: c.tokenB.address })
    ];
    const src = utils.newSourceInfo({ chainId: c.chainId, tokenIn: c.tokenA.address });
    const dst = utils.newDestinationInfo({ chainId: c.chainId + 1, receiver: c.receiver.address });
    const data = utils.encodeSignData(execs, src, dst);
    const sig = await c.signer.signMessage(data);
    src.quoteSig = sig;
    await c.tokenA.connect(c.sender).approve(c.enode.address, amountIn);
    const tx = c.enode.connect(c.sender).execute(id, execs, src, dst, { value: 2000 });

    await expect(tx).to.emit(c.enode, 'StepExecuted').withArgs(id, amountIn, c.tokenA.address);
    const pocket = utils.getPocketAddr(id, c.remote.address);
    const xferId = utils.computeTransferId(c, {
      token: c.tokenA.address,
      receiver: pocket
    });
    await expect(tx)
      .to.emit(c.bridge, 'Send')
      .withArgs(
        xferId,
        c.cbridgeAdapter.address,
        pocket,
        c.tokenA.address,
        amountIn,
        c.chainId + 1,
        utils.defaultNonce,
        utils.defaultMaxSlippage
      );
  });

  it('should swap -> bridge', async function () {
    const amountIn = utils.defaultAmountIn;
    const srcSwap = utils.buildUniV2Swap(c, amountIn);
    const id = utils.computeId(c.sender.address, c.receiver.address);
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
    const tx = c.enode.connect(c.sender).execute(id, execs, src, dst, { value: 2000 });

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

  it('should swap -> bridge (native in)', async function () {
    const amountIn = parseUnits('1');
    const srcSwap = utils.buildUniV2Swap(c, amountIn, { tokenIn: c.weth.address });
    const id = utils.computeId(c.sender.address, c.receiver.address);
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
    const src = utils.newSourceInfo({ chainId: c.chainId, tokenIn: c.weth.address, amountIn, nativeIn: true });
    const dst = utils.newDestinationInfo({ chainId: c.chainId + 1, receiver: c.receiver.address });
    const data = utils.encodeSignData(execs, src, dst);
    const sig = await c.signer.signMessage(data);
    src.quoteSig = sig;
    await c.tokenA.connect(c.sender).approve(c.enode.address, amountIn);
    const tx = c.enode.connect(c.sender).execute(id, execs, src, dst, { value: amountIn.add(2000) });

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

  it('should swap -> bridge -> swap', async function () {
    const amountIn = utils.defaultAmountIn;
    const srcSwap = utils.buildUniV2Swap(c, amountIn);
    const srcAmountOut = utils.slipUniV2(amountIn);
    const dstSwap = utils.buildUniV2Swap(c, srcAmountOut, { tokenIn: c.tokenB.address, tokenOut: c.tokenA.address });
    const id = utils.computeId(c.sender.address, c.receiver.address);
    const execs = [
      utils.newExecutionInfo({
        chainId: c.chainId,
        swap: srcSwap,
        remoteExecutionNode: c.remote.address,
        bridge: utils.newBridgeInfo({
          toChainId: c.chainId + 1,
          bridgeProvider: 'cbridge',
          bridgeParams: utils.encodeBridgeParams()
        })
      }),
      utils.newExecutionInfo({
        chainId: c.chainId + 1,
        swap: dstSwap
      })
    ];
    const src = utils.newSourceInfo({ chainId: c.chainId, tokenIn: c.tokenA.address });
    const dst = utils.newDestinationInfo({ chainId: c.chainId + 1, receiver: c.receiver.address });
    const pocket = utils.getPocketAddr(id, c.remote.address);
    const data = utils.encodeSignData(execs, src, dst);
    const sig = await c.signer.signMessage(data);
    src.quoteSig = sig;
    await c.tokenA.connect(c.sender).approve(c.enode.address, amountIn);
    const tx = c.enode.connect(c.sender).execute(id, execs, src, dst, { value: 2000 });

    const xferId = utils.computeTransferId(c, {
      amount: srcAmountOut,
      token: c.tokenB.address,
      receiver: pocket
    });
    await expect(tx).to.emit(c.enode, 'StepExecuted').withArgs(id, srcAmountOut, c.tokenB.address);
    await expect(tx)
      .to.emit(c.bridge, 'Send')
      .withArgs(
        xferId,
        c.cbridgeAdapter.address,
        pocket,
        c.tokenB.address,
        srcAmountOut,
        c.chainId + 1,
        utils.defaultNonce,
        utils.defaultMaxSlippage
      );
  });

  it('should revert if using wrapped bridge token but tokenOut from dex != canonical', async function () {
    const amountIn = utils.defaultAmountIn;
    const srcSwap = utils.buildUniV2Swap(c, amountIn);
    const id = utils.computeId(c.sender.address, c.receiver.address);
    const execs = [
      utils.newExecutionInfo({
        chainId: c.chainId,
        swap: srcSwap,
        bridge: utils.newBridgeInfo({
          toChainId: c.chainId + 1,
          bridgeProvider: 'cbridge',
          bridgeParams: utils.encodeBridgeParams(undefined, c.wrappedBridgeToken.address, undefined)
        })
      })
    ];
    const src = utils.newSourceInfo({ chainId: c.chainId, tokenIn: c.tokenA.address });
    const dst = utils.newDestinationInfo({ chainId: c.chainId + 1, receiver: c.receiver.address });
    const data = utils.encodeSignData(execs, src, dst);
    const sig = await c.signer.signMessage(data);
    src.quoteSig = sig;
    await c.tokenA.connect(c.sender).approve(c.enode.address, amountIn);
    const tx = c.enode.connect(c.sender).execute(id, execs, src, dst, { value: 2000 });
    await expect(tx).to.be.revertedWith('canonical != _token');
  });

  it('should bridge using wrapped bridge token', async function () {
    const amountIn = utils.defaultAmountIn;
    const id = utils.computeId(c.sender.address, c.receiver.address);
    const execs = [
      utils.newExecutionInfo({
        chainId: c.chainId,
        bridge: utils.newBridgeInfo({
          toChainId: c.chainId + 1,
          bridgeProvider: 'cbridge',
          bridgeParams: utils.encodeBridgeParams(undefined, c.wrappedBridgeToken.address, undefined)
        })
      })
    ];
    const src = utils.newSourceInfo({ chainId: c.chainId, tokenIn: c.tokenA.address });
    const dst = utils.newDestinationInfo({ chainId: c.chainId + 1, receiver: c.receiver.address });
    await c.tokenA.connect(c.sender).approve(c.enode.address, amountIn);

    const tx = c.enode.connect(c.sender).execute(id, execs, src, dst, { value: 2000 });
    const xferId = utils.computeTransferId(c, {
      amount: amountIn,
      token: c.wrappedBridgeToken.address
    });
    await expect(tx).to.emit(c.enode, 'StepExecuted').withArgs(id, amountIn, c.tokenA.address);
    await expect(tx)
      .to.emit(c.bridge, 'Send')
      .withArgs(
        xferId,
        c.cbridgeAdapter.address,
        c.receiver.address,
        c.wrappedBridgeToken.address,
        amountIn,
        c.chainId + 1,
        utils.defaultNonce,
        utils.defaultMaxSlippage
      );
  });

  it('should directly swap', async function () {
    const amountIn = utils.defaultAmountIn;
    const amountOut = utils.slipUniV2(amountIn);
    const srcSwap = utils.buildUniV2Swap(c, amountIn);
    const id = utils.computeId(c.sender.address, c.receiver.address);
    const execs = [
      utils.newExecutionInfo({
        chainId: c.chainId,
        swap: srcSwap
      })
    ];
    const src = utils.newSourceInfo({ chainId: c.chainId, tokenIn: c.tokenA.address });
    const dst = utils.newDestinationInfo({ chainId: c.chainId, receiver: c.receiver.address });
    await c.tokenA.connect(c.sender).approve(c.enode.address, amountIn);
    const tx = c.enode.connect(c.sender).execute(id, execs, src, dst, { value: 2000 });
    await utils.assertBalanceChange(tx, c.receiver.address, amountOut, c.tokenB);
    await expect(tx).to.emit(c.enode, 'StepExecuted').withArgs(id, amountOut, c.tokenB.address);
    await expect(tx).to.not.emit(c.bridge, 'Send');
  });

  it('should directly swap (native in)', async function () {
    const amountIn = parseUnits('1');
    const amountOut = utils.slipUniV2(amountIn);
    const srcSwap = utils.buildUniV2Swap(c, amountIn, { tokenIn: c.weth.address });
    const id = utils.computeId(c.sender.address, c.receiver.address);
    const execs = [
      utils.newExecutionInfo({
        chainId: c.chainId,
        swap: srcSwap
      })
    ];
    const src = utils.newSourceInfo({ chainId: c.chainId, tokenIn: c.weth.address, amountIn, nativeIn: true });
    const dst = utils.newDestinationInfo({ chainId: c.chainId, receiver: c.receiver.address });
    const tx = c.enode.connect(c.sender).execute(id, execs, src, dst, { value: amountIn });
    await utils.assertBalanceChange(tx, c.receiver.address, amountOut, c.tokenB);
    await expect(tx).to.emit(c.enode, 'StepExecuted').withArgs(id, amountOut, c.tokenB.address);
    await expect(tx).to.not.emit(c.bridge, 'Send');
  });
});

describe('execute() on remote chains', function () {
  beforeEach(async () => {
    await prepareContext();
  });

  it('should revert if pocket does not have enough fund', async function () {
    const amountIn = utils.defaultAmountIn;
    const swap = utils.buildUniV2Swap(c, amountIn);
    const id = utils.computeId(c.sender.address, c.receiver.address);
    const execs = [
      utils.newExecutionInfo({
        chainId: c.chainId,
        swap: swap,
        bridgeOutToken: c.tokenA.address,
        bridgeOutMin: amountIn.add(1)
      })
    ];
    const src = utils.newSourceInfo();
    const dst = utils.newDestinationInfo({ chainId: c.chainId, receiver: c.receiver.address });
    const data = utils.encodeSignData(execs, src, dst);
    const sig = await c.signer.signMessage(data);
    src.quoteSig = sig;
    const pocket = utils.getPocketAddr(id, c.enode.address);
    await c.tokenA.connect(c.admin).transfer(pocket, amountIn);
    const tx = c.enode.connect(c.sender).execute(id, execs, src, dst);
    await expect(tx).to.be.revertedWith('MSG::ABORT:pocket is empty');
  });

  it('should refund if it receives fallback token', async function () {
    const amountIn = utils.defaultAmountIn;
    const refundAmount = amountIn.sub(utils.defaultFee);
    const swap = utils.buildUniV2Swap(c, amountIn);
    const id = utils.computeId(c.sender.address, c.receiver.address);
    const execs = [
      utils.newExecutionInfo({
        chainId: c.chainId,
        swap: swap,
        bridgeOutToken: c.tokenA.address,
        bridgeOutFallbackToken: c.tokenB.address,
        feeInBridgeOutFallbackToken: utils.defaultFee
      })
    ];
    const src = utils.newSourceInfo();
    const dst = utils.newDestinationInfo({ chainId: c.chainId, receiver: c.receiver.address });
    const data = utils.encodeSignData(execs, src, dst);
    const sig = await c.signer.signMessage(data);
    src.quoteSig = sig;
    const pocket = utils.getPocketAddr(id, c.enode.address);
    await c.tokenB.connect(c.admin).transfer(pocket, amountIn);
    const tx = c.enode.connect(c.sender).execute(id, execs, src, dst);
    await utils.assertBalanceChange(tx, c.receiver.address, refundAmount, c.tokenB);
    await expect(tx).to.emit(c.enode, 'StepExecuted').withArgs(id, refundAmount, c.tokenB.address);
  });

  it('should refund if swap fails', async function () {
    const amountIn = utils.defaultAmountIn;
    const amountInSubFee = amountIn.sub(utils.defaultFee);
    const swap = utils.buildUniV2Swap(c, amountIn, { amountOutMin: amountIn }); // amountOutMin too high
    const id = utils.computeId(c.sender.address, c.receiver.address);
    const execs = [
      utils.newExecutionInfo({
        chainId: c.chainId,
        swap: swap,
        bridgeOutToken: c.tokenA.address,
        feeInBridgeOutToken: utils.defaultFee
      })
    ];
    const src = utils.newSourceInfo();
    const dst = utils.newDestinationInfo({ chainId: c.chainId, receiver: c.receiver.address });
    const data = utils.encodeSignData(execs, src, dst);
    const sig = await c.signer.signMessage(data);
    src.quoteSig = sig;
    const pocket = utils.getPocketAddr(id, c.enode.address);
    await c.tokenA.connect(c.admin).transfer(pocket, amountIn);
    const tx = c.enode.connect(c.sender).execute(id, execs, src, dst);
    await utils.assertBalanceChange(tx, c.receiver.address, amountInSubFee, c.tokenA);
    await expect(tx).to.emit(c.enode, 'StepExecuted').withArgs(id, amountInSubFee, c.tokenA.address);
  });

  it('should collect all fallback amount as fee if fallback amount <= fee', async function () {
    const amountIn = utils.defaultFee.sub(1);
    const swap = utils.buildUniV2Swap(c, amountIn);
    const id = utils.computeId(c.sender.address, c.receiver.address);
    const execs = [
      utils.newExecutionInfo({
        chainId: c.chainId,
        swap: swap,
        bridgeOutToken: c.tokenA.address,
        bridgeOutFallbackToken: c.tokenB.address,
        feeInBridgeOutToken: utils.defaultFee,
        feeInBridgeOutFallbackToken: utils.defaultFee
      })
    ];
    const src = utils.newSourceInfo();
    const dst = utils.newDestinationInfo({ chainId: c.chainId, receiver: c.receiver.address });
    const pocket = utils.getPocketAddr(id, c.enode.address);
    await c.tokenB.connect(c.admin).transfer(pocket, amountIn);
    const tx = c.enode.connect(c.sender).execute(id, execs, src, dst);
    await utils.assertBalanceChange(tx, c.enode.address, amountIn, c.tokenB);
    await expect(tx).to.emit(c.enode, 'StepExecuted').withArgs(id, 0, c.tokenB.address);
  });

  it('should collect all received amount as fee if amount <= fee', async function () {
    const amountIn = utils.defaultFee.sub(1);
    const swap = utils.buildUniV2Swap(c, amountIn);
    const id = utils.computeId(c.sender.address, c.receiver.address);
    const execs = [
      utils.newExecutionInfo({
        chainId: c.chainId,
        swap: swap,
        bridgeOutToken: c.tokenA.address,
        bridgeOutFallbackToken: c.tokenB.address,
        feeInBridgeOutToken: utils.defaultFee,
        feeInBridgeOutFallbackToken: utils.defaultFee
      })
    ];
    const src = utils.newSourceInfo();
    const dst = utils.newDestinationInfo({ chainId: c.chainId, receiver: c.receiver.address });
    const pocket = utils.getPocketAddr(id, c.enode.address);
    await c.tokenA.connect(c.admin).transfer(pocket, amountIn);
    const tx = c.enode.connect(c.sender).execute(id, execs, src, dst);
    await utils.assertBalanceChange(tx, c.enode.address, amountIn, c.tokenA);
    await expect(tx).to.emit(c.enode, 'StepExecuted').withArgs(id, 0, c.tokenA.address);
  });

  it('should send swap out token to receiver', async function () {
    const amountIn = utils.defaultAmountIn;
    const amountInSubFee = amountIn.sub(utils.defaultFee);
    const amountOut = utils.slipUniV2(amountInSubFee);
    const swap = utils.buildUniV2Swap(c, amountInSubFee);
    const id = utils.computeId(c.sender.address, c.receiver.address);
    const execs = [
      utils.newExecutionInfo({
        chainId: c.chainId,
        swap: swap,
        bridgeOutToken: c.tokenA.address,
        bridgeOutFallbackToken: c.tokenB.address,
        feeInBridgeOutToken: utils.defaultFee,
        feeInBridgeOutFallbackToken: utils.defaultFee
      })
    ];
    const src = utils.newSourceInfo();
    const dst = utils.newDestinationInfo({ chainId: c.chainId, receiver: c.receiver.address });
    const pocket = utils.getPocketAddr(id, c.enode.address);
    await c.tokenA.connect(c.admin).transfer(pocket, amountIn);
    const tx = c.enode.connect(c.sender).execute(id, execs, src, dst);
    await utils.assertBalanceChange(tx, c.receiver.address, amountOut, c.tokenB);
    await expect(tx).to.emit(c.enode, 'StepExecuted').withArgs(id, amountOut, c.tokenB.address);
  });

  it('should send swap out token to receiver (bridge out is native)', async function () {
    const amountIn = parseUnits('1');
    const fee = parseUnits('0.01');
    const amountInSubFee = amountIn.sub(fee);
    const amountOut = utils.slipUniV2(amountInSubFee);
    const swap = utils.buildUniV2Swap(c, amountInSubFee, { tokenIn: c.weth.address });
    const id = utils.computeId(c.sender.address, c.receiver.address);
    const execs = [
      utils.newExecutionInfo({
        chainId: c.chainId,
        swap: swap,
        bridgeOutToken: c.weth.address,
        feeInBridgeOutToken: fee
      })
    ];
    const src = utils.newSourceInfo();
    const dst = utils.newDestinationInfo({ chainId: c.chainId, receiver: c.receiver.address });
    const pocket = utils.getPocketAddr(id, c.enode.address);
    await c.admin.sendTransaction({ to: pocket, value: parseUnits('1') });
    const tx = c.enode.connect(c.sender).execute(id, execs, src, dst);
    await utils.assertBalanceChange(tx, c.receiver.address, amountOut, c.tokenB);
    await expect(tx).to.emit(c.enode, 'StepExecuted').withArgs(id, amountOut, c.tokenB.address);
  });

  it('should send swap out token to receiver (native out)', async function () {
    const amountIn = parseUnits('1');
    const fee = parseUnits('0.01');
    const amountInSubFee = amountIn.sub(fee);
    const amountOut = utils.slipUniV2(amountInSubFee);
    const swap = utils.buildUniV2Swap(c, amountInSubFee, { tokenOut: c.weth.address });
    const id = utils.computeId(c.sender.address, c.receiver.address);
    const execs = [
      utils.newExecutionInfo({
        chainId: c.chainId,
        swap: swap,
        bridgeOutToken: c.tokenA.address,
        feeInBridgeOutToken: fee
      })
    ];
    const src = utils.newSourceInfo();
    const dst = utils.newDestinationInfo({ chainId: c.chainId, receiver: c.receiver.address, nativeOut: true });
    const pocket = utils.getPocketAddr(id, c.enode.address);
    await c.tokenA.transfer(pocket, amountIn);
    const tx = c.enode.connect(c.sender).execute(id, execs, src, dst);
    await utils.assertBalanceChange(tx, c.receiver.address, amountOut, undefined);
    await expect(tx).to.emit(c.enode, 'StepExecuted').withArgs(id, amountOut, c.weth.address);
  });

  it('should send swap out token and bridge funds to receiver', async function () {
    const amountIn = utils.defaultAmountIn;
    const amountInSubFee = amountIn.sub(utils.defaultFee);
    const amountOut = utils.slipUniV2(amountInSubFee);
    const swap = utils.buildUniV2Swap(c, amountInSubFee);
    const id = utils.computeId(c.sender.address, c.receiver.address);
    const execs = [
      utils.newExecutionInfo({
        chainId: c.chainId,
        swap: swap,
        bridge: utils.newBridgeInfo({
          toChainId: c.chainId + 1,
          bridgeProvider: 'cbridge',
          bridgeParams: utils.encodeBridgeParams()
        }),
        feeInBridgeOutToken: utils.defaultFee,
        bridgeOutToken: c.tokenA.address
      })
    ];
    const src = utils.newSourceInfo();
    const dst = utils.newDestinationInfo({ chainId: c.chainId + 1, receiver: c.receiver.address });
    const pocket = utils.getPocketAddr(id, c.enode.address);
    await c.tokenA.connect(c.admin).transfer(pocket, amountIn);
    const tx = c.enode.connect(c.sender).execute(id, execs, src, dst, { value: 33 });
    await expect(tx).to.emit(c.enode, 'StepExecuted').withArgs(id, amountOut, c.tokenB.address);
    const xferId = utils.computeTransferId(c, {
      amount: amountOut,
      token: c.tokenB.address
    });
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
});

describe('fee', function () {
  beforeEach(prepareContext);

  it('should collect fee', async function () {
    const amountIn = utils.defaultAmountIn;
    const amountInSubFee = amountIn.sub(utils.defaultFee);
    const swap = utils.buildUniV2Swap(c, amountInSubFee);
    const id = utils.computeId(c.sender.address, c.receiver.address);
    const execs = [
      utils.newExecutionInfo({
        chainId: c.chainId,
        swap: swap,
        bridgeOutToken: c.tokenA.address,
        bridgeOutFallbackToken: c.tokenB.address,
        feeInBridgeOutToken: utils.defaultFee,
        feeInBridgeOutFallbackToken: utils.defaultFee
      })
    ];
    const src = utils.newSourceInfo();
    const dst = utils.newDestinationInfo({ chainId: c.chainId, receiver: c.receiver.address });
    const pocket = utils.getPocketAddr(id, c.enode.address);
    await c.tokenA.connect(c.admin).transfer(pocket, amountIn);
    const tx = c.enode.connect(c.sender).execute(id, execs, src, dst);
    await utils.assertBalanceChange(tx, c.enode.address, utils.defaultFee, c.tokenA);
  });

  it('should collect fee (native)', async function () {
    const amountIn = parseUnits('1');
    const fee = parseUnits('0.01');
    const amountInSubFee = amountIn.sub(fee);
    const amountOut = utils.slipUniV2(amountInSubFee);
    const swap = utils.buildUniV2Swap(c, amountInSubFee, { tokenIn: c.weth.address });
    const id = utils.computeId(c.sender.address, c.receiver.address);
    const execs = [
      utils.newExecutionInfo({
        chainId: c.chainId,
        swap: swap,
        bridgeOutToken: c.weth.address,
        feeInBridgeOutToken: fee
      })
    ];
    const src = utils.newSourceInfo();
    const dst = utils.newDestinationInfo({ chainId: c.chainId, receiver: c.receiver.address });
    const pocket = utils.getPocketAddr(id, c.enode.address);
    await c.admin.sendTransaction({ to: pocket, value: parseUnits('1') });
    const tx = c.enode.connect(c.sender).execute(id, execs, src, dst);
    await utils.assertBalanceChange(tx, c.enode.address, fee.sub(parseUnits('0.005'))); // accounting for gas expenditure
    await expect(tx).to.emit(c.enode, 'StepExecuted').withArgs(id, amountOut, c.tokenB.address);
  });
});

describe('claimPocketFund', function () {
  beforeEach(prepareContext);
  it('should revert if pocket has no fund', async function () {
    const tx = c.enode.claimPocketFund(c.sender.address, c.receiver.address, utils.defaultNonce, c.tokenA.address);
    await expect(tx).to.revertedWith('pocket is empty');
  });
  it('should claim erc20 token', async function () {
    const claimAmount = utils.defaultAmountIn;
    const id = utils.computeId(c.sender.address, c.receiver.address);
    const pocket = utils.getPocketAddr(id, c.enode.address);
    await c.tokenA.connect(c.admin).transfer(pocket, claimAmount);
    const tx = c.enode.connect(c.receiver).claimPocketFund(c.sender.address, c.receiver.address, utils.defaultNonce, c.tokenA.address);
    await expect(tx).to.emit(c.enode, 'PocketFundClaimed').withArgs(c.receiver.address, claimAmount, c.tokenA.address, 0);
  });
  it('should claim native token', async function () {
    const claimAmount = parseUnits('1');
    const id = utils.computeId(c.sender.address, c.receiver.address);
    const pocket = utils.getPocketAddr(id, c.enode.address);
    await c.admin.sendTransaction({
      to: pocket,
      value: claimAmount
    });
    const tx = c.enode.connect(c.receiver).claimPocketFund(c.sender.address, c.receiver.address, utils.defaultNonce, c.weth.address);
    await expect(tx).to.emit(c.enode, 'PocketFundClaimed').withArgs(c.receiver.address, 0, c.weth.address, claimAmount);
  });
});
