import { BenchmarkContext } from '../test/lib/fixtures';
import { prepareContext, runUniswapV2 } from './common';

let c: BenchmarkContext;

describe('executeMessageWithTransfer gas benchmark', function () {
  beforeEach(async () => {
    c = await prepareContext();
    // impersonate MessageBus as admin to gain access to calling executeMessageWithTransfer
    await c.xswap.connect(c.admin).setMessageBus(c.admin.address);
  });

  it('no swap', () => runUniswapV2(c, 0));
});
