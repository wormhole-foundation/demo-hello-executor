# Cross-VM Demo Status - EVM Side

**Last Updated:** 2026-02-17 13:00 UTC

## Quick State (for context recovery)

```
WORKING:
  ✅ EVM → Solana (Sepolia → Solana Devnet)
  ✅ Solana → Fogo (uses Solana repo)
  
TESTING:
  ⏳ Solana → EVM (VAAs signed, checking relay)
  
BLOCKED:
  ❌ Fogo → Solana (Fogo program config issue - see Solana STATUS.md)
```

## Key Changes in This PR

### 1. HelloWormhole.sol - msgValue Support
```solidity
function sendGreetingWithMsgValue(
    string calldata greeting,
    uint16 targetChain,
    uint128 gasLimit,
    uint128 msgValue,  // NEW: for SVM destinations (lamports)
    uint256 totalCost,
    bytes calldata signedQuote
) public payable returns (uint64 sequence)
```

### 2. e2e/sendToSolana.ts
- Uses API's `estimatedCost` directly
- Passes `msgValue` (15M lamports) in relay instructions
- Handles EVM → Solana route

### 3. Cost Calculation Fix
```typescript
// OLD (broken): quote.estimatedCost was undefined
// NEW (working): use API response directly
const cost = BigInt(quote.estimatedCost);
```

## Deployed Contracts

| Chain | Address | Notes |
|-------|---------|-------|
| Sepolia | `0x978d3cF51e9358C58a9538933FC3E277C29915C5` | NEW - with msgValue ✅ |
| Sepolia | `0xC83dcae38111019e8efbA0B78CE6BA055e7A3f2c` | OLD - msgValue=0 ❌ |

## Successful Transactions

### EVM → Solana
- **Sepolia TX:** `0xbf34754ffae3495c18018176a6ebb4417001695cb63b8a5fa70258d0a925c891`
- **Status:** `submitted`, 3 Solana TXs completed

## Key Parameters

| Parameter | Value | Notes |
|-----------|-------|-------|
| msgValue (Solana) | 15,000,000 lamports | ~0.015 SOL |
| gasLimit | 500,000 | Compute units |
| Relay Instructions | `0x01 + gasLimit(32) + msgValue(32)` | Hex encoded |

## Repos & PRs

| Repo | URL | Status |
|------|-----|--------|
| EVM (this) | [wormhole-foundation/demo-hello-executor#2](https://github.com/wormhole-foundation/demo-hello-executor/pull/2) | PR open |
| Solana | [evgeniko/demo-hello-executor-solana](https://github.com/evgeniko/demo-hello-executor-solana) | Changes on main |

## Files Changed

```
src/HelloWormhole.sol        - Added sendGreetingWithMsgValue()
e2e/sendToSolana.ts          - EVM → Solana test script
e2e/executor.ts              - Quote parsing helpers
script/SetupSolanaPeer.s.sol - Peer registration
STATUS.md                    - This file
```

## SVM↔SVM Findings (documented here for reference)

### Peer Registration Asymmetry
- Source → Dest: Register **PROGRAM** ID
- Dest → Source: Register **EMITTER** PDA

### Executor Program
Same on Solana Devnet & Fogo Testnet:
```
execXUrAsMnqMmTHj5m7N1YQgsDz3cwGLYCYuDRciV
```

## Next Steps

1. ✅ EVM → Solana working
2. ⏳ Confirm Solana → EVM completes
3. ⏳ Fix Fogo program config (needs FOGO tokens)
4. 📝 Merge PR after all routes verified
