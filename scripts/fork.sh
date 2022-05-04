#!/bin/bash
echo chainId $CHAIN_ID rpc $RPC blk $BLK
RPC=$(echo $RPC | sed 's/\//\\\//g') # escapes forward slashes in rpc url
sed -e "s/1231412312412412/$CHAIN_ID/" -e "s/networks.hardhat.forking.url/$RPC/" -e "s/927838194710231/$BLK/" hardhat.config.ts >temp
mv temp hardhat.config.ts
npx hardhat node --tags TransferSwapper,Multicall2 --hostname 0.0.0.0
