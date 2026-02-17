# Cross-VM Demo Status (EVM → Solana)

**Last Updated:** 2026-02-17 12:15 UTC

## 🎉 SUCCESS! EVM → Solana Working!

### Latest Successful Test
- **TX (Sepolia):** `0xbf34754ffae3495c18018176a6ebb4417001695cb63b8a5fa70258d0a925c891`
- **Status:** `submitted` (3 Solana TXs completed, no failure)
- **Message:** "Testing with registered peer v5 🎉"
- **Solana TXs:**
  1. `27mdPtdophKTDrTqu3EjRE6tgym9Ms6MKJW11kVyQW47ivfqurQhffHv6iJsjUaUgE62Ve5v6ZPhDabqAFQ18yHB`
  2. `4w4Qjk5K5JNqKUSatCCWsQEUBR9uEPeK1QAZXBGVsdyffH5yjpGEsAEdyReKo1cFhnmgba8KvXAtwnMnai9amhS9`
  3. `5198WCKND2aNR8owQDpmca5QRLZSAZnhzLDKQXw3n6EAF3LxiziENXr6AYrbWCcFtuSv4bc6SntF7aUvwWRznJHm`

## ✅ All Issues Fixed

### 1. Cost Calculation Bug
- **Problem:** Demo was underpaying because `quote.estimatedCost` wasn't returned by SDK
- **Solution:** Use API's `estimatedCost` directly (includes msgValue cost)

### 2. msgValue for Solana Destinations
- **Problem:** Solidity contract hardcoded `msgValue=0` in `_publishAndRelay()`
- **Solution:** Added `sendGreetingWithMsgValue()` function accepting `msgValue` parameter
- **New Contract:** `0x978d3cF51e9358C58a9538933FC3E277C29915C5` (Sepolia)

### 3. Peer Registration
- **Problem:** New EVM contract wasn't registered as peer on Solana
- **Solution:** Ran `registerEvmPeerDirect.ts` to register new contract
- **TX:** `3vd8PpCZApnczkjR8VZxC4puU6PbLUo9TrH7U843bd1NsSg4H6h6wtcrseE2jfo2Pj2TWJZnwMsppKC3ttDDbX5M`

## Deployed Contracts

| Chain | Contract | Purpose |
|-------|----------|---------|
| Sepolia | `0x978d3cF51e9358C58a9538933FC3E277C29915C5` | HelloWormhole (NEW - with msgValue support) ✅ |
| Sepolia | `0xC83dcae38111019e8efbA0B78CE6BA055e7A3f2c` | HelloWormhole (OLD - msgValue=0) ❌ |
| Solana Devnet | `5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp` | HelloExecutor ✅ |

## Key Parameters for Solana

- **msgValue:** 15,000,000 lamports (0.015 SOL)
- **gasLimit:** 500,000 compute units
- **Relay Instructions Format:** `0x01 + gasLimit(32hex) + msgValue(32hex)`
- **Cost:** ~0.00065 ETH (use API's `estimatedCost` + 10% buffer)

## Files Changed

- `src/HelloWormhole.sol` - Added `sendGreetingWithMsgValue()`
- `e2e/sendToSolana.ts` - Uses API cost, passes msgValue
- `e2e/.env` - Updated contract address
