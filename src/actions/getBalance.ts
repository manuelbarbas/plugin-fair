import {
  composePromptFromState,
  parseKeyValueXml,
  elizaLogger,
  type HandlerCallback,
  ModelType,
  type IAgentRuntime,
  type Memory,
  type State,
  type Content,
} from '@elizaos/core';

import {
  initWalletProvider,
  initFairWalletProvider,
  type WalletProvider,
} from '../providers/wallet';
import { getBalanceTemplate } from '../templates';
import type { GetBalanceParams, GetBalanceResponse } from '../types';
import { type Address, erc20Abi, formatEther, formatUnits } from 'viem';

export { getBalanceTemplate };

// Content interface for getBalance action
interface GetBalanceContent extends Content {
  chain: string;
  address?: string;
  token?: string;
}

// Validation function for getBalance content
function isGetBalanceContent(_runtime: IAgentRuntime, content: any): content is GetBalanceContent {
  elizaLogger.debug('GetBalance content for validation', content);
  return content && typeof content.chain === 'string';
}

export class GetBalanceAction {
  constructor(private walletProvider: WalletProvider) {
    this.walletProvider = walletProvider;
  }

  async getBalance(params: GetBalanceParams): Promise<GetBalanceResponse> {
    elizaLogger.debug('Get balance params:', params);
    await this.validateAndNormalizeParams(params);
    elizaLogger.debug('Normalized get balance params:', params);

    const { chainName, address, token } = params;
    if (!address) {
      throw new Error('Address is required for getting balance');
    }

    const nativeSymbol = this.walletProvider.getCurrentChain(params.chainName).nativeCurrency
      .symbol;
    const chainId = this.walletProvider.getCurrentChain(params.chainName).id;

    let queryNativeToken = false;
    if (
      !token ||
      token === '' ||
      token.toUpperCase() === this.walletProvider.getChainNativetToken(params.chainName)
    ) {
      queryNativeToken = true;
    }

    const resp: GetBalanceResponse = {
      chainName,
      address,
    };

    // If ERC20 token is requested
    if (!queryNativeToken) {
      let amount: string;
      if (token.startsWith('0x')) {
        amount = await this.getERC20TokenBalance(chainName, address, token as `0x${string}`);
      } else {
        const tokenAddress = this.walletProvider.getChainToken(params.chainName, token);
        if (!tokenAddress) {
          throw new Error(`Token ${token} is not supported.`);
        }
        amount = await this.getERC20TokenBalance(chainName, address, tokenAddress as `0x${string}`);
      }

      resp.balance = { token, amount };
    } else {
      // If native token is requested
      const balance = await this.walletProvider.getBalance(params.chainName);
      resp.balance = {
        token: nativeSymbol,
        amount: balance,
      };
    }

    return resp;
  }

  async getERC20TokenBalance(chainName, address: Address, tokenAddress: Address): Promise<string> {
    const balance = await this.walletProvider.readContract(
      chainName,
      tokenAddress,
      erc20Abi,
      'balanceOf',
      [address]
    );
    const decimals = await this.walletProvider.readContract(
      chainName,
      tokenAddress,
      erc20Abi,
      'decimals',
      []
    );

    return formatUnits(balance, decimals);
  }

  async validateAndNormalizeParams(params: GetBalanceParams): Promise<void> {
    try {
      // If no chain specified, default to fair-testnet
      if (!params.chainName) {
        params.chainName = 'fair-testnet';
      }

      // If no address provided, use the wallet's own address
      if (!params.address) {
        params.address = this.walletProvider.getAddress();
        elizaLogger.debug(`No address provided, using wallet address: ${params.address}`);
        return;
      }

      // Convert address to string for string comparisons
      const addressStr = String(params.address);

      // If address is null or invalid strings, use wallet address
      if (addressStr === 'null' || addressStr === 'undefined') {
        params.address = this.walletProvider.getAddress();
        elizaLogger.debug(
          `Invalid address string provided, using wallet address: ${params.address}`
        );
        return;
      }

      // If address already looks like a valid hex address, use it directly
      if (addressStr.startsWith('0x') && addressStr.length === 42) {
        elizaLogger.debug(`Using valid hex address: ${params.address}`);
        return;
      }

      // Skip web3 name resolution for common token names that might have been
      // mistakenly parsed as addresses

      const config = this.walletProvider.getChainConfig(params.chainName);

      let commonTokens: string[] = Object.keys(config.tokens);

      commonTokens.push(config.nativeToken);

      if (commonTokens.includes(addressStr.toUpperCase())) {
        elizaLogger.debug(
          `Address looks like a token symbol: ${params.address}, using wallet address instead`
        );
        params.address = this.walletProvider.getAddress();
        return;
      }


      // If we can't resolve, but it looks like a potential wallet address, try to use it
      if (addressStr.startsWith('0x')) {
        elizaLogger.warn(
          `Address "${params.address}" doesn't look like a standard Ethereum address but will be used as is`
        );
        return;
      }

      // If we get here, we couldn't parse the address at all
      // Fall back to the wallet's address
      elizaLogger.warn(
        `Could not resolve address: ${params.address}, falling back to wallet address`
      );
      params.address = this.walletProvider.getAddress();
    } catch (error) {
      elizaLogger.error(
        `Error validating address: ${error instanceof Error ? error.message : String(error)}`
      );
      // Fall back to wallet's own address if there's an error
      params.address = this.walletProvider.getAddress();
    }
  }
}

