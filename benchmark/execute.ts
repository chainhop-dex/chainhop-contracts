import { parseUnits } from 'ethers/lib/utils';
import { loadFixture } from '../test/lib/deploy';
import { BenchmarkContext, benchmarkFixture } from '../test/lib/fixtures';
import * as utils from '../test/lib/utils';

let c: BenchmarkContext;

const prepareContext = async () => {
  const fixture = await loadFixture(benchmarkFixture);
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

describe('gas benchmark', function () {
  beforeEach(prepareContext);
  it('execute()', async () => {
    const amountIn = parseUnits('1');
    const fee = parseUnits('0.01');
    const amountInSubFee = amountIn.sub(fee);
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
    await c.enode.connect(c.sender).execute(id, execs, src, dst);
  });
});
