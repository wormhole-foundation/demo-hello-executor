# Hello Wormhole Executor Demo

Cross-chain messaging with Wormhole Executor, demonstrating both **off-chain** and **on-chain** quote methods.

> **License:** Code provided "AS IS", without warranties. Audit before mainnet deployment.

## Cross-VM Status (EVM ↔ Solana)

| Route | Status | Notes |
|-------|--------|-------|
| EVM → Solana | ✅ **Working** | TX: `0xbf347...` - 3 Solana TXs completed |
| Solana → Fogo | ✅ **Working** | 3 TXs completed on Fogo |
| Solana → EVM | ⏳ Testing | VAAs signed (13-16) |
| Fogo → Solana | ⏳ Code ready | Needs FOGO funding for relay |

### Key Changes for Cross-VM

1. **HelloWormhole.sol** - Added `sendGreetingWithMsgValue()` for SVM destinations
2. **msgValue** - SVM destinations need ~15M lamports (~0.015 SOL) for rent/fees
3. **Cost calculation** - Use API's `estimatedCost` directly (SDK didn't return it)

### Key Findings: SVM↔SVM Peer Registration

- **Source chain:** Register destination **PROGRAM** ID
- **Dest chain:** Register source **EMITTER** PDA

### Related

- **Solana repo:** https://github.com/evgeniko/demo-hello-executor-solana
- **New Sepolia contract:** `0x978d3cF51e9358C58a9538933FC3E277C29915C5`

---

## Contracts

| Contract                    | Quote Method    | Base Class                         | Constructor Param      |
| --------------------------- | --------------- | ---------------------------------- | ---------------------- |
| `HelloWormhole`             | Off-chain (API) | `ExecutorSendReceiveQuoteOffChain` | `executor`             |
| `HelloWormholeOnChainQuote` | On-chain        | `ExecutorSendReceiveQuoteOnChain`  | `executorQuoterRouter` |

### Key Differences

**Off-chain quotes** require fetching a `signedQuote` from the Executor API before sending:

```solidity
function sendGreeting(..., bytes calldata signedQuote) external payable;
```

**On-chain quotes** use a quoter contract directly—no API call needed:

```solidity
function quoteGreeting(uint16 targetChain, uint128 gasLimit, address quoterAddress) external view returns (uint256);
function sendGreeting(..., address quoterAddress) external payable;
```

## Deployed Contracts (Testnet)

| Chain        | HelloWormhole (Off-chain)                    | HelloWormholeOnChainQuote                    |
| ------------ | -------------------------------------------- | -------------------------------------------- |
| Sepolia      | `0x8f6E15d9A4d0abCe4814c7d86D5B741A91bDCC04` | `0x86B9182095dca2bdFDFeC7614Af6EC5fAfa910a6` |
| Base Sepolia | `0xdF781F7473a1A7C20C1e5fC5f427Fa712dafB698` | `0x8Be172f2575fe38560bcF0587Ae4269Cb4CC3D18` |

**On-chain Quoter:** `0x5241C9276698439fEf2780DbaB76fEc90B633Fbd`

## Installation

```bash
forge install   # Solidity dependencies
npm install     # TypeScript/E2E dependencies
```

## Building an Executor Integration

### 1. Choose Your Base Contract

```solidity
// Off-chain quotes (requires API call for signedQuote)
import {ExecutorSendReceiveQuoteOffChain} from "wormhole-solidity-sdk/Executor/Integration.sol";

// On-chain quotes (query quoter contract directly)
import {ExecutorSendReceiveQuoteOnChain} from "wormhole-solidity-sdk/Executor/Integration.sol";

// Both methods supported
import {ExecutorSendReceiveQuoteBoth} from "wormhole-solidity-sdk/Executor/Integration.sol";
```

Also available: `ExecutorSendQuote*` (send-only) and `ExecutorReceive` (receive-only) variants.

### 2. Implement Constructor

```solidity
// Off-chain: pass executor address
constructor(address coreBridge, address executor)
    ExecutorSendReceiveQuoteOffChain(coreBridge, executor) {}

// On-chain: pass executorQuoterRouter address
constructor(address coreBridge, address executorQuoterRouter)
    ExecutorSendReceiveQuoteOnChain(coreBridge, executorQuoterRouter) {}
```

### 3. Implement Required Functions

```solidity
// Peer management
function _getPeer(uint16 chainId) internal view override returns (bytes32) {
    return peers[chainId];
}

// Replay protection (sequence-based for finalized VAAs)
function _replayProtect(uint16 emitterChainId, bytes32 emitterAddress, uint64 sequence, bytes calldata)
    internal override {
    SequenceReplayProtectionLib.replayProtect(emitterChainId, emitterAddress, sequence);
}

// Handle incoming messages
function _executeVaa(bytes calldata payload, uint32, uint16 peerChain, bytes32 peerAddress, uint64, uint8)
    internal override {
    string memory greeting = string(payload);
    emit GreetingReceived(greeting, peerChain, peerAddress);
}
```

### 4. Send Messages

```solidity
// Off-chain quote version
sequence = _publishAndRelay(payload, consistencyLevel, totalCost, targetChain, refundAddr,
    signedQuote, gasLimit, msgVal, extraInstructions);

// On-chain quote version
sequence = _publishAndRelay(payload, consistencyLevel, totalCost, targetChain, refundAddr,
    quoterAddress, gasLimit, msgVal, extraInstructions);
```

## Testing

```bash
forge test -vvv                                    # All tests
forge test --match-contract HelloWormholeOnChainQuoteTest -vvv  # On-chain quote tests only
```

## Deployment

```bash
# Set environment
export PRIVATE_KEY=0x...
export ETHERSCAN_API_KEY=...
export SEPOLIA_RPC_URL=https://...
export BASE_SEPOLIA_RPC_URL=https://...

# Deploy (auto-detects chain and uses correct addresses)
forge script script/HelloWormholeOnChainQuote.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast --verify
forge script script/HelloWormholeOnChainQuote.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify

# Set peers (after updating .env with deployed addresses)
forge script script/SetupPeersOnChainQuote.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast
forge script script/SetupPeersOnChainQuote.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast
```

## E2E Testing

```bash
cd e2e
cp .env.example .env  # Fill in private keys and contract addresses
npx tsx testOnChainQuote.ts  # On-chain quote E2E
npx tsx test.ts              # Off-chain quote E2E
```

## Key Concepts

| Concept                 | Description                                                                  |
| ----------------------- | ---------------------------------------------------------------------------- |
| **Chain IDs**           | Wormhole uses its own IDs: `CHAIN_ID_SEPOLIA`, `CHAIN_ID_BASE_SEPOLIA`, etc. |
| **Universal Addresses** | Cross-chain addresses as `bytes32` via `toUniversalAddress()`                |
| **Consistency Levels**  | `1`=Instant, `200`=Finalized, `201`=Safe                                     |

## Resources

- [Wormhole Docs](https://wormhole.com/docs)
- [Solidity SDK](https://github.com/wormhole-foundation/wormhole-solidity-sdk)
- [Executor Documentation](https://wormhole.com/docs/protocol/infrastructure/relayer/#executor)
