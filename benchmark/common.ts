import { parseUnits } from 'ethers/lib/utils';
import { loadFixture } from '../test/lib/common';
import { ZERO_ADDR, ZERO_AMOUNT } from '../test/lib/constants';
import { BenchmarkContext, benchmarkFixture } from '../test/lib/fixtures';
import * as utils from '../test/lib/utils';

export const prepareContext = async () => {
  const fixture = await loadFixture(benchmarkFixture);
  const accounts = fixture.accounts;
  return {
    ...fixture,
    accounts,
    signer: accounts[0],
    feeCollector: accounts[1],
    sender: accounts[2],
    receiver: accounts[3]
  };
};

export async function runUniswapV2(c: BenchmarkContext, num: number) {
  const amountIn = parseUnits('100');
  const swaps = utils.buildUniV2Swaps(c, amountIn, { amountOutMin: ZERO_AMOUNT, num });
  const id = utils.computeId(c.sender.address, c.receiver.address, 1, 1);
  const fee = parseUnits('1');
  const msg = utils.encodeMessage(id, swaps, c.receiver.address, false, fee, true);

  await c.tokenA.transfer(c.xswap.address, amountIn);
  await c.xswap.executeMessageWithTransfer(ZERO_ADDR, c.tokenA.address, amountIn, 0, msg, ZERO_ADDR);
}
