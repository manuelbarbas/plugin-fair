import { describe, it, expect, beforeEach, mock, spyOn } from 'bun:test';
import { SwapAction } from '../actions/swap';
import { createMockRuntime, setupActionTest } from './test-utils';
import type { MockRuntime } from './test-utils';
import type { SwapParams } from '../types';
import { parseUnits } from 'viem';

// Mock wallet provider factory
const createMockWalletProvider = (customMocks = {}) => {
  return {
    getAddress: mock().mockReturnValue('0x742d35Cc6634C0532925a3b844Bc454e4438f44e'),
    isChainSupported: mock().mockReturnValue(true),
    getCurrentChain: mock().mockReturnValue({
      id: 1088,
      nativeCurrency: { symbol: 'FAIR' },
    }),
    getChainToken: mock().mockImplementation((chainName, token) => {
      const tokens = {
        WFAIR: '0x1111111111111111111111111111111111111111',
        USDC: '0x2222222222222222222222222222222222222222',
        USDT: '0x3333333333333333333333333333333333333333',
      };
      return tokens[token] || null;
    }),
    getChainUniswapRouter: mock().mockReturnValue('0x4444444444444444444444444444444444444444'),
    readContract: mock().mockImplementation((chainName, address, abi, functionName, args) => {
      if (functionName === 'decimals') {
        return Promise.resolve(18);
      }
      if (functionName === 'getAmountsOut') {
        return Promise.resolve([args[0], BigInt('500000000000000000')]); // 0.5 output for 1 input
      }
      if (functionName === 'allowance') {
        return Promise.resolve(BigInt('0')); // No allowance initially
      }
      return Promise.resolve(0);
    }),
    sendTransaction: mock().mockImplementation(async function (chainName, transaction, isBite) {
      // Simulate the actual wallet provider behavior
      if (isBite) {
        // Call encryptTx when isBite is true to match real implementation
        await this.encryptTx('rpc-url', transaction);
      }
      return '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    }),
    waitForTx: mock().mockResolvedValue(undefined),
    encryptTx: mock().mockResolvedValue('0xencrypted_data'),
    ...customMocks,
  };
};

describe('SwapAction', () => {
  let action: SwapAction;
  let mockWalletProvider: any;

  beforeEach(() => {
    mockWalletProvider = createMockWalletProvider();
    action = new SwapAction(mockWalletProvider);
  });

  describe('swap', () => {
    it('should swap native token for ERC20 token', async () => {
      const params: SwapParams = {
        chainName: 'fair-testnet',
        inputToken: 'FAIR',
        outputToken: 'USDC',
        amount: '1.0',
        isBite: false,
      };

      const result = await action.swap(params);

      expect(result.chainName).toBe('fair-testnet');
      expect(result.inputToken).toBe('FAIR');
      expect(result.outputToken).toBe('USDC');
      expect(result.amountIn).toBe('1.0');
      expect(result.amountOut).toBe('0.5');
      expect(result.txHash).toBe(
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      );
      expect(mockWalletProvider.sendTransaction).toHaveBeenCalled();
      expect(mockWalletProvider.waitForTx).toHaveBeenCalled();
    });

    it('should swap ERC20 token for native token', async () => {
      const params: SwapParams = {
        chainName: 'fair-testnet',
        inputToken: 'USDC',
        outputToken: 'FAIR',
        amount: '1.0',
        isBite: false,
      };

      const result = await action.swap(params);

      expect(result.chainName).toBe('fair-testnet');
      expect(result.inputToken).toBe('USDC');
      expect(result.outputToken).toBe('FAIR');
      expect(result.txHash).toBe(
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      );
    });

    it('should swap ERC20 token for ERC20 token', async () => {
      const params: SwapParams = {
        chainName: 'fair-testnet',
        inputToken: 'USDC',
        outputToken: 'USDT',
        amount: '1.0',
        isBite: false,
      };

      const result = await action.swap(params);

      expect(result.chainName).toBe('fair-testnet');
      expect(result.inputToken).toBe('USDC');
      expect(result.outputToken).toBe('USDT');
      expect(result.txHash).toBe(
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      );
    });

    it('should handle Bite encryption when enabled', async () => {
      const params: SwapParams = {
        chainName: 'fair-testnet',
        inputToken: 'FAIR',
        outputToken: 'USDC',
        amount: '1.0',
        isBite: true,
      };

      const result = await action.swap(params);

      expect(result.txHash).toBe(
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      );
      expect(mockWalletProvider.encryptTx).toHaveBeenCalled();
    });

    it('should throw error for unsupported chain', async () => {
      mockWalletProvider.isChainSupported.mockReturnValue(false);

      const params: SwapParams = {
        chainName: 'unsupported',
        inputToken: 'FAIR',
        outputToken: 'USDC',
        amount: '1.0',
      };

      await expect(action.swap(params)).rejects.toThrow("Chain 'unsupported' is not supported.");
    });

    it('should throw error for unsupported token', async () => {
      mockWalletProvider.getChainToken.mockImplementation(() => {
        throw new Error('Token UNKNOWN is not supported on fair-testnet.');
      });

      const params: SwapParams = {
        chainName: 'fair-testnet',
        inputToken: 'UNKNOWN',
        outputToken: 'USDC',
        amount: '1.0',
      };

      await expect(action.swap(params)).rejects.toThrow(
        'Token UNKNOWN is not supported on fair-testnet.'
      );
    });

    it('should handle slippage parameter', async () => {
      const params: SwapParams = {
        chainName: 'fair-testnet',
        inputToken: 'FAIR',
        outputToken: 'USDC',
        amount: '1.0',
        slippage: 1.0, // 1% slippage
      };

      const result = await action.swap(params);

      expect(result.txHash).toBe(
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      );
    });
  });

  describe('validateAndNormalizeParams', () => {
    it('should throw error for missing inputToken', async () => {
      const params: SwapParams = {
        chainName: 'fair-testnet',
        inputToken: '',
        outputToken: 'USDC',
        amount: '1.0',
      };

      await expect(action.validateAndNormalizeParams(params)).rejects.toThrow(
        'Both inputToken and outputToken are required'
      );
    });

    it('should throw error for missing outputToken', async () => {
      const params: SwapParams = {
        chainName: 'fair-testnet',
        inputToken: 'FAIR',
        outputToken: '',
        amount: '1.0',
      };

      await expect(action.validateAndNormalizeParams(params)).rejects.toThrow(
        'Both inputToken and outputToken are required'
      );
    });

    it('should throw error for same input and output tokens', async () => {
      const params: SwapParams = {
        chainName: 'fair-testnet',
        inputToken: 'USDC',
        outputToken: 'USDC',
        amount: '1.0',
      };

      await expect(action.validateAndNormalizeParams(params)).rejects.toThrow(
        'Cannot swap the same token'
      );
    });

    it('should throw error for missing amount', async () => {
      const params: SwapParams = {
        chainName: 'fair-testnet',
        inputToken: 'FAIR',
        outputToken: 'USDC',
        amount: '',
      };

      await expect(action.validateAndNormalizeParams(params)).rejects.toThrow('Amount is required');
    });

    it('should throw error for zero amount', async () => {
      const params: SwapParams = {
        chainName: 'fair-testnet',
        inputToken: 'FAIR',
        outputToken: 'USDC',
        amount: '0',
      };

      await expect(action.validateAndNormalizeParams(params)).rejects.toThrow(
        'Amount must be greater than 0'
      );
    });

    it('should throw error for negative amount', async () => {
      const params: SwapParams = {
        chainName: 'fair-testnet',
        inputToken: 'FAIR',
        outputToken: 'USDC',
        amount: '-1.0',
      };

      await expect(action.validateAndNormalizeParams(params)).rejects.toThrow(
        'Amount must be greater than 0'
      );
    });

    it('should throw error for invalid slippage', async () => {
      const params: SwapParams = {
        chainName: 'fair-testnet',
        inputToken: 'FAIR',
        outputToken: 'USDC',
        amount: '1.0',
        slippage: -1,
      };

      await expect(action.validateAndNormalizeParams(params)).rejects.toThrow(
        'Slippage must be between 0 and 50 percent'
      );
    });

    it('should throw error for excessive slippage', async () => {
      const params: SwapParams = {
        chainName: 'fair-testnet',
        inputToken: 'FAIR',
        outputToken: 'USDC',
        amount: '1.0',
        slippage: 60,
      };

      await expect(action.validateAndNormalizeParams(params)).rejects.toThrow(
        'Slippage must be between 0 and 50 percent'
      );
    });
  });

  describe('resolveTokenAddress', () => {
    it('should handle direct token addresses', () => {
      const tokenAddress = '0x1234567890123456789012345678901234567890';
      const result = action['resolveTokenAddress'](tokenAddress, 'fair-testnet');

      expect(result.address).toBe(tokenAddress);
      expect(result.isNative).toBe(false);
    });

    it('should handle native token symbol', () => {
      const result = action['resolveTokenAddress']('FAIR', 'fair-testnet');

      expect(result.address).toBe('0x1111111111111111111111111111111111111111');
      expect(result.isNative).toBe(true);
    });

    it('should handle ERC20 token symbols', () => {
      const result = action['resolveTokenAddress']('USDC', 'fair-testnet');

      expect(result.address).toBe('0x2222222222222222222222222222222222222222');
      expect(result.isNative).toBe(false);
    });

    it('should throw error for unsupported token', () => {
      mockWalletProvider.getChainToken.mockReturnValue(null);

      expect(() => {
        action['resolveTokenAddress']('UNKNOWN', 'fair-testnet');
      }).toThrow('Token UNKNOWN is not supported on fair-testnet.');
    });
  });

  describe('calculateAmountOut', () => {
    it('should calculate expected output amount with slippage', async () => {
      const result = await action['calculateAmountOut'](
        BigInt('1000000000000000000'), // 1 token
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222',
        0.5, // 0.5% slippage
        'fair-testnet'
      );

      expect(result.amountOut).toBe(BigInt('500000000000000000')); // 0.5 token
      expect(result.amountOutMin).toBeLessThan(result.amountOut); // Should account for slippage
    });

    it('should handle calculation errors', async () => {
      mockWalletProvider.readContract.mockRejectedValue(new Error('Calculation failed'));

      await expect(
        action['calculateAmountOut'](
          BigInt('1000000000000000000'),
          '0x1111111111111111111111111111111111111111',
          '0x2222222222222222222222222222222222222222',
          0.5,
          'fair-testnet'
        )
      ).rejects.toThrow(
        'Unable to calculate swap amounts. Please check if liquidity exists for this pair.'
      );
    });
  });
});
