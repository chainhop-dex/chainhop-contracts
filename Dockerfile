FROM node:16.14.0 AS builder
WORKDIR /chainhop-contracts
ADD package.json yarn.lock /chainhop-contracts/
RUN yarn
ADD contracts /chainhop-contracts/contracts
ADD hardhat.config.ts tsconfig.json /chainhop-contracts/
RUN yarn compile

FROM node:16.14.0
WORKDIR /chainhop-contracts
COPY --from=builder /chainhop-contracts /chainhop-contracts
ADD scripts /chainhop-contracts/scripts
ADD deploy /chainhop-contracts/deploy
ADD configs /chainhop-contracts/configs
VOLUME /chainhop-contracts/home
EXPOSE 8545
ENTRYPOINT ["scripts/fork.sh"]
