export * from './actions/transfer';
export * from './actions/swap';
export * from './actions/getBalance';
export * from './providers/wallet';
export * from './types';
export * from './environment';

import type { Plugin } from '@elizaos/core';
import { transferAction } from './actions/transfer';
import { swapAction } from './actions/swap';
import { getBalanceAction } from './actions/getBalance';
import { initWalletProvider } from './providers/wallet';

const actions = [getBalanceAction, transferAction, swapAction];

// Create plugin object directly matching the Skale plugin pattern
export const skalePlugin: Plugin = {
  name: 'skale',
  description:
    'Skale Idealistic testnet integration plugin supporting transfers, swaps, and liquidity operations using Uniswap V2',
  providers: [initWalletProvider],
  services: [],
  actions: actions as any,
  evaluators: [],
};

export default skalePlugin;
