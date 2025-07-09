// Global test setup file
// This file runs before all tests and sets up the testing environment

import { beforeAll, afterAll } from 'bun:test';

// Global test setup
beforeAll(() => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';

  // Mock console methods in test environment to reduce noise
  if (process.env.SILENT_TESTS === 'true') {
    console.log = () => {};
    console.warn = () => {};
    console.info = () => {};
  }

  // Set default timezone for consistent date/time testing
  process.env.TZ = 'UTC';
});

// Global test cleanup
afterAll(() => {
  // Clean up any global state if needed
});

// Global test configuration
export const TEST_CONFIG = {
  // Default test addresses
  TEST_ADDRESSES: {
    WALLET: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    RECIPIENT: '0x2CE4EaF47CACFbC6590686f8f7521e0385822334',
    TOKEN_USDC: '0x2222222222222222222222222222222222222222',
    TOKEN_USDT: '0x3333333333333333333333333333333333333333',
    UNISWAP_ROUTER: '0x4444444444444444444444444444444444444444',
  },

  // Default test chain configuration
  TEST_CHAIN: {
    NAME: 'fair-testnet',
    ID: 1088,
    NATIVE_TOKEN: 'FAIR',
  },

  // Default test amounts
  TEST_AMOUNTS: {
    SMALL: '0.001',
    MEDIUM: '1.0',
    LARGE: '1000.0',
  },

  // Test transaction hashes
  TEST_TX_HASH: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',

  // Test timeouts
  TIMEOUTS: {
    QUICK: 5000,
    MEDIUM: 15000,
    LONG: 30000,
  },
};
