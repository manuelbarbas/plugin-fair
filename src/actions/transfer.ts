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
  parseEther,
  parseUnits,
  erc20Abi,
  type Hex,
  encodeFunctionData,
} from 'viem';

import {
  initWalletProvider,
  initFairWalletProvider,
  type WalletProvider,
} from '../providers/wallet';

import { transferTemplate } from '../templates';
import type { TransferParams, TransferResponse, EVMTransaction, BiteConfig } from '../types';

export { transferTemplate };

// Content interface for transfer action
interface TransferContent extends Content {
  chain: string;
  token?: string;
  amount?: string;
  toAddress: string;
  data?: string;
}

// Validation function for transfer content
function isTransferContent(_runtime: IAgentRuntime, content: any): content is TransferContent {
  elizaLogger.debug('Transfer content for validation', content);
  return content && typeof content.chain === 'string' && typeof content.toAddress === 'string';
}

// Exported for tests
export class TransferAction {
  private readonly TRANSFER_GAS = 1000000n;
  private readonly DEFAULT_GAS_PRICE = 1000000n as const;
  constructor(private walletProvider: WalletProvider) {}

  async transfer(params: TransferParams): Promise<TransferResponse> {
    // Check if the chain is supported
    if (!this.walletProvider.isChainSupported(params.chainName)) {
      elizaLogger.error(`Chain '${params.chainName}' is not supported`);
      throw new Error(`Chain '${params.chainName}' is not supported`);
    }

    // Handle data parameter - make sure it's not a string "null"
    // This must happen before validation to avoid type errors
    let dataParam: Hex | undefined = undefined;
    if (params.data && typeof params.data === 'string' && params.data.startsWith('0x')) {
      dataParam = params.data as Hex;
      elizaLogger.debug(`Using data parameter: ${dataParam}`);
    } else if (params.data) {
      elizaLogger.debug(`Ignoring invalid data parameter: ${params.data}`);
    }

    const chainNativeToken = this.walletProvider.getChainNativetToken(params.chainName);

    this.validateAndNormalizeParams(params);
    elizaLogger.debug('After address validation, params:', JSON.stringify(params, null, 2));

    const fromAddress = this.walletProvider.getAddress();
    elizaLogger.debug(`From address: ${fromAddress}`);

    const nativeToken = this.walletProvider.getCurrentChain(params.chainName).nativeCurrency.symbol;
    const chainId = this.walletProvider.getCurrentChain(params.chainName).id;
    elizaLogger.debug(`Native token for chain ${params.chainName}: ${nativeToken}`);

    const publicClient = this.walletProvider.getPublicClient(params.chainName);
    const walletClient = this.walletProvider.getWalletClient(params.chainName);

    if (!params.token || params.token === 'null' || params.token === '') {
      params.token = nativeToken;
      elizaLogger.debug(`Setting null/empty token to native token: ${nativeToken}`);
    } else if (params.token.toLowerCase() === nativeToken.toLowerCase()) {
      // Standardize the token case if it matches the native token
      params.token = nativeToken;
      elizaLogger.debug(`Standardized token case to match native token: ${nativeToken}`);
    }

    elizaLogger.debug(`Final transfer token: ${params.token}`);

    const resp: TransferResponse = {
      chainName: params.chainName,
      txHash: '0x',
      recipient: params.toAddress,
      amount: '',
      token: params.token,
      isBite: params.isBite,
    };

    let txToEncrypt: EVMTransaction = {
      to: params.toAddress,
      data: params.data as Hex,
      value: 0n,
      gas: this.TRANSFER_GAS,
      gasPrice: this.DEFAULT_GAS_PRICE,
      chainId: chainId.toString(),
    };

    if (!params.token || params.token == 'null' || params.token === nativeToken) {
      elizaLogger.debug('Native token transfer:', nativeToken);

      txToEncrypt.value = parseEther(params.amount);

      // Format with proper decimal places to match test expectations
      const amountStr = params.amount.includes('.') ? params.amount : `${params.amount}.0`;
      resp.amount = amountStr;

      elizaLogger.debug(`DATA : ${txToEncrypt.data}`);

      resp.txHash = await this.walletProvider.sendTransaction(
        params.chainName,
        txToEncrypt,
        params.isBite
      );

      return resp; // CRITICAL: Add missing return statement
    } else {
      // ERC20 token transfer
      elizaLogger.debug('ERC20 token transfer');
      let tokenAddress = params.token;
      elizaLogger.debug(`Token before address resolution: ${params.token}`);

      // Special case: If token is the native token, handle it separately
      if (params.token === chainNativeToken) {
        elizaLogger.debug(
          `Detected native token ${chainNativeToken} passed to ERC20 handling branch - switching to native token handling`
        );

        // Update response token to make sure it's consistent
        resp.token = nativeToken;

        txToEncrypt.value = parseEther(params.amount);

        // Format with proper decimal places to match test expectations
        const amountStr = params.amount.includes('.') ? params.amount : `${params.amount}.0`;
        resp.amount = amountStr;

        resp.txHash = await this.walletProvider.sendTransaction(
          params.chainName,
          txToEncrypt,
          params.isBite
        );

        elizaLogger.debug(`Native transfer completed via transfer branch`);
        return resp;
      }

      tokenAddress = this.walletProvider.getChainToken(params.chainName, params.token);

      elizaLogger.debug(`Final token address for ERC20 transfer: ${tokenAddress}`);

      const decimals = await this.walletProvider.readContract(
        params.chainName,
        tokenAddress,
        erc20Abi,
        'decimals',
        []
      );

      let value = parseUnits(params.amount, decimals);

      // Format with proper decimal places to match test expectations
      const amountStr = params.amount.includes('.') ? params.amount : `${params.amount}.0`;
      resp.amount = amountStr;

      txToEncrypt.data = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [params.toAddress, value],
      });
      txToEncrypt.to = tokenAddress;

