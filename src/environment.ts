import type { IAgentRuntime } from '@elizaos/core';
import { z } from 'zod';

export const skaleEnvSchema = z.object({
  EVM_WALLET_PRIVATE_KEY: z.string().optional(),
});

export type SkaleConfig = z.infer<typeof skaleEnvSchema>;

/**
 * Get configuration with defaults
 */
export function getConfig(): SkaleConfig {
  return {
    EVM_WALLET_PRIVATE_KEY: process.env.EVM_WALLET_PRIVATE_KEY,
  };
}

/**
 * Validate Skale configuration using runtime settings or environment variables
 */
export async function validateSkaleConfig(runtime: IAgentRuntime): Promise<SkaleConfig> {
  try {
    const config = {
      EVM_WALLET_PRIVATE_KEY:
        runtime.getSetting('EVM_WALLET_PRIVATE_KEY') || process.env.EVM_WALLET_PRIVATE_KEY,
    };

    return skaleEnvSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors
        .map((err) => `${err.path.join('.')}: ${err.message}`)
        .join('\n');
      throw new Error(`Skale configuration validation failed:\n${errorMessages}`);
    }
    throw error;
  }
}

/**
 * Check if a wallet is configured
 */
export function hasWalletConfigured(config: SkaleConfig): boolean {
  return !!config.EVM_WALLET_PRIVATE_KEY;
}
