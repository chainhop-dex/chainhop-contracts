import { parseUnits } from 'ethers/lib/utils';
import { ZERO_ADDR } from './lib/constants';
import { loadFixture } from './lib/deploy';
import { chainhopFixture, IntegrationTestFixture } from './lib/fixtures';

import * as utils from './lib/utils';

let c: IntegrationTestFixture;

const prepareContext = async () => {
  c = await loadFixture(chainhopFixture);
};

describe('fee vault', function () {
  beforeEach(prepareContext);

  it('should collect fee', async function () {
    await c.tokenA.connect(c.admin).transfer(c.feeVault.address, utils.defaultFee);
    const tx = c.feeVault.connect(c.feeCollector).collectFee([c.tokenA.address], c.receiver.address);
    await utils.assertBalanceChange(tx, c.receiver.address, utils.defaultFee, c.tokenA);
  });

  it('should collect fee (native)', async function () {
    await c.admin.sendTransaction({ to: c.feeVault.address, value: parseUnits('1') });
    const tx = c.feeVault.connect(c.feeCollector).collectFee([ZERO_ADDR], c.receiver.address);
    await utils.assertBalanceChange(tx, c.receiver.address, parseUnits('1'));
  });
});
