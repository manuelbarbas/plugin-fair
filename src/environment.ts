import type { IAgentRuntime } from '@elizaos/core';
import { z } from 'zod';
import {BiteConfig,PluginConfig } from './types';


export function getBiteConfig(runtime: IAgentRuntime): Partial<BiteConfig> {
  try{
  const biteConfig = runtime.getSetting('biteConfig') as Partial<BiteConfig>;

  return biteConfig;
  }
  catch(error){
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors
        .map((err) => `${err.path.join('.')}: ${err.message}`)
        .join('\n');
      throw new Error(`fair configuration validation failed:\n${errorMessages}`);
    }
    throw error;
  }
}

export function getPluginConfig(runtime: IAgentRuntime): Partial<PluginConfig> {
  try{
  const pluginConfig = runtime.getSetting('PLUGIN_CONFIG') as Partial<PluginConfig>;

  return pluginConfig;
  }
  catch(error){
      if (error instanceof z.ZodError) {
      const errorMessages = error.errors
        .map((err) => `${err.path.join('.')}: ${err.message}`)
        .join('\n');
      throw new Error(`fair configuration validation failed:\n${errorMessages}`);
    }
    throw error;
    }
    
}

export function getWalletConfig(runtime: IAgentRuntime):any {
  try{
  const privateKey = runtime.getSetting('EVM_WALLET_PRIVATE_KEY');
  if (!privateKey) {
    throw new Error('EVM_WALLET_PRIVATE_KEY is missing');
  }

  return privateKey;
  }catch(error){
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors
        .map((err) => `${err.path.join('.')}: ${err.message}`)
        .join('\n');
      throw new Error(`fair configuration validation failed:\n${errorMessages}`);
    }
    throw error;
  }
}