      elizaLogger.debug(`ERC20 Data before encryption : ${txToEncrypt.data}`);

      resp.txHash = await this.walletProvider.sendTransaction(
        params.chainName,
        txToEncrypt,
        params.isBite
      );

      if (!resp.txHash || resp.txHash === '0x') {
        throw new Error('Get transaction hash failed');
      }

      await publicClient.waitForTransactionReceipt({
        hash: resp.txHash,
      });

      return resp;
    }
  }

  validateAndNormalizeParams(params: TransferParams): void {
    if (!params.toAddress) {
      throw new Error('To address is required');
    }
    params.toAddress = this.walletProvider.formatAddress(params.toAddress);

    // Validate amount if provided
    if (params.amount !== undefined && params.amount !== null) {
      const amountFloat = parseFloat(params.amount);
      if (amountFloat === 0) {
        throw new Error('Amount must be greater than 0');
      }
      if (amountFloat < 0) {
        throw new Error('Amount cannot be negative');
      }
    }

    params.data = 'null' == params.data + '' ? '0x' : params.data;
    elizaLogger.debug('params.data', params.data);
  }
}

export const transferAction = {
  name: 'transfer',
  description: 'Transfer tokens between addresses on the same chain',
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: Record<string, unknown>,
    callback?: HandlerCallback
  ) => {
    elizaLogger.log('Starting transfer action...');
    elizaLogger.debug('Message content:', JSON.stringify(message.content, null, 2));

    // Extract prompt text if available to help with token detection
    const promptText = typeof message.content.text === 'string' ? message.content.text.trim() : '';
    elizaLogger.debug(`Raw prompt text: "${promptText}"`);

    // Pre-analyze the prompt for token indicators - more aggressive token detection
    const promptLower = promptText.toLowerCase();

    // Direct nativeToken token detection - look for explicit mentions of native token
    const containsNative =
      promptLower.includes('fair') ||
      promptLower.includes('Fair native token') ||
      promptLower.includes('gas token') ||
      promptLower.includes('gas') ||
      promptLower.includes('native token');

    let directTokenMatch: string | null = null;
    const transferRegex = /transfer\s+([0-9.]+)\s+([a-zA-Z0-9]+)\s+to\s+(0x[a-fA-F0-9]{40})/i;
    const match = promptText.match(transferRegex);

    if (match && match.length >= 3) {
      const [_, amount, tokenSymbol, toAddress] = match;
      directTokenMatch = tokenSymbol.toUpperCase();
      elizaLogger.debug(
        `Directly extracted from prompt - Amount: ${amount}, Token: ${directTokenMatch}, To: ${toAddress}`
      );
    }

    if (containsNative) {
      elizaLogger.debug(`Native token transfer detected in prompt text: "${promptText}"`);
    }

    // Store this information for later use
    const promptAnalysis = {
      containsNative,
      directTokenMatch,
    };

    elizaLogger.debug('Prompt analysis result:', promptAnalysis);


    // Update state with recent messages
    let currentState = await runtime.composeState(message, ['RECENT_MESSAGES']);

    try {
      state.walletInfo = await initWalletProvider.get(runtime, message, currentState);
      elizaLogger.debug('Wallet info:', state.walletInfo);
    } catch (error) {
      elizaLogger.error(
        'Error getting wallet info:',
        error instanceof Error ? error.message : String(error)
      );
    }

    // Compose transfer prompt
    const transferPrompt = composePromptFromState({
      state: currentState,
      template: transferTemplate,
    });

    const result = await runtime.useModel(ModelType.TEXT_LARGE, {
      prompt: transferPrompt,
    });
    const content = parseKeyValueXml(result);

    elizaLogger.debug('Generated transfer content:', JSON.stringify(content, null, 2));

    // Validate content
    if (!isTransferContent(runtime, content)) {
      elizaLogger.error('Invalid content for transfer action.');
      callback?.({
        text: 'Unable to process transfer request. Invalid content provided.',
        content: { error: 'Invalid content' },
      });
      return false;
    }

    // Normalize chain from content
    let chain = content.chain?.toLowerCase() || 'fair-testnet';
    elizaLogger.debug(`Chain parameter: ${chain}`);

    // Check if content has a token field
    elizaLogger.debug('Token from content:', content.token);
    elizaLogger.debug('Content object keys:', Object.keys(content));

    let token: string;

    // 1. First priority: Use directly extracted token from prompt if available
    if (directTokenMatch) {
      token = directTokenMatch;
      elizaLogger.debug(`Using token directly extracted from prompt: ${token}`);
    } else if (content.token) {
      token = content.token;
      elizaLogger.debug(`Using token from generated content: ${token}`);
    } else if (containsNative) {
      token = 'FAIR';
      elizaLogger.debug(`Using gas token as detected in prompt`);
    }
    // 4. Default fallback
    else {
      token = 'FAIR'; // Default to native token
      elizaLogger.debug(`No token detected, defaulting to native token`);
    }

    // Final validation - never allow null/undefined as token value
    if (!token) {
      token = 'FAIR';
      elizaLogger.debug(`Final safeguard: ensuring token is not null/undefined`);
    }

    elizaLogger.debug(`Final token parameter: ${token}`);

    // Process data field to avoid passing "null" string
    let dataParam: Hex | undefined = undefined;
    if (content.data && typeof content.data === 'string') {
      if (content.data.startsWith('0x') && content.data !== '0x') {
        dataParam = content.data as Hex;
        elizaLogger.debug(`Using valid hex data: ${dataParam}`);
      } else {
        elizaLogger.debug(`Invalid data format or value: ${content.data}, ignoring`);
      }
    }

    let biteParam: boolean = false;

    const containsBiteParam =
      promptLower.includes('bite enable') ||
      promptLower.includes('bite encrypt') ||
      promptLower.includes('encrypt') ||
      promptLower.includes('encrypted') ||
      promptLower.includes('bite true') ||
      promptLower.includes('mev protect') ||
      promptLower.includes('mev protection') ||
      promptLower.includes('bite');

    if (containsBiteParam) {
      biteParam = true;
      elizaLogger.debug(`Bite encryption is enabled. BiteParam value is: ${biteParam}`);
    } else {
      elizaLogger.debug(`Bite encryption is disabled. BiteParam value is: ${biteParam}`);
    }

    const paramOptions: TransferParams = {
      chainName: chain,
      token: token,
      amount: content.amount,
      toAddress: content.toAddress as `0x${string}`,
      data: dataParam,
      isBite: biteParam,
    };

    elizaLogger.debug('Transfer params before action:', JSON.stringify(paramOptions, null, 2));

    try {
      const walletProvider = initFairWalletProvider(runtime);
      const action = new TransferAction(walletProvider);

      const biteConfig: BiteConfig = walletProvider.getBITEConfig();

      elizaLogger.debug('Calling transfer with params:', JSON.stringify(paramOptions, null, 2));

      const transferResp = await action.transfer(paramOptions);

      elizaLogger.debug(`Bite Config: ${biteConfig}`);

      let isBite = true;

      if (biteConfig === 'manual') isBite = transferResp.isBite;

      callback?.({
        text: `Successfully transferred ${transferResp.amount} ${transferResp.token} to ${transferResp.recipient}\n
        Transaction Hash: ${transferResp.txHash}\n
        Transaction Ecryption: ${isBite} `,
        content: { ...transferResp },
      });

      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      elizaLogger.error('Error during transfer:', errorMsg);

      // Enhanced error diagnosis
      let errorMessage = errorMsg;

      // Check for common error cases
      if (errorMsg.includes('not supported on Fair')) {
        errorMessage = `Token not supported. ${errorMsg}`;
      } else if (errorMsg.includes('insufficient funds')) {
        errorMessage = `Insufficient funds for the transaction. Please check your balance and try again with a smaller amount.`;
      } else if (errorMsg.includes('transaction underpriced')) {
        errorMessage = `Transaction underpriced. Please try again with a higher gas price.`;
      } else if (errorMsg.includes('Invalid address')) {
        errorMessage = `The address provided is invalid. Please provide a valid wallet address.`;
      }

      callback?.({
        text: `Transfer failed: ${errorMessage}`,
        content: { error: errorMessage },
      });
      return false;
    }
  },
  template: transferTemplate,
  validate: async (runtime: IAgentRuntime) => {
    const privateKey = runtime.getSetting('EVM_WALLET_PRIVATE_KEY');
    return typeof privateKey === 'string' && privateKey.startsWith('0x');
  },
  examples: [
    [
      {
        name: '{{user1}}',
        content: {
          text: 'Send 10 USDC to 0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        },
      },
      {
        name: '{{agent}}',
        content: {
          text: "I'll help you send 10 USDC to 0x742d35Cc6634C0532925a3b844Bc454e4438f44e on fair-testnet",
          action: 'TRANSFER',
          content: {
            chain: 'fair-testnet',
            token: 'USDC',
            amount: '10',
            toAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
            isBite: 'false',
          },
        },
      },
    ],
    [
      {
        name: '{{user1}}',
        content: {
          text: 'Transfer 25 SKL to 0x2CE4EaF47CACFbC6590686f8f7521e0385822334 with mev protection',
        },
      },
      {
        name: '{{agent}}',
        content: {
          text: "I'll help you transfer 25 SKL to 0x2CE4EaF47CACFbC6590686f8f7521e0385822334 with MEV protection enabled",
          action: 'TRANSFER',
          content: {
            chain: 'fair-testnet',
            token: 'SKL',
            amount: '25',
            toAddress: '0x2CE4EaF47CACFbC6590686f8f7521e0385822334',
            isBite: 'true',
          },
        },
      },
    ],
    [
      {
        name: '{{user1}}',
        content: {
          text: 'Send 5.5 USDT to 0x8Ba1f109551bD432803012645Hac136c0c8854c8',
        },
      },
      {
        name: '{{agent}}',
        content: {
          text: "I'll help you send 5.5 USDT to 0x8Ba1f109551bD432803012645Hac136c0c8854c8 on fair-testnet",
          action: 'TRANSFER',
          content: {
            chain: 'fair-testnet',
            token: 'USDT',
            amount: '5.5',
            toAddress: '0x8Ba1f109551bD432803012645Hac136c0c8854c8',
            isBite: 'false',
          },
        },
      },
    ],
    [
      {
        name: '{{user1}}',
        content: {
          text: 'Transfer 100 FAIR to 0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2 with bite encrypt',
        },
      },
      {
        name: '{{agent}}',
        content: {
          text: "I'll help you transfer 100 FAIR to 0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2 with bite encryption enabled",
          action: 'TRANSFER',
          content: {
            chain: 'fair-testnet',
            token: 'FAIR',
            amount: '100',
            toAddress: '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2',
            isBite: 'true',
          },
        },
      },
    ],
    [
      {
        name: '{{user1}}',
        content: {
          text: 'Send 0.5 USDC to 0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984 with encrypt',
        },
      },
      {
        name: '{{agent}}',
        content: {
          text: "I'll help you send 0.5 USDC to 0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984 with encryption enabled",
          action: 'TRANSFER',
          content: {
            chain: 'fair-testnet',
            token: 'USDC',
            amount: '0.5',
            toAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
            isBite: 'true',
          },
        },
      },
    ],
    [
      {
        name: '{{user1}}',
        content: {
          text: 'Transfer 50 SKL to 0x514910771AF9Ca656af840dff83E8264EcF986CA',
        },
      },
      {
        name: '{{agent}}',
        content: {
          text: "I'll help you transfer 50 SKL to 0x514910771AF9Ca656af840dff83E8264EcF986CA on fair-testnet",
          action: 'TRANSFER',
          content: {
            chain: 'fair-testnet',
            token: 'SKL',
            amount: '50',
            toAddress: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
            isBite: 'false',
          },
        },
      },
    ],
    [
      {
        name: '{{user1}}',
        content: {
          text: 'Send 2.25 USDT to 0x6B175474E89094C44Da98b954EedeAC495271d0F with bite enable',
        },
      },
      {
        name: '{{agent}}',
        content: {
          text: "I'll help you send 2.25 USDT to 0x6B175474E89094C44Da98b954EedeAC495271d0F with bite protocol enabled",
          action: 'TRANSFER',
          content: {
            chain: 'fair-testnet',
            token: 'USDT',
            amount: '2.25',
            toAddress: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
            isBite: 'true',
          },
        },
      },
    ],
    [
      {
        name: '{{user1}}',
        content: {
          text: 'Transfer 0.01 FAIR to 0xA0b86a33E6411c28D8B334B14c4813EbD0de7A9e',
        },
      },
      {
        name: '{{agent}}',
        content: {
          text: "I'll help you transfer 0.01 FAIR to 0xA0b86a33E6411c28D8B334B14c4813EbD0de7A9e on fair-testnet",
          action: 'TRANSFER',
          content: {
            chain: 'fair-testnet',
            token: 'FAIR',
            amount: '0.01',
            toAddress: '0xA0b86a33E6411c28D8B334B14c4813EbD0de7A9e',
            isBite: 'false',
          },
        },
      },
    ],
    [
      {
        name: '{{user1}}',
        content: {
          text: 'Send 15 USDC to 0xdAC17F958D2ee523a2206206994597C13D831ec7 with mev protect',
        },
      },
      {
        name: '{{agent}}',
        content: {
          text: "I'll help you send 15 USDC to 0xdAC17F958D2ee523a2206206994597C13D831ec7 with MEV protection",
          action: 'TRANSFER',
          content: {
            chain: 'fair-testnet',
            token: 'USDC',
            amount: '15',
            toAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            isBite: 'true',
          },
        },
      },
    ],
    [
      {
        name: '{{user1}}',
        content: {
          text: 'Transfer 75 SKL to 0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
        },
      },
      {
        name: '{{agent}}',
        content: {
          text: "I'll help you transfer 75 SKL to 0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE on fair-testnet",
          action: 'TRANSFER',
          content: {
            chain: 'fair-testnet',
            token: 'SKL',
            amount: '75',
            toAddress: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
            isBite: 'false',
          },
        },
      },
    ],
  ],
  similes: ['TRANSFER', 'SEND_TOKENS', 'TOKEN_TRANSFER', 'MOVE_TOKENS'],
};
