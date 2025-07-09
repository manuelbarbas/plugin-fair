import type { IAgentRuntime, Provider, Memory, State } from '@elizaos/core';
import type {
  Address,
  WalletClient,
  PublicClient,
  Chain,
  HttpTransport,
  Account,
  PrivateKeyAccount,
  Hex,
} from 'viem';
import { defineChain, Abi } from 'viem';

import { createPublicClient, createWalletClient, formatUnits, http, erc20Abi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { elizaLogger } from '@elizaos/core';

import type { PluginConfig, ChainConfig, EVMTransaction, Transaction, BiteConfig } from '../types';
import { PluginConfigManager } from '../config/pluginConfig';
import { BiteMiddleware } from './biteMiddleware';

export class WalletProvider {
  account!: PrivateKeyAccount;

  private configManager: PluginConfigManager;

  private bite: BiteMiddleware;

  private biteConfig: BiteConfig;

  constructor(
    privateKey: `0x${string}`,
    biteConfig: Partial<BiteConfig> = 'automatic',
    pluginConfig?: Partial<PluginConfig>
  ) {
    this.setAccount(privateKey);

    this.configManager = new PluginConfigManager(pluginConfig);

    this.bite = new BiteMiddleware();

    this.biteConfig = biteConfig;
  }

  getAccount(): PrivateKeyAccount {
    return this.account;
  }

  getAddress(): Address {
    return this.account.address;
  }

  getPrivateKey(): Hex {
    // @ts-ignore - accessing private property for compatibility
    return this.account.privateKey;
  }

  getCurrentChain(chainName: string): Chain {
    const chainConfig: ChainConfig = this.configManager.getChainConfig(chainName);

    const currentChain: Chain = defineChain({
      id: +chainConfig.chainId,
      name: chainName,
      nativeCurrency: {
        name: chainConfig.nativeToken,
        symbol: chainConfig.nativeToken,
        decimals: 18,
      },
      rpcUrls: {
        default: {
          http: [chainConfig.rpc],
        },
      },
      blockExplorers: {
        default: {
          name: `${chainName} Explorer`,
          url: chainConfig.explorerUrl,
        },
      },
    });

    return currentChain;
  }

  getPublicClient(chainName: string): PublicClient<HttpTransport, Chain, Account | undefined> {
    const transport = this.createHttpTransport(chainName);

    const publicClient = createPublicClient({
      chain: this.getCurrentChain(chainName),
      transport,
    });
    return publicClient;
  }

  getChainToken(chainName: string, tokenName: string): string {
    return this.configManager.getTokenAddress(chainName, tokenName);
  }

  getChainUniswapRouter(chainName: string): string {
    return this.configManager.getUniswapAddress(chainName);
  }

  getChainConfig(chainName: string): ChainConfig {
    const chainConfig: ChainConfig = this.configManager.getChainConfig(chainName);
    return chainConfig;
  }

  getPluginConfig(): PluginConfigManager {
    return this.configManager;
  }

  getChainRpc(chainName: string): string {
    return this.configManager.getRPC(chainName);
  }

  getChainNativetToken(chainName: string): string {
    return this.configManager.getChainNativeToken(chainName);
  }

  getWalletClient(chainName: string): WalletClient {
    const transport = this.createHttpTransport(chainName);

    const walletClient = createWalletClient({
      chain: this.getCurrentChain(chainName),
      transport,
      account: this.account,
    });

    return walletClient;
  }

  getBiteConfig(): BiteConfig {
    return this.biteConfig;
  }

  isChainSupported(chainName: string): boolean {
    if (!chainName || chainName === '') return false;

    const chainConfig: ChainConfig = this.configManager.getChainConfig(chainName);

    if (!chainConfig) return false;

    return true;
  }

  async formatAddress(address: string | null | undefined): Promise<Address> {
    // If address is null or undefined, use the wallet's own address
    if (address === null || address === undefined) {
      elizaLogger.debug("Address is null or undefined, using wallet's own address");
      return this.getAddress();
    }

    // If address is empty string, use wallet's own address
    if (typeof address === 'string' && address.trim().length === 0) {
      elizaLogger.debug("Address is empty string, using wallet's own address");
      return this.getAddress();
    }

    // Convert to string in case we get an object or other type
    const addressStr = String(address).trim();

    // If it's already a valid hex address, return it directly
    if (addressStr.startsWith('0x') && addressStr.length === 42) {
      elizaLogger.debug(`Using valid hex address: ${addressStr}`);
      return addressStr as Address;
    }

    // Skip name resolution for common tokens that might be mistakenly
    // passed as addresses
    const commonTokens = ['FAIR', 'USDT', 'USDC', 'SKL', 'WFAIR'];
    if (commonTokens.includes(addressStr.toUpperCase())) {
      elizaLogger.debug(
        `Value appears to be a token symbol, not an address: ${addressStr}. Using wallet's own address.`
      );
      return this.getAddress();
    }

    // If we can't resolve the name but it looks like a potential address
    if (addressStr.startsWith('0x')) {
      elizaLogger.debug(
        `Address "${addressStr}" doesn't look like a standard Ethereum address but will be used as is`
      );
      return addressStr as Address;
    }

    // If all else fails, use the wallet's own address
    elizaLogger.debug(`Could not resolve address '${addressStr}'. Using wallet's own address.`);
    return this.getAddress();
  }

  async getBalance(chainName: string): Promise<string> {
    const client = this.getPublicClient(chainName);
    const balance = await client.getBalance({
      address: this.account.address,
    });
    return formatUnits(balance, 18);
  }

  async readContract(
    chainName: string,
    address: string,
    contractAbi: Abi,
    functionName: string,
    args: unknown[]
  ): Promise<any> {
    const client = this.getPublicClient(chainName);

    const result = await client.readContract({
      address: address as `0x${string}`,
      abi: contractAbi,
      functionName: functionName,
      args: args,
    });

    return result;
  }

  async sendTransaction(
    chainName: string,
    tansaction: EVMTransaction,
    isBite: boolean
  ): Promise<`0x${string}`> {
    const wallet = this.getWalletClient(chainName);

    let tx_: Transaction = {
      to: tansaction.to,
      data: tansaction.data,
    };

    if (this.biteConfig === 'automatic' || isBite)
      tx_ = await this.encryptTx(this.getChainRpc(chainName), tansaction);

    const tx = await wallet.sendTransaction({
      account: wallet.account,
      ...tx_,
      value: tansaction.value,
      gas: tansaction.gas,
      gasPrice: tansaction.gasPrice,
    } as any);

    return tx;
  }

  async waitForTx(chainName: string, tx: string) {
    await this.getPublicClient(chainName).waitForTransactionReceipt({ hash: tx as `0x${string}` });
  }

  async encryptTx(rpc: string, transaction: EVMTransaction): Promise<Transaction> {
    return await this.bite.encryptTransaction(rpc, transaction);
  }

  private setAccount = (pk: `0x${string}`) => {
    this.account = privateKeyToAccount(pk);
  };

  private createHttpTransport = (chainName: string) => {
    const chain = this.getCurrentChain(chainName);
    return http(chain.rpcUrls.default.http[0]);
  };
}

const getPluginConfigFromRuntime = (runtime: IAgentRuntime): Partial<PluginConfig> => {
  const pluginConfig = runtime.getSetting('PLUGIN_CONFIG') as Partial<PluginConfig>;

  return pluginConfig;
};

const getBiteConfig = (runtime: IAgentRuntime): Partial<BiteConfig> => {
  const biteConfig = runtime.getSetting('biteConfig') as Partial<BiteConfig>;

  return biteConfig;
};

export const initSkaleWalletProvider = (runtime: IAgentRuntime) => {
  const privateKey = runtime.getSetting('EVM_WALLET_PRIVATE_KEY');
  if (!privateKey) {
    throw new Error('EVM_WALLET_PRIVATE_KEY is missing');
  }

  const config = getPluginConfigFromRuntime(runtime);
  const biteConfig: BiteConfig = getBiteConfig(runtime);

  if (config) return new WalletProvider(privateKey as `0x${string}`, biteConfig, config);
  else return new WalletProvider(privateKey as `0x${string}`, biteConfig);
};

export const initWalletProvider: Provider = {
  name: 'skaleWallet',
  description:
    'Provides Skale Idealistic testnet wallet information including address, balance, and chain details',
  async get(runtime: IAgentRuntime, _message: Memory, _state: State) {
    try {
      const walletProvider = initSkaleWalletProvider(runtime);
      const address = walletProvider.getAddress();
      const walletInfo = `Skale Idealistic Wallet Address: ${address}`;

      return {
        text: walletInfo,
        values: {
          address,
        },
      };
    } catch (error) {
      elizaLogger.error('Error in Skale wallet provider:', error);
      return {
        text: 'Error retrieving wallet information',
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
};
