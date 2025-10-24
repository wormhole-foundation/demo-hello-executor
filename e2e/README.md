# HelloWormhole End-to-End Testing

This directory contains a complete end-to-end test suite for the HelloWormhole cross-chain messaging integration using the **Wormhole Executor** service. The test demonstrates real cross-chain message delivery between Sepolia and Base Sepolia testnets using the Wormhole TypeScript SDK.

## Table of Contents

-   [What This Does](#what-this-does)
-   [How It Works](#how-it-works)
-   [Setup](#setup)
-   [Running Tests](#running-tests)
-   [Code Structure](#code-structure)
-   [Resources](#resources)

## What This Does

This test suite:

1. **Requests a delivery quote** from the Wormhole Executor using the TypeScript SDK
2. **Sends a cross-chain message** from Sepolia to Base Sepolia with automatic relay
3. **Tracks the VAA** (Verifiable Action Approval) as it's signed by Wormhole Guardians
4. **Waits for automatic delivery** by the Executor service
5. **Verifies message receipt** on the target chain

The Executor automatically relays your message after Guardians sign it—you don't need to manually submit the VAA to the target chain.

## How It Works

### 1. Request Executor Quote

The test starts by creating relay instructions and requesting a quote:

```typescript
// Create relay instructions (VAAv1 format)
const relayInstructions = createRelayInstructions(
    DEFAULT_GAS_LIMIT, // 171948n - gas for target chain execution
    DEFAULT_MSG_VALUE // 0n - no native token forwarding
);
// Result: 0x0100000000000000000000000000029fac00000000000000000000000000000000

// Request quote from Executor
const quote = await getExecutorQuote({
    srcChain: 10002, // Sepolia chain ID
    dstChain: 10004, // Base Sepolia chain ID
    relayInstructions, // Encoded instructions
});
```

**What the Executor returns:**

-   `signedQuote` - Cryptographically signed quote string to pass to contract
-   `estimatedCost` - Cost in source chain native tokens (wei) for delivery

### 2. Calculate Total Cost

The transaction must pay both the Wormhole messaging fee and the Executor delivery fee:

```typescript
const wormholeFee = await coreBridge.quoteEVMDeliveryPrice(
    targetChainId,
    0, // receiverValue
    gasLimit
);

const totalCost = wormholeFee + BigInt(quote.estimatedCost);
```

**Critical:** The `estimatedCost` from the quote must be paid exactly, or the Executor will reject the delivery as "underpaid".

### 3. Send Message with Executor

```typescript
const tx = await contract.sendGreeting(
    'Hello from Sepolia!',
    targetChainId,
    gasLimit,
    quote.signedQuote,
    { value: totalCost } // MUST match Wormhole fee + Executor estimate
);
```

This calls `_publishAndRelay()` in your contract, which:

1. Publishes the message to Wormhole Core (emits VAA)
2. Requests execution from Executor with the signed quote
3. Pays the Executor for delivery

### 4. VAA Signing

Wormhole Guardians observe the transaction and sign the VAA:

-   19 Guardian nodes independently observe the event
-   Each Guardian signs the VAA
-   VAA becomes valid when 13+ signatures are collected
-   Process typically takes 1-2 minutes on testnets

### 5. Automatic Relay

The Executor service automatically:

1. Monitors for `RequestForExecution` events with its signed quotes
2. Waits for VAA finality (19/19 Guardian signatures)
3. Fetches the signed VAA from the Guardian network
4. Calls `receiveMessage()` on the target Executor contract
5. Executor contract calls your `executeVAAv1()` function
6. Your `_executeVaa()` is invoked with the message payload

**The gas you specified in relay instructions is provided by the Executor!**

### 6. Message Receipt

On the target chain, your contract's `_executeVaa()` is called:

```solidity
function _executeVaa(
    bytes calldata payload,
    bytes32 peerAddress,
    uint16 peerChain
) internal override {
    string memory greeting = string(payload);
    emit GreetingReceived(greeting, peerChain, peerAddress);
}
```

The test polls for this `GreetingReceived` event to confirm delivery.

## Setup

### 1. Install Dependencies

From the project root:

```bash
npm install
```

### 2. Deploy Contracts

Deploy HelloWormhole to both Sepolia and Base Sepolia using Foundry:

```bash
# Deploy to Sepolia
forge script script/HelloWormhole.s.sol:HelloWormholeScript \
  --rpc-url $SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast --verify --etherscan-api-key $ETHERSCAN_API_KEY

# Deploy to Base Sepolia
forge script script/HelloWormhole.s.sol:HelloWormholeScript \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast --verify --etherscan-api-key $BASESCAN_API_KEY
```

### 3. Configure Environment

Copy the example environment file:

```bash
cp e2e/.env.example .env
```

Edit `.env` and provide:

```env
# Private keys (must have testnet ETH on both chains)
PRIVATE_KEY_SEPOLIA=0x...
PRIVATE_KEY_BASE_SEPOLIA=0x...

# Deployed HelloWormhole contract addresses
HELLO_WORMHOLE_SEPOLIA=0x...
HELLO_WORMHOLE_BASE_SEPOLIA=0x...

# Wormhole chain IDs (these are standard)
CHAIN_ID_SEPOLIA=10002
CHAIN_ID_BASE_SEPOLIA=10004
```

**Optional overrides:**

```env
# Use custom RPC URLs instead of SDK defaults
SEPOLIA_RPC_URL=https://your-rpc.com
BASE_SEPOLIA_RPC_URL=https://your-rpc.com
```

### 4. Register Cross-Chain Peers

Each contract must recognize the other as a valid peer:

```bash
# Set environment variables
export PRIVATE_KEY=0x...
export HELLO_WORMHOLE_SEPOLIA=0x8f6E15d9A4d0abCe4814c7d86D5B741A91bDCC04
export HELLO_WORMHOLE_BASE_SEPOLIA=0xdF781F7473a1A7C20C1e5fC5f427Fa712dafB698

# Register Base Sepolia as peer on Sepolia
forge script script/SetupPeers.s.sol:SetupPeersScript \
  --rpc-url https://ethereum-sepolia.publicnode.com \
  --private-key $PRIVATE_KEY \
  --broadcast -vv

# Register Sepolia as peer on Base Sepolia
forge script script/SetupPeers.s.sol:SetupPeersScript \
  --rpc-url https://base-sepolia-rpc.publicnode.com \
  --private-key $PRIVATE_KEY \
  --broadcast -vv
```

## Running Tests

Run the end-to-end test:

```bash
npm run e2e:test
```

### What Happens

The test executes the following flow:

```
1. ┌─────────────────────────────────────────┐
   │ Request Quote from Executor             │
   │ - Create relay instructions             │
   │ - Call SDK's fetchQuote()               │
   └─────────────────────────────────────────┘
                    ↓
2. ┌─────────────────────────────────────────┐
   │ Send Greeting (Sepolia)                 │
   │ - Calculate total cost                  │
   │ - Call sendGreeting() with signedQuote  │
   │ - Pay Wormhole fee + Executor estimate  │
   └─────────────────────────────────────────┘
                    ↓
3. ┌─────────────────────────────────────────┐
   │ Track VAA on Wormhole Scan              │
   │ - Poll for VAA by tx hash               │
   │ - Wait for Guardian signatures          │
   └─────────────────────────────────────────┘
                    ↓
4. ┌─────────────────────────────────────────┐
   │ Executor Automatically Relays           │
   │ - Fetches signed VAA                    │
   │ - Calls executeVAAv1() on Base Sepolia  │
   └─────────────────────────────────────────┘
                    ↓
5. ┌─────────────────────────────────────────┐
   │ Verify Receipt (Base Sepolia)           │
   │ - Poll for GreetingReceived event       │
   │ - Confirm message delivered             │
   └─────────────────────────────────────────┘
```

## Code Structure

### Relay Instructions Encoding (`relay.ts`)

Relay instructions specify how the Executor should deliver your message:

```typescript
export function createRelayInstructions(
    gasLimit: bigint,
    msgValue: bigint
): string {
    // VAAv1 format: version (1 byte) + gasLimit (16 bytes) + msgValue (16 bytes)
    const version = '01';
    const gas = gasLimit.toString(16).padStart(32, '0');
    const value = msgValue.toString(16).padStart(32, '0');
    return `0x${version}${gas}${value}`;
}
```

**Format breakdown:**

-   `0x01` - Version byte (VAAv1 format)
-   `00000000000000000000000000029fac` - Gas limit (171948 in hex, as uint128)
-   `00000000000000000000000000000000` - Msg value (0, as uint128)

### Executor API Client (`executor.ts`)

Wraps the SDK's Executor API functions:

```typescript
export async function getExecutorQuote(
    params: ExecutorQuoteParams
): Promise<ExecutorQuote> {
    const apiUrl = executor.executorAPI('Testnet');

    // Use SDK's fetchQuote function
    const response = await fetchQuote(
        apiUrl,
        params.srcChain,
        params.dstChain,
        params.relayInstructions
    );

    // SDK returns both signedQuote AND estimatedCost
    return {
        signedQuote: response.signedQuote,
        estimatedCost: response.estimatedCost,
    };
}
```

**Key points:**

-   Uses SDK's `fetchQuote()` exclusively
-   Extracts `estimatedCost` from response (critical for payment)
-   Returns structured quote object

### Message Sending (`messaging.ts`)

Orchestrates the quote → transaction flow:

```typescript
export async function sendGreeting(
    fromConfig: ChainConfig,
    toConfig: ChainConfig,
    greeting: string
): Promise<SendGreetingResult> {
    // 1. Create relay instructions
    const relayInstructions = createRelayInstructions(
        DEFAULT_GAS_LIMIT,
        DEFAULT_MSG_VALUE
    );

    // 2. Get quote from Executor
    const quote = await getExecutorQuote({
        srcChain: fromConfig.chainId,
        dstChain: toConfig.chainId,
        relayInstructions,
    });

    // 3. Calculate total cost
    const totalCost = await calculateTotalCost(
        contract,
        toConfig.chainId,
        DEFAULT_GAS_LIMIT,
        quote.estimatedCost
    );

    // 4. Send transaction
    const tx = await contract.sendGreeting(
        greeting,
        toConfig.chainId,
        DEFAULT_GAS_LIMIT,
        quote.signedQuote,
        { value: totalCost }
    );

    return { receipt, sequence };
}
```

## Resources

-   [Wormhole Documentation](https://docs.wormhole.com/)
-   [Executor Tutorial](https://docs.wormhole.com/wormhole/quick-start/tutorials/hello-wormhole)
-   [Example Messaging Executor](https://github.com/wormholelabs-xyz/example-messaging-executor)
-   [Wormhole TypeScript SDK](https://github.com/wormhole-foundation/wormhole-sdk-ts)
-   [Wormhole Scan (Testnet)](https://wormholescan.io/#/?network=Testnet)
