# Plugin Tests

This directory contains comprehensive test suites for the SKALE plugin actions.

## Test Structure

The tests are organized by action type, with each action having its own test file:

- `getBalance.test.ts` - Tests for the GetBalanceAction
- `swap.test.ts` - Tests for the SwapAction
- `transfer.test.ts` - Tests for the TransferAction

## Test Coverage

### GetBalanceAction Tests (`getBalance.test.ts`)

**Core Functionality:**

- Native token balance retrieval (FAIR)
- ERC20 token balance retrieval (USDC, USDT)
- Unsupported token error handling

**Parameter Validation:**

- Default chain assignment (fair-testnet)
- Wallet address fallback when no address provided
- Invalid address string handling (null, undefined)
- Valid hex address preservation
- Token symbol address confusion handling

**Balance Calculation:**

- Formatted token balance with decimals
- Different token decimal handling (6, 18 decimals)

### SwapAction Tests (`swap.test.ts`)

**Core Functionality:**

- Native token to ERC20 token swaps (FAIR → USDC)
- ERC20 token to native token swaps (USDC → FAIR)
- ERC20 token to ERC20 token swaps (USDC → USDT)
- Bite encryption support
- Slippage parameter handling

**Error Handling:**

- Unsupported chain validation
- Unsupported token validation
- Missing inputToken/outputToken validation
- Same token swap prevention
- Amount validation (required, positive, non-zero)
- Slippage bounds validation (0-50%)

**Advanced Features:**

- Token address resolution (symbols vs addresses)
- Output amount calculation with slippage
- Liquidity validation error handling

### TransferAction Tests (`transfer.test.ts`)

**Core Functionality:**

- Native token transfers (FAIR)
- ERC20 token transfers (USDC, USDT)
- Bite encryption support
- Additional transaction data handling

**Parameter Validation:**

- Required toAddress validation
- Address formatting
- Amount validation (positive, non-zero, non-negative)
- Data parameter handling (null, hex)

**Edge Cases:**

- Null/empty token handling (defaults to native)
- String "null" token handling
- Different token decimals (6, 18)
- Transaction hash validation
- Unsupported chain validation

## Running Tests

### Prerequisites

Ensure you have Bun installed as the test runner:

```bash
npm install -g bun
```

### Run All Tests

From the plugin root directory:

```bash
# Run all tests
bun test tests/

# Run with verbose output
bun test tests/ --verbose

# Run with coverage
bun test tests/ --coverage
```

### Run Individual Test Files

```bash
# Run only GetBalance tests
bun test tests/getBalance.test.ts

# Run only Swap tests
bun test tests/swap.test.ts

# Run only Transfer tests
bun test tests/transfer.test.ts
```

### Run Specific Test Cases

```bash
# Run tests matching a pattern
bun test tests/ --grep "should transfer native tokens"

# Run tests for a specific describe block
bun test tests/ --grep "validateAndNormalizeParams"
```
