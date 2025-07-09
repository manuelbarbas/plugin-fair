import { describe, it, expect, beforeEach, mock, spyOn } from 'bun:test';
import { TransferAction } from '../actions/transfer';
import { createMockRuntime, setupActionTest } from './test-utils';
import type { MockRuntime } from './test-utils';
import type { TransferParams } from '../types';
import { parseEther, parseUnits } from 'viem';

// Mock wallet provider factory
const createMockWalletProvider = (customMocks = {}) => {
  const mockProvider = {
    getAddress: mock().mockReturnValue('0x742d35Cc6634C0532925a3b844Bc454e4438f44e'),
    formatAddress: mock().mockResolvedValue('0x2CE4EaF47CACFbC6590686f8f7521e0385822334'),
    isChainSupported: mock().mockReturnValue(true),
    getChainNativetToken: mock().mockReturnValue('FAIR'),
    getCurrentChain: mock().mockReturnValue({
      id: 1088,
      nativeCurrency: { symbol: 'FAIR' },
    }),
    getChainToken: mock().mockImplementation((chainName, token) => {
      const tokens = {
        USDC: '0x2222222222222222222222222222222222222222',
        USDT: '0x3333333333333333333333333333333333333333',
      };
      return tokens[token] || null;
    }),
    sendTransaction: mock().mockImplementation(async function (chainName, transaction, isBite) {
      // Simulate the actual wallet provider behavior
      if (isBite) {
        // Call encryptTx when isBite is true to match real implementation
        await this.encryptTx('rpc-url', transaction);
      }
      return '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    }),
    getPublicClient: mock().mockReturnValue({
      waitForTransactionReceipt: mock().mockResolvedValue({
        status: 'success',
        transactionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      }),
    }),
    getWalletClient: mock().mockReturnValue({}),
    readContract: mock().mockImplementation((chainName, address, abi, functionName, args) => {
      if (functionName === 'decimals') {
        return Promise.resolve(18);
      }
      return Promise.resolve(0);
    }),
    encryptTx: mock().mockResolvedValue('0xencrypted_data'),
    ...customMocks,
  };

  return mockProvider;
};

describe('TransferAction', () => {
  let action: TransferAction;
  let mockWalletProvider: any;

  beforeEach(() => {
    mockWalletProvider = createMockWalletProvider();
    action = new TransferAction(mockWalletProvider);
  });

  describe('transfer', () => {
    it('should transfer native tokens', async () => {
      const params: TransferParams = {
        chainName: 'fair-testnet',
        token: 'FAIR',
        amount: '1.0',
        toAddress: '0x2CE4EaF47CACFbC6590686f8f7521e0385822334',
        isBite: false,
      };

      const result = await action.transfer(params);

      expect(result.chainName).toBe('fair-testnet');
      expect(result.recipient).toBe('0x2CE4EaF47CACFbC6590686f8f7521e0385822334');
      expect(result.token).toBe('FAIR');
      expect(result.amount).toBe('1.0');
      expect(result.txHash).toBe(
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      );
      expect(mockWalletProvider.sendTransaction).toHaveBeenCalled();
    });

    it('should transfer ERC20 tokens', async () => {
      const params: TransferParams = {
        chainName: 'fair-testnet',
        token: 'USDC',
        amount: '100.0',
        toAddress: '0x2CE4EaF47CACFbC6590686f8f7521e0385822334',
        isBite: false,
      };

      const result = await action.transfer(params);

      expect(result.chainName).toBe('fair-testnet');
      expect(result.recipient).toBe('0x2CE4EaF47CACFbC6590686f8f7521e0385822334');
      expect(result.token).toBe('USDC');
      expect(result.amount).toBe('100.0');
      expect(result.txHash).toBe(
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      );
    });

    it('should handle Bite encryption when enabled', async () => {
      const params: TransferParams = {
        chainName: 'fair-testnet',
        token: 'FAIR',
        amount: '1.0',
        toAddress: '0x2CE4EaF47CACFbC6590686f8f7521e0385822334',
        isBite: true,
      };

      const result = await action.transfer(params);

      expect(result.txHash).toBe(
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      );
      expect(mockWalletProvider.encryptTx).toHaveBeenCalled();
    });

    it('should throw error for unsupported chain', async () => {
      mockWalletProvider.isChainSupported.mockReturnValue(false);

      const params: TransferParams = {
        chainName: 'unsupported',
        token: 'FAIR',
        amount: '1.0',
        toAddress: '0x2CE4EaF47CACFbC6590686f8f7521e0385822334',
      };

      await expect(action.transfer(params)).rejects.toThrow("Chain 'unsupported' is not supported");
    });

    it('should handle transfer with additional data', async () => {
      const params: TransferParams = {
        chainName: 'fair-testnet',
        token: 'FAIR',
        amount: '1.0',
        toAddress: '0x2CE4EaF47CACFbC6590686f8f7521e0385822334',
        data: '0x1234567890abcdef',
        isBite: false,
      };

      const result = await action.transfer(params);

      expect(result.txHash).toBe(
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      );
    });

    it('should default to native token when token is null', async () => {
      const params: TransferParams = {
        chainName: 'fair-testnet',
        token: null as any,
        amount: '1.0',
        toAddress: '0x2CE4EaF47CACFbC6590686f8f7521e0385822334',
        isBite: false,
      };

      const result = await action.transfer(params);

      expect(result.token).toBe('FAIR');
      expect(result.txHash).toBe(
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      );
    });

    it('should handle ERC20 transfer with 6 decimals', async () => {
      mockWalletProvider.readContract.mockImplementation(
        (chainName, address, abi, functionName, args) => {
          if (functionName === 'decimals') {
            return Promise.resolve(6); // USDC has 6 decimals
          }
          return Promise.resolve(0);
        }
      );

      const params: TransferParams = {
        chainName: 'fair-testnet',
        token: 'USDC',
        amount: '100.0',
        toAddress: '0x2CE4EaF47CACFbC6590686f8f7521e0385822334',
        isBite: false,
      };

      const result = await action.transfer(params);

      expect(result.amount).toBe('100.0');
      expect(result.token).toBe('USDC');
    });

    it('should throw error when transaction hash is not received', async () => {
      mockWalletProvider.sendTransaction.mockResolvedValue('0x');

      const params: TransferParams = {
        chainName: 'fair-testnet',
        token: 'USDC',
        amount: '100.0',
        toAddress: '0x2CE4EaF47CACFbC6590686f8f7521e0385822334',
        isBite: false,
      };

      await expect(action.transfer(params)).rejects.toThrow('Get transaction hash failed');
    });
  });

  describe('validateAndNormalizeParams', () => {
    it('should throw error for missing toAddress', async () => {
      const params: TransferParams = {
        chainName: 'fair-testnet',
        token: 'FAIR',
        amount: '1.0',
        toAddress: null as any,
      };

      await expect(action.validateAndNormalizeParams(params)).rejects.toThrow(
        'To address is required'
      );
    });

    it('should format the toAddress', async () => {
      const params: TransferParams = {
        chainName: 'fair-testnet',
        token: 'FAIR',
        amount: '1.0',
        toAddress: 'some-address' as `0x${string}`,
      };

      await action.validateAndNormalizeParams(params);

      expect(mockWalletProvider.formatAddress).toHaveBeenCalledWith('some-address');
      expect(params.toAddress).toBe('0x2CE4EaF47CACFbC6590686f8f7521e0385822334');
    });

    it('should throw error for zero amount', async () => {
      const params: TransferParams = {
        chainName: 'fair-testnet',
        token: 'FAIR',
        amount: '0',
        toAddress: '0x2CE4EaF47CACFbC6590686f8f7521e0385822334',
      };

      await expect(action.validateAndNormalizeParams(params)).rejects.toThrow(
        'Amount must be greater than 0'
      );
    });

    it('should throw error for negative amount', async () => {
      const params: TransferParams = {
        chainName: 'fair-testnet',
        token: 'FAIR',
        amount: '-1.0',
        toAddress: '0x2CE4EaF47CACFbC6590686f8f7521e0385822334',
      };

      await expect(action.validateAndNormalizeParams(params)).rejects.toThrow(
        'Amount cannot be negative'
      );
    });

    it('should handle null data parameter', async () => {
      const params: TransferParams = {
        chainName: 'fair-testnet',
        token: 'FAIR',
        amount: '1.0',
        toAddress: '0x2CE4EaF47CACFbC6590686f8f7521e0385822334',
        data: 'null' as any,
      };

      await action.validateAndNormalizeParams(params);

      expect(params.data).toBe('0x');
    });

    it('should allow valid amounts', async () => {
      const params: TransferParams = {
        chainName: 'fair-testnet',
        token: 'FAIR',
        amount: '1.5',
        toAddress: '0x2CE4EaF47CACFbC6590686f8f7521e0385822334',
      };

      await expect(action.validateAndNormalizeParams(params)).resolves.toBeUndefined();
    });

    it('should handle undefined amount', async () => {
      const params: TransferParams = {
        chainName: 'fair-testnet',
        token: 'FAIR',
        amount: undefined,
        toAddress: '0x2CE4EaF47CACFbC6590686f8f7521e0385822334',
      };

      await expect(action.validateAndNormalizeParams(params)).resolves.toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle native token when specified as chainNativeToken', async () => {
      const params: TransferParams = {
        chainName: 'fair-testnet',
        token: 'FAIR', // This matches the native token
        amount: '1.0',
        toAddress: '0x2CE4EaF47CACFbC6590686f8f7521e0385822334',
        isBite: false,
      };

      const result = await action.transfer(params);

      expect(result.token).toBe('FAIR');
      expect(result.amount).toBe('1.0');
    });

    it('should handle empty string token', async () => {
      const params: TransferParams = {
        chainName: 'fair-testnet',
        token: '',
        amount: '1.0',
        toAddress: '0x2CE4EaF47CACFbC6590686f8f7521e0385822334',
        isBite: false,
      };

      const result = await action.transfer(params);

      expect(result.token).toBe('FAIR'); // Should default to native token
    });

    it('should handle string "null" token', async () => {
      const params: TransferParams = {
        chainName: 'fair-testnet',
        token: 'null',
        amount: '1.0',
        toAddress: '0x2CE4EaF47CACFbC6590686f8f7521e0385822334',
        isBite: false,
      };

      const result = await action.transfer(params);

      expect(result.token).toBe('FAIR'); // Should default to native token
    });

    it('should handle data parameter correctly', async () => {
      const params: TransferParams = {
        chainName: 'fair-testnet',
        token: 'FAIR',
        amount: '1.0',
        toAddress: '0x2CE4EaF47CACFbC6590686f8f7521e0385822334',
        data: '0x123456',
        isBite: false,
      };

      const result = await action.transfer(params);

      expect(result.txHash).toBe(
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      );
    });
  });
});
