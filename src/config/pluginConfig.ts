import { PluginConfig, ChainConfig, DEFAULT_PLUGIN_CONFIG } from '../types';
import { isAddress } from 'viem';
import { elizaLogger } from '@elizaos/core';
export class PluginConfigManager {
  private config: PluginConfig;

  constructor(userConfig: Partial<PluginConfig> = {}) {
    const defaultChains = DEFAULT_PLUGIN_CONFIG.chains || {};
    const userChains = userConfig.chains || {};

    const mergedChains: Record<string, ChainConfig> = {};

    for (const chainName of new Set([...Object.keys(defaultChains), ...Object.keys(userChains)])) {
      mergedChains[chainName] = {
        ...defaultChains[chainName],
        ...userChains[chainName],
        tokens: {
          ...defaultChains[chainName]?.tokens,
          ...userChains[chainName]?.tokens,
        },
      };
    }

    this.config = {
      ...DEFAULT_PLUGIN_CONFIG,
      ...userConfig,
      chains: mergedChains,
    };

    this.validateConfig();
  }

  private validateConfig(): void {
    const chains = this.config.chains;

    if (!chains || Object.keys(chains).length === 0) {
      throw new Error('Config plugin requires at least one chain configured');
    }

    for (const [chainName, chainConfig] of Object.entries(chains)) {
      if (!chainConfig.chainId || chainConfig.chainId.trim() === '') {
        throw new Error(`Chain "${chainName}" is missing a valid "chainId"`);
      }

      if (!chainConfig.rpc || chainConfig.rpc.trim() === '') {
        throw new Error(`Chain "${chainName}" is missing a valid "rpc" URL`);
      }
    }
  }

  hasUniswap(chainName: string): boolean {
    if (!this.config.chains[chainName]) {
      throw new Error(`Chain with that name not registered`);
    }

    return isAddress(this.config.chains[chainName].uniswapV2Router);
  }

  getTokenAddress(chainName: string, tokenName: string): string {
    if (!this.config.chains[chainName].tokens[tokenName]) {
      throw new Error(`Token used not registered on the chain config`);
    } else {
      return this.config.chains[chainName].tokens[tokenName];
    }
  }
  getUniswapAddress(chainName: string): string | undefined {
    if (!this.config.chains[chainName]) {
      throw new Error(`Chain with that name not registered`);
    }

    if (!this.hasUniswap(chainName)) {
      throw new Error(`Chain doesn't have uniswapV2Router contract on the config`);
    }

    return this.config.chains[chainName].uniswapV2Router;
  }

  getRPC(chainName: string): string {
    if (!this.config.chains[chainName]) {
      throw new Error(`Chain with that name not registered`);
    }
    return this.config.chains[chainName].rpc;
  }
  getChainId(chainName: string): string {
    if (!this.config.chains[chainName]) {
      throw new Error(`Chain with that name not registered`);
    }
    return this.config.chains[chainName].chainId;
  }

  getChainNativeToken(chainName: string): string {
    if (!this.config.chains[chainName]) {
      throw new Error(`Chain with that name not registered`);
    }
    return this.config.chains[chainName].nativeToken;
  }

  getConfig(): PluginConfig {
    return { ...this.config };
  }

  getChainConfig(chainName: string): ChainConfig {
    if (!this.config.chains[chainName]) {
      throw new Error(`Chain with that name not registered`);
    }

    return this.config.chains[chainName];
  }
}
