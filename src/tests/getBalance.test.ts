import { describe, it, expect, beforeEach, mock, spyOn } from 'bun:test';
import { GetBalanceAction } from '../actions/getBalance';
import { createMockRuntime, setupActionTest } from './test-utils';
import type { MockRuntime } from './test-utils';
import type { GetBalanceParams } from '../types';
import { formatUnits } from 'viem';

// Mock wallet provider factory
const createMockWalletProvider = (customMocks = {}) => {
  return {
    getAddress: mock().mockReturnValue('0x742d35Cc6634C0532925a3b844Bc454e4438f44e'),
    getBalance: mock().mockResolvedValue('1000.0'),
    getCurrentChain: mock().mockReturnValue({
      id: 1088,
      nativeCurrency: { symbol: 'FAIR' },
    }),
    getChainNativetToken: mock().mockReturnValue('FAIR'),
    getChainToken: mock().mockReturnValue('0x1234567890123456789012345678901234567890'),
    getChainConfig: mock().mockReturnValue({
      tokens: { USDC: '0x123', USDT: '0x456' },
      nativeToken: 'FAIR',
    }),
    readContract: mock().mockImplementation((chainName, address, abi, functionName, args) => {
      if (functionName === 'balanceOf') {
        return Promise.resolve(BigInt('1000000000000000000')); // 1 token with 18 decimals
      }
      if (functionName === 'decimals') {
        return Promise.resolve(18);
      }
      return Promise.resolve(0);
    }),
    ...customMocks,
  };
};

