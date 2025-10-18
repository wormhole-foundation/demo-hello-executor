# Hello Wormhole Executor Demo

This demo provides a complete example of cross-chain messaging integration with Wormhole using the Solidity SDK and the Executor (relayer). It demonstrates sending greeting messages between EVM chains using Wormhole's automatic relay infrastructure.

> **License Reminder**
>
> The code is provided on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
>
> Make sure you check/audit any code before deploying to mainnet.

## What's Included

- ✅ **HelloWormhole Contract** - Complete Executor integration with role-based access control
- ✅ **Cross-chain messaging** - Send and receive greetings between chains
- ✅ **Replay protection** - Sequence-based replay protection using SDK library
- ✅ **Fork testing** - Tests running on Sepolia and Base Sepolia forks
- ✅ **GitHub Actions CI** - Automated testing and building

## Installation

```bash
forge install
```

## Steps to Build an Executor Integration

This demo follows the standard pattern for integrating with Wormhole's Executor. Here's how to build your own:

### 1. **Create a Contract Inheriting from `ExecutorIntegration`**

Your contract must inherit from the abstract `ExecutorIntegration` contract:

```solidity
import {ExecutorIntegration} from "wormhole-solidity-sdk/Executor/Integration.sol";

contract HelloWormhole is ExecutorIntegration {
    // Your contract implementation
}
```

### 2. **Implement the Constructor**

Pass the Wormhole CoreBridge and Executor addresses to the parent constructor:

```solidity
constructor(address coreBridge, address executor) 
    ExecutorIntegration(coreBridge, executor) 
{
    // Your initialization logic
    // Example: Set up access control roles
    _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
}
```

**Finding addresses:**
- Use the Wormhole Solidity SDK's `TestnetChainConstants` or `MainnetChainConstants` libraries
- Example: `TestnetChainConstants._coreBridge(CHAIN_ID_SEPOLIA)`

### 3. **Implement `_getPeer()` Function**

Store and return trusted peer contracts on other chains:

```solidity
mapping(uint16 => bytes32) internal peers;

function _getPeer(uint16 chainId) internal view override returns (bytes32) {
    return peers[chainId];
}

// Add a function to set peers (with access control)
function setPeer(uint16 chainId, bytes32 peerAddress) external onlyRole(PEER_ADMIN_ROLE) {
    peers[chainId] = peerAddress;
}
```

### 4. **Choose and Implement Replay Protection**

Use one of the Wormhole Solidity SDK's replay protection libraries:

**Option A: Sequence-based (Recommended but strictly for finalized VAAs)**
```solidity
import {SequenceReplayProtectionLib} from "wormhole-solidity-sdk/libraries/ReplayProtection.sol";

function _replayProtect(
    uint16 emitterChainId,
    bytes32 emitterAddress,
    uint64 sequence,
    bytes calldata /* encodedVaa */
) internal override {
    SequenceReplayProtectionLib.replayProtect(emitterChainId, emitterAddress, sequence);
}
```

**Option B: Hash-based (For all consistency levels)**
```solidity
import {HashReplayProtectionLib} from "wormhole-solidity-sdk/libraries/ReplayProtection.sol";

function _replayProtect(
    uint16 emitterChainId,
    bytes32 emitterAddress,
    uint64 sequence,
    bytes calldata encodedVaa
) internal override {
    HashReplayProtectionLib.replayProtect(encodedVaa);
}
```

### 5. **Implement `_executeVaa()` - Your Core Logic**

This function handles incoming messages from other chains:

```solidity
function _executeVaa(
    bytes calldata payload,
    uint32 timestamp,
    uint16 peerChain,
    bytes32 peerAddress,
    uint64 sequence,
    uint8 consistencyLevel
) internal override {
    // Decode your payload
    string memory greeting = string(payload);
    
    // Your business logic here
    emit GreetingReceived(greeting, peerChain, peerAddress);
}
```

**Important:** This function must handle non-zero `msg.value` correctly since the calling function is payable.

### 6. **Implement Message Sending with `_publishAndRelay()`**

Create a function to send messages to other chains:

```solidity
function sendGreeting(
    string calldata greeting,
    uint16 targetChain,
    uint128 gasLimit,
    bytes calldata signedQuote  // Obtained from Executor service
) external payable returns (uint64 sequence) {
    // Encode your payload
    bytes memory payload = bytes(greeting);
    
    // Use the internal _publishAndRelay function
    sequence = _publishAndRelay(
        payload,
        200,              // consistencyLevel (200 = finalized)
        targetChain,
        msg.sender,       // refundAddress
        signedQuote,      // from Executor pricing API
        gasLimit,         // gas limit on target chain
        0,                // msg.value to forward (if any)
        ""                // extra relay instructions
    );
    
    emit GreetingSent(greeting, targetChain, sequence);
}
```

**Getting the signed quote:**
- Call the Executor's off-chain pricing API before invoking your function
- Pass the quote as `signedQuote` parameter
- Send enough value to cover: `coreBridge.messageFee() + executorFee`

### 7. **Add Access Control (Optional but Recommended)**

Use OpenZeppelin's AccessControl or Ownable libraries for managing permissions:

```solidity
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract HelloWormhole is ExecutorIntegration, AccessControl {
    bytes32 public constant PEER_ADMIN_ROLE = keccak256("PEER_ADMIN_ROLE");
    
    function setPeer(uint16 chainId, bytes32 peerAddress) 
        external 
        onlyRole(PEER_ADMIN_ROLE) 
    {
        peers[chainId] = peerAddress;
    }
}
```

## Testing

This demo includes fork tests for 2 chains

```bash
# Run all tests
forge test -vvv

# Run specific test
forge test --match-test test_DeploymentOnSepolia -vvv
```


## Deployment

1. **Set environment variables:**
```bash
export CORE_BRIDGE_ADDRESS=<wormhole-core-bridge>
export EXECUTOR_ADDRESS=<executor-address>
export PRIVATE_KEY=<your-private-key>
```

2. **Deploy to testnet:**
```bash
forge script script/HelloWormhole.s.sol --rpc-url sepolia --broadcast
```

3. **Set up peers:**
```solidity
// After deploying to both chains, set them as peers
helloWormholeSepolia.setPeer(CHAIN_ID_BASE_SEPOLIA, baseSepoliaAddress);
helloWormholeBaseSepolia.setPeer(CHAIN_ID_SEPOLIA, sepoliaAddress);
```

## Key Concepts

### Chain IDs
Wormhole uses its own chain ID system. Use constants from the SDK:
```solidity
import {CHAIN_ID_SEPOLIA, CHAIN_ID_BASE_SEPOLIA} from "wormhole-solidity-sdk/constants/Chains.sol";
```

### Universal Addresses
Cross-chain addresses are represented as `bytes32`:
```solidity
import {toUniversalAddress, fromUniversalAddress} from "wormhole-solidity-sdk/utils/UniversalAddress.sol";
```

### Consistency Levels
- `1` = Instant (use hash-based replay protection)
- `200` = Finalized (use sequence-based replay protection)
- `201` = Safe (hash or sequence depending on risk tolerance, hash preferred)
- `203` = Custom (hash or sequence depending on risk tolerance, hash preferred)

## Resources

- [Wormhole Docs](https://wormhole.com/docs)
- [Solidity SDK](https://github.com/wormhole-foundation/wormhole-solidity-sdk)
- [Executor Documentation](https://wormhole.com/docs/protocol/infrastructure/relayer/#executor)
