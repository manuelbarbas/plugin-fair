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
  type Action,
} from '@elizaos/core';
import {
  formatEther,
  formatUnits,
  parseEther,
  parseUnits,
  erc20Abi,
  type Hex,
  encodeFunctionData,
} from 'viem';

import {
  initWalletProvider,
  initSkaleWalletProvider,
  type WalletProvider,
} from '../providers/wallet';
import { swapTemplate } from '../templates';
import type { SwapParams, SwapResponse, EVMTransaction, BiteConfig } from '../types';
import { UNISWAP_V2_ROUTER_ABI } from '../types';

export { swapTemplate };

// Content interface for swap action
interface SwapContent extends Content {
  chain: string;
  inputToken: string;
  outputToken: string;
  amount: string;
  slippage?: string;
}

// Validation function for swap content
function isSwapContent(_runtime: IAgentRuntime, content: any): content is SwapContent {
  elizaLogger.debug('Swap content for validation', content);
  return (
    content &&
    typeof content.chain === 'string' &&
    typeof content.inputToken === 'string' &&
    typeof content.outputToken === 'string' &&
    typeof content.amount === 'string'
  );
}

// Exported for tests
export class SwapAction {
  private readonly DEFAULT_SLIPPAGE = 0.5; // 0.5%
  private readonly DEFAULT_DEADLINE_MINUTES = 5;

  private readonly SWAP_GAS = 1000000n;
  private readonly DEFAULT_GAS_PRICE = 1000000n as const;

  constructor(private walletProvider: WalletProvider) {}

  async swap(params: SwapParams): Promise<SwapResponse> {
    elizaLogger.debug('Starting swap with params:', JSON.stringify(params, null, 2));

    // Check if the chain is supported
    if (!this.walletProvider.isChainSupported(params.chainName)) {
      elizaLogger.error(`Chain '${params.chainName}' is not supported.`);
      throw new Error(`Chain '${params.chainName}' is not supported.`);
    }

    await this.validateAndNormalizeParams(params);
    elizaLogger.debug('After validation, params:', JSON.stringify(params, null, 2));

    const fromAddress = this.walletProvider.getAddress();

    // Resolve token addresses and check if they're native
    const inputTokenInfo = this.resolveTokenAddress(params.inputToken, params.chainName);
    const outputTokenInfo = this.resolveTokenAddress(params.outputToken, params.chainName);

    elizaLogger.debug(
      `From token - Address: ${inputTokenInfo.address}, IsNative: ${inputTokenInfo.isNative}`
    );
    elizaLogger.debug(
      `To token - Address: ${outputTokenInfo.address}, IsNative: ${outputTokenInfo.isNative}`
    );

    // Get token decimals
    const fromTokenDecimals = await this.walletProvider.readContract(
      params.chainName,
      inputTokenInfo.address,
      erc20Abi,
      'decimals',
      []
    );
    const toTokenDecimals = await this.walletProvider.readContract(
      params.chainName,
      outputTokenInfo.address,
      erc20Abi,
      'decimals',
      []
    );

    // Parse amount
    const amountIn = parseUnits(params.amount, fromTokenDecimals);
    elizaLogger.debug(`Amount in (raw): ${amountIn.toString()}`);

    // Calculate deadline (current time + minutes in seconds)
    const deadline = BigInt(Math.floor(Date.now() / 1000) + this.DEFAULT_DEADLINE_MINUTES * 60);

    // Get expected output amount and calculate minimum with slippage
    const slippage = params.slippage || this.DEFAULT_SLIPPAGE;
    const { amountOut, amountOutMin } = await this.calculateAmountOut(
      amountIn,
      inputTokenInfo.address,
      outputTokenInfo.address,
      slippage,
      params.chainName
    );

    elizaLogger.debug(`Expected amount out: ${amountOut.toString()}`);
    elizaLogger.debug(`Minimum amount out: ${amountOutMin.toString()}`);

    let txHash: Hex;

    // Determine swap type and execute
    if (inputTokenInfo.isNative && !outputTokenInfo.isNative) {
      txHash = await this.swapETHForTokens(
        amountIn,
        amountOutMin,
        inputTokenInfo.address,
        outputTokenInfo.address,
        fromAddress,
        deadline,
        params.chainName,
        params.isBite
      );
    } else if (!inputTokenInfo.isNative && outputTokenInfo.isNative) {
      txHash = await this.swapTokensForETH(
        amountIn,
        amountOutMin,
        inputTokenInfo.address,
        outputTokenInfo.address,
        fromAddress,
        deadline,
        params.chainName,
        params.isBite
      );
    } else {
      txHash = await this.swapTokensForTokens(
        amountIn,
        amountOutMin,
        inputTokenInfo.address,
        outputTokenInfo.address,
        fromAddress,
        deadline,
        params.chainName,
        params.isBite
      );
    }

    if (!txHash || txHash === '0x') {
      throw new Error('Swap transaction hash not received');
    }

    // Wait for transaction confirmation
    await this.walletProvider.waitForTx(params.chainName, txHash);

    const response: SwapResponse = {
      chainName: params.chainName,
      txHash,
      inputToken: params.inputToken,
      outputToken: params.outputToken,
      amountIn: params.amount.includes('.') ? params.amount : `${params.amount}.0`,
      amountOut: formatUnits(amountOut, toTokenDecimals),
      isBite: params.isBite,
    };

    elizaLogger.debug('Swap completed:', JSON.stringify(response, null, 2));
    return response;
  }