describe('GetBalanceAction', () => {
  let action: GetBalanceAction;
  let mockWalletProvider: any;

  beforeEach(() => {
    mockWalletProvider = createMockWalletProvider();
    action = new GetBalanceAction(mockWalletProvider);
  });

  describe('getBalance', () => {
    it('should return native token balance when no token is specified', async () => {
      const params: GetBalanceParams = {
        chainName: 'fair-testnet',
        address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        token: 'FAIR',
      };

      const result = await action.getBalance(params);

      expect(result.chainName).toBe('fair-testnet');
      expect(result.address).toBe('0x742d35Cc6634C0532925a3b844Bc454e4438f44e');
      expect(result.balance).toBeDefined();
      expect(result.balance?.token).toBe('FAIR');
      expect(result.balance?.amount).toBe('1000.0');
      expect(mockWalletProvider.getBalance).toHaveBeenCalledWith('fair-testnet');
    });

    it('should return ERC20 token balance for specified token', async () => {
      const params: GetBalanceParams = {
        chainName: 'fair-testnet',
        address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        token: 'USDC',
      };

      const result = await action.getBalance(params);

      expect(result.chainName).toBe('fair-testnet');
      expect(result.address).toBe('0x742d35Cc6634C0532925a3b844Bc454e4438f44e');
      expect(result.balance).toBeDefined();
      expect(result.balance?.token).toBe('USDC');
      expect(result.balance?.amount).toBe('1'); // 1000000000000000000 / 10^18
      expect(mockWalletProvider.readContract).toHaveBeenCalledWith(
        'fair-testnet',
        '0x1234567890123456789012345678901234567890',
        expect.anything(),
        'balanceOf',
        ['0x742d35Cc6634C0532925a3b844Bc454e4438f44e']
      );
    });

    it('should handle token address directly', async () => {
      const tokenAddress = '0x9876543210987654321098765432109876543210';
      const params: GetBalanceParams = {
        chainName: 'fair-testnet',
        address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        token: tokenAddress,
      };

      const result = await action.getBalance(params);

      expect(result.balance?.token).toBe(tokenAddress);
      expect(mockWalletProvider.readContract).toHaveBeenCalledWith(
        'fair-testnet',
        tokenAddress,
        expect.anything(),
        'balanceOf',
        ['0x742d35Cc6634C0532925a3b844Bc454e4438f44e']
      );
    });

    it('should throw error for unsupported token', async () => {
      mockWalletProvider.getChainToken.mockImplementation(() => {
        throw new Error('Token UNSUPPORTED is not supported on Skale fair-testnet.');
      });

      const params: GetBalanceParams = {
        chainName: 'fair-testnet',
        address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        token: 'UNSUPPORTED',
      };

      await expect(action.getBalance(params)).rejects.toThrow(
        'Token UNSUPPORTED is not supported on Skale fair-testnet.'
      );
    });
  });

  describe('validateAndNormalizeParams', () => {
    it('should default to fair-testnet chain when no chain specified', async () => {
      const params: GetBalanceParams = {
        chainName: '',
        token: 'FAIR',
      };

      await action.validateAndNormalizeParams(params);

      expect(params.chainName).toBe('fair-testnet');
    });

    it('should use wallet address when no address provided', async () => {
      const params: GetBalanceParams = {
        chainName: 'fair-testnet',
        token: 'FAIR',
      };

      await action.validateAndNormalizeParams(params);

      expect(params.address).toBe('0x742d35Cc6634C0532925a3b844Bc454e4438f44e');
      expect(mockWalletProvider.getAddress).toHaveBeenCalled();
    });

    it('should handle invalid address strings', async () => {
      const params: GetBalanceParams = {
        chainName: 'fair-testnet',
        address: 'null' as any,
        token: 'FAIR',
      };

      await action.validateAndNormalizeParams(params);

      expect(params.address).toBe('0x742d35Cc6634C0532925a3b844Bc454e4438f44e');
    });

    it('should use valid hex addresses directly', async () => {
      const validAddress = '0x1234567890123456789012345678901234567890';
      const params: GetBalanceParams = {
        chainName: 'fair-testnet',
        address: validAddress,
        token: 'FAIR',
      };

      await action.validateAndNormalizeParams(params);

      expect(params.address).toBe(validAddress);
    });

    it('should fallback to wallet address for token symbols passed as address', async () => {
      mockWalletProvider.getChainConfig.mockReturnValue({
        tokens: { USDC: '0x123', USDT: '0x456' },
        nativeToken: 'FAIR',
      });

      const params: GetBalanceParams = {
        chainName: 'fair-testnet',
        address: 'USDC' as any,
        token: 'FAIR',
      };

      await action.validateAndNormalizeParams(params);

      expect(params.address).toBe('0x742d35Cc6634C0532925a3b844Bc454e4438f44e');
    });
  });

  describe('getERC20TokenBalance', () => {
    it('should return formatted token balance', async () => {
      const balance = await action.getERC20TokenBalance(
        'fair-testnet',
        '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        '0x1234567890123456789012345678901234567890'
      );

      expect(balance).toBe('1');
      expect(mockWalletProvider.readContract).toHaveBeenCalledWith(
        'fair-testnet',
        '0x1234567890123456789012345678901234567890',
        expect.anything(),
        'balanceOf',
        ['0x742d35Cc6634C0532925a3b844Bc454e4438f44e']
      );
      expect(mockWalletProvider.readContract).toHaveBeenCalledWith(
        'fair-testnet',
        '0x1234567890123456789012345678901234567890',
        expect.anything(),
        'decimals',
        []
      );
    });

    it('should handle different token decimals', async () => {
      mockWalletProvider.readContract.mockImplementation(
        (chainName, address, abi, functionName, args) => {
          if (functionName === 'balanceOf') {
            return Promise.resolve(BigInt('1000000')); // 1 token with 6 decimals
          }
          if (functionName === 'decimals') {
            return Promise.resolve(6); // USDC has 6 decimals
          }
          return Promise.resolve(0);
        }
      );

      const balance = await action.getERC20TokenBalance(
        'fair-testnet',
        '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        '0x1234567890123456789012345678901234567890'
      );

      expect(balance).toBe('1'); // 1000000 / 10^6
    });
  });
});
