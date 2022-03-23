import { BenchmarkContext } from '../test/lib/fixtures';
import { prepareContext, runUniswapV2 } from './common';

let c: BenchmarkContext;

describe('executeMessageWithTransfer gas benchmark', function () {
  beforeEach(async () => {
    c = await prepareContext();
    // impersonate MessageBus as admin to gain access to calling executeMessageWithTransfer
    await c.xswap.connect(c.admin).setMessageBus(c.admin.address);
  });

  for (let i = 1; i < 6; i++) {
    it(`${i} Uniswap V2 swap(s)`, () => runUniswapV2(c, i));
  }
});