  private resolveTokenAddress(
    token: string,
    chainName: string
  ): { address: string; isNative: boolean } {
    if (token.startsWith('0x')) {
      return { address: token, isNative: false };
    }

    const nativeToken = this.walletProvider.getCurrentChain(chainName).nativeCurrency.symbol;

    if (token.toLowerCase() === nativeToken.toLowerCase()) {
      const nativeAddress = this.walletProvider.getChainToken(chainName, 'W' + nativeToken);

      return {
        address: nativeAddress,
        isNative: true,
      };
    }

    // Look up in token config
    const tokenAddress = this.walletProvider.getChainToken(chainName, token);
    if (!tokenAddress) {
      throw new Error(`Token ${token} is not supported on ${chainName}.`);
    }

    return { address: tokenAddress, isNative: false };
  }

  private async calculateAmountOut(
    amountIn: bigint,
    inputTokenAddress: string,
    outputTokenAddress: string,
    slippage: number,
    chainName: string
  ): Promise<{ amountOut: bigint; amountOutMin: bigint }> {
    const path = [inputTokenAddress as `0x${string}`, outputTokenAddress as `0x${string}`];

    elizaLogger.debug(`PARAMS routerAddress before`);

    const routerAddress = this.walletProvider.getChainUniswapRouter(chainName);

    elizaLogger.debug(`PARAMS routerAddress ${routerAddress}`);

    try {
      const amounts = await this.walletProvider.readContract(
        chainName,
        routerAddress,
        UNISWAP_V2_ROUTER_ABI,
        'getAmountsOut',
        [amountIn, path]
      );

      const amountOut = amounts[1]; // Second element is the output amount
      elizaLogger.debug(`PARAMS amountOut ${amountOut}`);

      const slippageMultiplier = BigInt(Math.floor((100 - slippage) * 100)); // Convert to basis points
      const amountOutMin = (amountOut * slippageMultiplier) / 10000n;

      return { amountOut, amountOutMin };
    } catch (error) {
      elizaLogger.error('Error calculating amount out:', error);
      throw new Error(
        'Unable to calculate swap amounts. Please check if liquidity exists for this pair.'
      );
    }
  }

  private async swapETHForTokens(
    amountIn: bigint,
    amountOutMin: bigint,
    inputTokenAddress: string,
    outputTokenAddress: string,
    to: string,
    deadline: bigint,
    chainName: string,
    isBite: boolean
  ): Promise<Hex> {
    // For native token swaps, we need to use the router's ETH functions
    const path = [inputTokenAddress, outputTokenAddress] as `0x${string}`[];

    const transferData = encodeFunctionData({
      abi: UNISWAP_V2_ROUTER_ABI,
      functionName: 'swapExactETHForTokens',
      args: [amountOutMin, path, to as `0x${string}`, deadline],
    });

    const txContent: EVMTransaction = {
      to: this.walletProvider.getChainUniswapRouter(chainName),
      data: transferData,
      value: amountIn,
      gas: this.SWAP_GAS,
      gasPrice: this.DEFAULT_GAS_PRICE,
      chainId: this.walletProvider.getCurrentChain(chainName).id.toString(),
    };

    return await this.walletProvider.sendTransaction(chainName, txContent, isBite);
  }

