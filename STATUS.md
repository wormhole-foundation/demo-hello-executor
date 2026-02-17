# Cross-VM Demo Status

**Last Updated:** 2026-02-17 12:52 UTC

## 🎉 Multiple Routes Working!

| Direction | Status | Notes |
|-----------|--------|-------|
| EVM → Solana | ✅ Working | msgValue + API cost fixed |
| Solana → Fogo | ✅ Working | Peer registration + msgValue fixed |
| Solana → EVM | ⏳ Testing | VAAs signing (13-16), checking relay |
| Fogo → Solana | 🔧 Needs testing | SVM↔SVM route |

## Key Fixes Applied

### 1. Cost Calculation
- **Problem:** SDK didn't return `estimatedCost`
- **Solution:** Use API's `estimatedCost` directly

### 2. msgValue for SVM Destinations
- **Solidity:** Added `sendGreetingWithMsgValue()` accepting `msgValue` parameter
- **Value:** 15,000,000 lamports (0.015 SOL) for rent/fees

### 3. SVM↔SVM Peer Registration (Asymmetric!)
- **Source chain:** Register destination **PROGRAM** (for routing)
- **Dest chain:** Register source **EMITTER** (for VAA verification)

This differs from EVM↔EVM where the same address is registered on both sides.

## Deployed Contracts

| Chain | Address | Notes |
|-------|---------|-------|
| Sepolia | `0x978d3cF51e9358C58a9538933FC3E277C29915C5` | HelloWormhole (with msgValue) ✅ |
| Sepolia | `0xC83dcae38111019e8efbA0B78CE6BA055e7A3f2c` | HelloWormhole (old, msgValue=0) ❌ |
| Solana Devnet | `5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp` | HelloExecutor ✅ |
| Fogo Testnet | TBD | HelloExecutor |

## Executor Program Addresses

Both Solana Devnet and Fogo Testnet share the same Executor program:
```
execXUrAsMnqMmTHj5m7N1YQgsDz3cwGLYCYuDRciV
```

## Successful Transactions

### EVM → Solana
- **Sepolia TX:** `0xbf34754ffae3495c18018176a6ebb4417001695cb63b8a5fa70258d0a925c891`
- **Status:** `submitted`, 3 Solana TXs completed

### Solana → Fogo
- **Status:** `submitted`, 3 TXs completed
- **Fogo blocks:** 692607960, 692608021, 692608070

## Key Parameters

| Parameter | Value | Notes |
|-----------|-------|-------|
| msgValue (Solana) | 15,000,000 lamports | ~0.015 SOL for rent/fees |
| gasLimit (EVM) | 500,000 | Compute units |
| Relay Instructions | `0x01 + gasLimit + msgValue` | 32-byte hex each |
| Cost buffer | +10% | On API's estimatedCost |

## Testing

```bash
# EVM → Solana
npx tsx e2e/sendToSolana.ts "Hello from Sepolia!"

# Check relay status
curl -s -X POST "https://executor-testnet.labsapis.com/v0/status/tx" \
  -H "Content-Type: application/json" \
  -d '{"chainId": 10002, "txHash": "<TX_HASH>"}'
```

## Related

- **Solana repo:** https://github.com/evgeniko/demo-hello-executor-solana
- **PR:** [wormhole-foundation/demo-hello-executor#2](https://github.com/wormhole-foundation/demo-hello-executor/pull/2)

## Next Steps

1. ✅ ~~Fix EVM → Solana relay~~
2. ✅ ~~Fix Solana → Fogo relay~~
3. ⏳ Confirm Solana → EVM relay completes
4. 🔧 Test Fogo → Solana route
5. 📝 Document SVM↔SVM patterns for Wormhole docs
