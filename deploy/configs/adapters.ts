import { IBridgeAdapterConfig } from './types';

// configures the deployed bridge adapters for each chain so that when upgrade for only main contract
// is needed, the bridge adapters can be reused
export const bridgeAdapters: IBridgeAdapterConfig = {
  1: [
    { type: 'cbridge', address: '0x0136f1579aD5baF0154f2Aa1e6C278d27341111a' },
    { type: 'anyswap', address: '0x9164e7EE53e6934d58dCd1aae902ec04E2aC5977' },
    { type: 'stargate', address: '0x9A49F2f31c469057E6B397023864134833F0df37' },
    { type: 'across', address: '0x8d51DCf6Ee1D384e1976bAF417922409229c294F' }
  ],

  10: [
    { type: 'cbridge', address: '0x6ECe0fbB1ed61CA4186FA5345766DAfD5713818D' },
    { type: 'anyswap', address: '0x4effDb9bF554D6e4CBcD18513741C19e31Dda299' },
    { type: 'stargate', address: '0xB818378d1C7D8a28873e60313734Ad8b809c61B9' },
    { type: 'across', address: '0x13e25B709eF6d707afb699E86CA85a76F7e75BE4' }
  ],

  56: [
    { type: 'cbridge', address: '0xB7c24C8c783259C8B870974F549570E58e2c4FDd' },
    { type: 'anyswap', address: '0xcecA0A7C061ae03548349cE6efEfF0995B0ABBc3' },
    { type: 'stargate', address: '0xd3B2A3A3Faef1501755b290089d4dAaFdb6167c7' }
  ],

  137: [
    { type: 'cbridge', address: '0xA421b613b73545dAEb527F19B74b780280fd2159' },
    { type: 'anyswap', address: '0xa25cc478c41B6864982ECC22Fc058976f40F8B1B' },
    { type: 'stargate', address: '0xd1349E2C674AaB21A91569b3058D7A5edBed4382' },
    { type: 'across', address: '0x54a7DF14450e97546d74060A1B7187d885509AF4' }
  ],

  250: [
    { type: 'cbridge', address: '0xA421b613b73545dAEb527F19B74b780280fd2159' },
    { type: 'anyswap', address: '0x9b441d572b6ea495763f64da81c520f44a90c7c8' },
    { type: 'stargate', address: '0xd1349E2C674AaB21A91569b3058D7A5edBed4382' }
  ],

  42161: [
    { type: 'cbridge', address: '0x9164e7EE53e6934d58dCd1aae902ec04E2aC5977' },
    { type: 'anyswap', address: '0xa25cc478c41B6864982ECC22Fc058976f40F8B1B' },
    { type: 'stargate', address: '0x3bAD85e4764Df351810a652C654C28fc663F5B1D' }
  ],

  43114: [
    { type: 'cbridge', address: '0x2A43Bd80335c7b66d9Ef5B3cA4e7b6938d9935f3' },
    { type: 'anyswap', address: '0x08EeD2812807F68d2670E0B24927b84a8AF07E61' },
    { type: 'stargate', address: '0xCD4426Cf5f4058f4dEBD7bb3806D0f5Bf2C42049' }
  ]
};
