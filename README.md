# @elizaos/plugin-fair

This plugin provides actions and providers for interacting with the FAIR Testent network with MEV protection through BITE Protocol integration.

## Description

The FAIR plugin provides comprehensive functionality for interacting with the FAIR Testnet network, including token transfers, swaps, and balance checking with optional MEV protection through BITE Protocol encryption.

## Features

- FAIR Testnet network integration
- MEV protection through BITE Protocol encryption
- Token balance checking
- Token transfers (USDC, USDT, FAIR, SKL)
- Token swapping using Uniswap v2
- Optional transaction encryption for enhanced security
- Comprehensive transaction management

## Installation

```bash
bun add @elizaos/plugin-fair
```

## Configuration

### Required Environment Variables

```env
# Required
EVM_WALLET_PRIVATE_KEY=your-private-key-here
```

### Settings Config

The BITE protocol usage can be set it two different ways:
- **automatic**: the BITE encryption is automatically on and transactions are encrypted by default
 - Example: `Trade 25 SKL to USDC with 2% slippage and BITE encryption` -> this will make an **encrypted** swap of 25 SKL to USDC
 - Example: `Trade 25 SKL to USDC with 2% slippage` -> this will make an **encrypted** swap of 25 SKL to USDC

- **manual**: the BITE encryption is disbaled by default. To turn it on it should be requested on the prompt to BITE encrypt the transaction
 - Example: `Trade 25 SKL to USDC with 2% slippage and BITE encryption` -> this will make an **encrypted** swap of 25 SKL to USDC
 - Example: `Trade 25 SKL to USDC with 2% slippage` -> this will make a swap of 25 SKL to USCD with **no encryption**

#### Plugin Configuration

Under settings set **biteConfig** to `automatic` or `manual`.

```typescript
{
  "name": "MyAgent",
  "plugins": ["@elizaos/plugin-fair"],
  "settings": {
      "biteConfig": "automatic"
  }
}
```


## Actions

### 1. Get Balance

Check token balances on the FAIR Testnet network:

```typescript
// Example: Check USDT balance
Check my balance of USDT
```

### 2. Transfer

Transfer tokens on the FAIR Testnet network with optional BITE encryption:

```typescript
// Example: Basic transfer
Send 10 USDC to 0x123...

// Example: Transfer with BITE encryption
Transfer 25 SKL to 0x123... with BITE encryption

// Example: Encrypted transfer
Send 0.5 USDC to 0x123... encrypted
```

**Supported tokens:**

- USDC
- USDT
- FAIR
- SKL

### 3. Swap

Swap tokens using Uniswap v2 with optional MEV protection:

```typescript
// Example: Basic swap
Exchange 50 USDT for FAIR tokens

// Example: Swap with slippage and BITE encryption
Trade 25 SKL to USDC with 2% slippage and BITE encryption

// Example: Swap with MEV protection
Convert 200 FAIR to USDT with mev protection
```

**Supported trading pairs:**

- USDC ↔ SKL
- USDC ↔ FAIR
- SKL ↔ FAIR

## BITE Protocol Integration

The plugin integrates with BITE Protocol to provide MEV protection through transaction encryption. This encryption makes transactions instantly MEV protected since it encrypts transactions until they are final.