  private async swapTokensForETH(
    amountIn: bigint,
    amountOutMin: bigint,
    inputTokenAddress: string,
    outputTokenAddress: string,
    to: string,
    deadline: bigint,
    chainName: string,
    isBite: boolean
  ): Promise<Hex> {
    // First approve the router to spend tokens

    const rounterAddress = this.walletProvider.getChainUniswapRouter(chainName);

    await this.approveToken(inputTokenAddress, rounterAddress, amountIn, chainName, isBite);

    const path = [inputTokenAddress, outputTokenAddress] as `0x${string}`[];

    const transferData = encodeFunctionData({
      abi: UNISWAP_V2_ROUTER_ABI,
      functionName: 'swapExactTokensForETH',
      args: [amountIn, amountOutMin, path, to as `0x${string}`, deadline],
    });

    const txContent: EVMTransaction = {
      to: rounterAddress,
      data: transferData,
      value: 0n,
      gas: this.SWAP_GAS,
      gasPrice: this.DEFAULT_GAS_PRICE,
      chainId: this.walletProvider.getCurrentChain(chainName).id.toString(),
    };

    return await this.walletProvider.sendTransaction(chainName, txContent, isBite);
  }

  private async swapTokensForTokens(
    amountIn: bigint,
    amountOutMin: bigint,
    inputTokenAddress: string,
    outputTokenAddress: string,
    to: string,
    deadline: bigint,
    chainName: string,
    isBite: boolean
  ): Promise<Hex> {
    const rounterAddress = this.walletProvider.getChainUniswapRouter(chainName);

    // First approve the router to spend tokens
    await this.approveToken(inputTokenAddress, rounterAddress, amountIn, chainName, isBite);

    const path = [inputTokenAddress, outputTokenAddress] as `0x${string}`[];

    const transferData = encodeFunctionData({
      abi: UNISWAP_V2_ROUTER_ABI,
      functionName: 'swapExactTokensForTokens',
      args: [amountIn, amountOutMin, path, to as `0x${string}`, deadline],
    });

    const txContent: EVMTransaction = {
      to: rounterAddress,
      data: transferData,
      value: 0n,
      gas: this.SWAP_GAS,
      gasPrice: this.DEFAULT_GAS_PRICE,
      chainId: this.walletProvider.getCurrentChain(chainName).id.toString(),
    };

    return await this.walletProvider.sendTransaction(chainName, txContent, isBite);
  }

  private async approveToken(
    tokenAddress: string,
    spender: string,
    amount: bigint,
    chainName: string,
    isBite: boolean
  ): Promise<void> {
    elizaLogger.debug(`Approving ${amount.toString()} tokens for ${spender}`);

    const currentAllowance = await this.walletProvider.readContract(
      chainName,
      tokenAddress,
      erc20Abi,
      'allowance',
      [this.walletProvider.getAddress(), spender as `0x${string}`]
    );

    // Only approve if current allowance is insufficient
    if (currentAllowance < amount) {
      const transferData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [spender as `0x${string}`, amount],
      });

      const txContent: EVMTransaction = {
        to: tokenAddress,
        data: transferData,
        value: 0n,
        gas: this.SWAP_GAS,
        gasPrice: this.DEFAULT_GAS_PRICE,
        chainId: this.walletProvider.getCurrentChain(chainName).id.toString(),
      };

      const approveTxHash = await this.walletProvider.sendTransaction(chainName, txContent, isBite);

      // Wait for approval transaction
      await this.walletProvider.waitForTx(chainName, approveTxHash);
      elizaLogger.debug(`Token approval completed: ${approveTxHash}`);
    } else {
      elizaLogger.debug('Sufficient allowance already exists');
    }
  }

  async validateAndNormalizeParams(params: SwapParams): Promise<void> {
    if (!params.inputToken || !params.outputToken) {
      throw new Error('Both inputToken and outputToken are required');
    }

    if (params.inputToken.toLowerCase() === params.outputToken.toLowerCase()) {
      throw new Error('Cannot swap the same token');
    }

    if (!params.amount) {
      throw new Error('Amount is required');
    }

    const amountFloat = parseFloat(params.amount);
    if (amountFloat <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    if (params.slippage !== undefined) {
      if (params.slippage < 0 || params.slippage > 50) {
        throw new Error('Slippage must be between 0 and 50 percent');
      }
    }
  }
}

