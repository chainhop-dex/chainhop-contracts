#!/bin/bash
echo chainId $CHAIN_ID rpc $RPC blk $BLK
HH_NETWORK_FIELD="chainId: $CHAIN_ID, forking: {url: \"$RPC\", blockNumber: $BLK}"
echo "network: $HH_NETWORK_FIELD"
# replace "// sed_placeholder" with $HH_NETWORK_FIELD
sed -i "s|// sed_placeholder|$HH_NETWORK_FIELD|" hardhat.config.ts
cat hardhat.config.ts
export DEPLOY_ENV="fork"
npx hardhat run ./scripts/config.ts > >(tee -a /chainhop-contracts/home/fork.log) 2>&1
