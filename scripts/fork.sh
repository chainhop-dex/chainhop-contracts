#!/bin/bash
echo chainId $CHAIN_ID rpc $RPC blk $BLK
RPC=$(echo $RPC | sed 's/\//\\\//g') # escapes forward slashes in rpc url
sed -e "s/1231412312412412/$CHAIN_ID/" -e "s/networks.hardhat.forking.url/$RPC/" -e "s/927838194710231/$BLK/" hardhat.config.ts >temp
mv temp hardhat.config.ts
npx hardhat run ./scripts/config.ts > >(tee -a /chainhop-contracts/home/fork.log) 2>&1