export const swapAction = {
  name: 'swap',
  description: 'Swap tokens using Uniswap V2 on the specified chain',
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: Record<string, unknown>,
    callback?: HandlerCallback
  ) => {
    elizaLogger.log('Starting swap action...');
    elizaLogger.debug('Message content:', JSON.stringify(message.content, null, 2));

    // Extract prompt text for better token detection
    const promptText = typeof message.content.text === 'string' ? message.content.text.trim() : '';
    elizaLogger.debug(`Raw prompt text: "${promptText}"`);

    const promptLower = promptText.toLowerCase();

    // Analyze prompt for swap patterns like "swap 100 USDC for SKL"
    const swapRegex = /swap\s+([0-9.]+)\s+([a-zA-Z0-9]+)\s+(?:for|to)\s+([a-zA-Z0-9]+)/i;
    const match = promptText.match(swapRegex);

    let promptAnalysis: {
      amount?: string;
      inputToken?: string;
      outputToken?: string;
    } = {};

    if (match && match.length >= 4) {
      const [_, amount, inputToken, outputToken] = match;
      promptAnalysis = {
        amount,
        inputToken: inputToken.toUpperCase(),
        outputToken: outputToken.toUpperCase(),
      };
      elizaLogger.debug('Extracted from prompt:', promptAnalysis);
    }

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

    // Compose swap prompt
    const swapPrompt = composePromptFromState({
      state: currentState,
      template: swapTemplate,
    });
    const result = await runtime.useModel(ModelType.TEXT_LARGE, {
      prompt: swapPrompt,
    });

    const content = parseKeyValueXml(result);

    elizaLogger.debug('Generated swap content:', JSON.stringify(content, null, 2));

    // Validate content
    if (!isSwapContent(runtime, content)) {
      elizaLogger.error('Invalid content for swap action.');
      callback?.({
        text: 'Unable to process swap request. Invalid content provided.',
        content: { error: 'Invalid content' },
      });
      return false;
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

    // Use prompt analysis as fallback for missing content
    const finalParams: SwapParams = {
      chainName: content.chain?.toLowerCase() || 'fair-testnet',
      inputToken: content.inputToken || promptAnalysis.inputToken || '',
      outputToken: content.outputToken || promptAnalysis.outputToken || '',
      amount: content.amount || promptAnalysis.amount || '',
      slippage: content.slippage ? parseFloat(content.slippage) : undefined,
      isBite: biteParam || false,
    };

    elizaLogger.debug('Final swap params:', JSON.stringify(finalParams, null, 2));

    try {
      const walletProvider = initSkaleWalletProvider(runtime);
      const action = new SwapAction(walletProvider);

      const biteConfig: BiteConfig = walletProvider.getBiteConfig();

      const swapResp = await action.swap(finalParams);

      let isBite = true;
      if (biteConfig === 'manual') isBite = swapResp.isBite;

      callback?.({
        text: `Successfully swapped ${swapResp.amountIn} ${swapResp.inputToken} for ${swapResp.amountOut} ${swapResp.outputToken}\n
        Transaction Hash: ${swapResp.txHash}\n
        Transaction Ecryption: ${isBite}`,
        content: { ...swapResp },
      });

      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      elizaLogger.error('Error during swap:', errorMsg);

      let errorMessage = errorMsg;

      // Enhanced error handling
      if (errorMsg.includes('insufficient funds')) {
        errorMessage = `Insufficient funds for the swap. Please check your balance.`;
      } else if (errorMsg.includes('liquidity')) {
        errorMessage = `Insufficient liquidity for this trading pair. Try a different pair or smaller amount.`;
      } else if (errorMsg.includes('slippage')) {
        errorMessage = `Swap failed due to slippage. Try increasing slippage tolerance.`;
      } else if (errorMsg.includes('not supported')) {
        errorMessage = `Token not supported. ${errorMsg}`;
      }

      callback?.({
        text: `Swap failed: ${errorMessage}`,
        content: { error: errorMessage },
      });
      return false;
    }
  },
  template: swapTemplate,
  validate: async (runtime: IAgentRuntime) => {
    const privateKey = runtime.getSetting('EVM_WALLET_PRIVATE_KEY');
    return typeof privateKey === 'string' && privateKey.startsWith('0x');
  },
  examples: [
    // Additional examples to add to the swapAction examples array:

    [
      {
        name: '{{user1}}',
        content: {
          text: 'Exchange 50 USDT for FAIR tokens',
        },
      },
      {
        name: '{{agent}}',
        content: {
          text: "I'll help you exchange 50 USDT for FAIR tokens on fair-testnet",
          action: 'SWAP',
          content: {
            chain: 'fair-testnet',
            inputToken: 'USDT',
            outputToken: 'FAIR',
            amount: '50',
            slippage: '0.5',
            isBite: 'false',
          },
        },
      },
    ],
    [
      {
        name: '{{user1}}',
        content: {
          text: 'Trade 25 SKL to USDC with 2% slippage and bite encryption',
        },
      },
      {
        name: '{{agent}}',
        content: {
          text: "I'll help you trade 25 SKL for USDC tokens with 2% slippage using bite encryption",
          action: 'SWAP',
          content: {
            chain: 'fair-testnet',
            inputToken: 'SKL',
            outputToken: 'USDC',
            amount: '25',
            slippage: '2',
            isBite: 'true',
          },
        },
      },
    ],
    [
      {
        name: '{{user1}}',
        content: {
          text: 'Convert 200 FAIR to USDT with mev protection',
        },
      },
      {
        name: '{{agent}}',
        content: {
          text: "I'll help you convert 200 FAIR to USDT tokens with MEV protection enabled",
          action: 'SWAP',
          content: {
            chain: 'fair-testnet',
            inputToken: 'FAIR',
            outputToken: 'USDT',
            amount: '200',
            slippage: '0.5',
            isBite: 'true',
          },
        },
      },
    ],
    [
      {
        name: '{{user1}}',
        content: {
          text: 'Swap 75 USDC for SKL with 1.5% slippage',
        },
      },
      {
        name: '{{agent}}',
        content: {
          text: "I'll help you swap 75 USDC for SKL tokens with 1.5% slippage tolerance",
          action: 'SWAP',
          content: {
            chain: 'fair-testnet',
            inputToken: 'USDC',
            outputToken: 'SKL',
            amount: '75',
            slippage: '1.5',
            isBite: 'false',
          },
        },
      },
    ],
    [
      {
        name: '{{user1}}',
        content: {
          text: 'Exchange 300 USDT to FAIR with bite enable',
        },
      },
      {
        name: '{{agent}}',
        content: {
          text: "I'll help you exchange 300 USDT for FAIR tokens with bite encryption enabled",
          action: 'SWAP',
          content: {
            chain: 'fair-testnet',
            inputToken: 'USDT',
            outputToken: 'FAIR',
            amount: '300',
            slippage: '0.5',
            isBite: 'true',
          },
        },
      },
    ],
    [
      {
        name: '{{user1}}',
        content: {
          text: 'Trade 15.5 SKL for USDC',
        },
      },
      {
        name: '{{agent}}',
        content: {
          text: "I'll help you trade 15.5 SKL for USDC tokens on fair-testnet",
          action: 'SWAP',
          content: {
            chain: 'fair-testnet',
            inputToken: 'SKL',
            outputToken: 'USDC',
            amount: '15.5',
            slippage: '0.5',
            isBite: 'false',
          },
        },
      },
    ],
    [
      {
        name: '{{user1}}',
        content: {
          text: 'Convert 100 FAIR to USDT with encrypt',
        },
      },
      {
        name: '{{agent}}',
        content: {
          text: "I'll help you convert 100 FAIR to USDT tokens with encryption enabled",
          action: 'SWAP',
          content: {
            chain: 'fair-testnet',
            inputToken: 'FAIR',
            outputToken: 'USDT',
            amount: '100',
            slippage: '0.5',
            isBite: 'true',
          },
        },
      },
    ],
    [
      {
        name: '{{user1}}',
        content: {
          text: 'Swap 80 USDC to SKL with 1% slippage tolerance',
        },
      },
      {
        name: '{{agent}}',
        content: {
          text: "I'll help you swap 80 USDC for SKL tokens with 1% slippage tolerance",
          action: 'SWAP',
          content: {
            chain: 'fair-testnet',
            inputToken: 'USDC',
            outputToken: 'SKL',
            amount: '80',
            slippage: '1',
            isBite: 'false',
          },
        },
      },
    ],
  ],
  similes: ['SWAP', 'EXCHANGE', 'TRADE', 'CONVERT_TOKENS', 'ENCRYPT_SWAP'],
};