// Direct export of the action for use in the main plugin
export const getBalanceAction = {
  name: 'getBalance',
  description: 'Get balance of a token or all tokens for the given address',
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: Record<string, unknown>,
    callback?: HandlerCallback
  ) => {
    elizaLogger.log('Starting getBalance action...');

    // Update state with recent messages
    let currentState = await runtime.composeState(message, ['RECENT_MESSAGES']);
    state.walletInfo = await initWalletProvider.get(runtime, message, currentState);

    // Compose getBalance prompt
    const getBalancePrompt = composePromptFromState({
      state: currentState,
      template: getBalanceTemplate,
    });
    const result = await runtime.useModel(ModelType.TEXT_LARGE, {
      prompt: getBalancePrompt,
    });
    const content = parseKeyValueXml(result);

    // Validate content
    if (!isGetBalanceContent(runtime, content)) {
      elizaLogger.error('Invalid content for getBalance action.');
      callback?.({
        text: 'Unable to process balance request. Invalid content provided.',
        content: { error: 'Invalid content' },
      });
      return false;
    }

    const getBalanceOptions: GetBalanceParams = {
      chainName: content.chain as string,
      address: content.address as `0x${string}` | undefined,
      token: content.token || 'FAIR',
    };

    try {
      const walletProvider = initFairWalletProvider(runtime);
      const action = new GetBalanceAction(walletProvider);
      const getBalanceResp = await action.getBalance(getBalanceOptions);
      if (callback) {
        let text = `No balance found for ${getBalanceOptions.address} on ${getBalanceOptions.chainName}`;
        if (getBalanceResp.balance) {
          text = `Balance of ${getBalanceResp.address} on ${getBalanceResp.chainName}:\n${
            getBalanceResp.balance.token
          }: ${getBalanceResp.balance.amount}`;
        }
        callback({
          text,
          content: { ...getBalanceResp },
        });
      }
      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      elizaLogger.error('Error during get balance:', errorMessage);

      // Provide more user-friendly error messages based on error type
      let userMessage = `Get balance failed: ${errorMessage}`;

      // Check for common error cases
      if (errorMessage.includes('not supported on Fair')) {
        userMessage = `Token not supported. ${errorMessage}`;
      } else if (errorMessage.includes('No URL was provided')) {
        userMessage = `Network connection issue. Please try again later.`;
      } else if (errorMessage.includes('Invalid address')) {
        userMessage = `The address provided is invalid. Please provide a valid wallet address.`;
      } else if (errorMessage.includes('Cannot read properties')) {
        userMessage = `There was an issue processing your request. Please check your inputs and try again.`;
      }

      callback?.({
        text: userMessage,
        content: {
          error: errorMessage,
          chain: content.chain,
          token: content.token,
        },
      });
      return false;
    }
  },
  template: getBalanceTemplate,
  validate: async (_runtime: IAgentRuntime) => {
    return true;
  },
  examples: [
    [
      {
        name: '{{user1}}',
        content: {
          text: 'Check my balance of USDT',
        },
      },
      {
        name: '{{agent}}',
        content: {
          text: "I'll help you check your balance of USDT",
          action: 'GET_BALANCE',
          content: {
            chain: 'fair-testnet',
            address: '{{walletAddress}}',
            token: 'USDT',
          },
        },
      },
    ],
    [
      {
        name: '{{user1}}',
        content: {
          text: 'Check my balance of token 0x1234',
        },
      },
      {
        name: '{{agent}}',
        content: {
          text: "I'll help you check your balance of token 0x1234",
          action: 'GET_BALANCE',
          content: {
            chain: 'fair-testnet',
            address: '{{walletAddress}}',
            token: '0x1234',
          },
        },
      },
    ],
    [
      {
        name: '{{user1}}',
        content: {
          text: 'Get USDC balance of 0x1234',
        },
      },
      {
        name: '{{agent}}',
        content: {
          text: "I'll help you check USDC balance of 0x1234",
          action: 'GET_BALANCE',
          content: {
            chain: 'fair-testnet',
            address: '0x1234',
            token: 'USDC',
          },
        },
      },
    ],
    [
      {
        name: '{{user1}}',
        content: {
          text: 'Check my wallet balance on Fair',
        },
      },
      {
        name: '{{agent}}',
        content: {
          text: "I'll help you check your wallet balance on Fair",
          action: 'GET_BALANCE',
          content: {
            chain: 'fair-testnet',
            address: '{{walletAddress}}',
            token: undefined,
          },
        },
      },
    ],
  ],
  similes: ['GET_BALANCE', 'CHECK_BALANCE'],
};
