export const getBalanceTemplate = `Given the recent messages and wallet information below:

{{recentMessages}}

{{walletInfo}}

Extract the following information about the requested check balance:
- Chain to execute on. It should be fair-testnet
- tokenSymbol OR token: The token symbol (e.g., "USDT", "USDC", "WFAIR", "SKL", "FAIR") or if left empty default to FAIR. Could be a token symbol or address. If the address is provided, it must be a valid Ethereum address starting with "0x". Default is "FAIR".
- Address to check balance for. Optional, must be a valid Ethereum address starting with "0x" or a web3 domain name.

If any field is not provided, use the default value. If no default value is specified, use null.

Respond with an XML block containing only the extracted values. Use key-value pairs:

<response>
    <chain>SUPPORTED_CHAIN</chain>
    <address>string or null</address>
    <token>string</token>
</response>
`;

export const transferTemplate = `Given the recent messages and wallet information below:

{{recentMessages}}

{{walletInfo}}

Extract the following information about the requested transfer:
- chain. If no chain name is given please default to "fair-testnet"
- toAddress: The recipient wallet address (required)
- amount: The amount to transfer (required)
- tokenSymbol ot token: The token symbol to transfer (leave empty for native FAIR token).  The token symbol (e.g., "USDT", "USDC", "WFAIR", "SKL", "FAIR") or if left empty default to FAIR
- isBite: If the biteConfig is set to 'automatic' always use isBite as true. If biteConfig is set to 'manual' then it's optional and checks if the trasnsaction is encrypted with the Bite middleware or not.


Respond with an XML block containing only the extracted values:

<response>
    <chain>SUPPORTED_CHAIN</chain>
    <token>string or null</token>
    <amount>string or null</amount>
    <toAddress>string</toAddress>
    <isBite>boolean</isBite>

</response>`;

export const swapTemplate = `Given the recent messages and wallet information below:

{{recentMessages}}

{{walletInfo}}

The user wants to swap tokens. To swap the tokens it will be used the Uniswap V2 Router contract. Extract the following information:
- chain: The blockchain name. If nothing is provided please use chain "fair-testnet"
- inputToken: The token to swap from (symbol or address)  
- outputToken: The token to swap to (symbol or address)
- amount: The amount to swap
- slippage: Optional slippage tolerance (default 0.5%)
- isBite: If the biteConfig is set to 'automatic' always use isBite as true. If biteConfig is set to 'manual' then it's optional and checks if the trasnsaction is encrypted with the Bite middleware or not. When no encryption of the swap transaction is mentioned or saying to use bite on the transaction set the isBite to false


Respond with an XML block containing only the extracted values:

<response>
    <chain>SUPPORTED_CHAIN</chain>
    <inputToken>TOKEN_SYMBOL_OR_ADDRESS</fromToken>
    <outputToken>TOKEN_SYMBOL_OR_ADDRESS</toToken>
    <amount>AMOUNT</amount>
    <slippage>SLIPPAGE_PERCENTAGE</slippage>
    <isBite>boolean</isBite>
</response>
`;
