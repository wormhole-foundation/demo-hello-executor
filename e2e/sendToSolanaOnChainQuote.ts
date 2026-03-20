#!/usr/bin/env tsx
/**
 * Send greeting from Sepolia to Solana via Executor using ON-CHAIN QUOTE
 *
 * This uses the updated HelloWormholeOnChainQuote contract which supports
 * Solana destinations via sendGreetingWithMsgValue + quoteGreetingWithMsgValue.
 *
 * Flow:
 *   1. quoteGreetingWithMsgValue  — get on-chain quote (includes msgValue for Solana rent)
 *   2. sendGreetingWithMsgValue   — publish Wormhole message + request relay via quoter router
 *
 * Usage:
 *   npx tsx e2e/sendToSolanaOnChainQuote.ts "Hello from Sepolia (on-chain quote)!"
 */

import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pollForExecutorStatus } from './executor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

// Configuration
const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const PRIVATE_KEY = process.env.PRIVATE_KEY_SEPOLIA!;

// HelloWormholeOnChainQuote contract with Solana peer support.
// Deploy with: forge script script/HelloWormholeOnChainQuote.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast
// Then register Solana peer: forge script script/SetupSolanaPeerOnChainQuote.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast
const HELLO_WORMHOLE_OC = process.env.HELLO_WORMHOLE_OC_SEPOLIA_CROSSVM!;
if (!HELLO_WORMHOLE_OC) {
    throw new Error('HELLO_WORMHOLE_OC_SEPOLIA_CROSSVM not set. Deploy the contract and set this in e2e/.env');
}

// Wormhole chain IDs — full reference: https://docs.wormhole.com/products/reference/chain-ids/
const CHAIN_ID_SOLANA = 1;

// On-chain quoter address (operated by Wormhole)
const QUOTER_ADDRESS = process.env.QUOTER_ADDRESS
    || '0x5241c9276698439fef2780dbab76fec90b633fbd';

// Solana-specific: msgValue in LAMPORTS for rent + priority fees on the Solana side.
// This is forwarded by the Executor when calling receive_greeting. Adjust upward
// if delivery fails with insufficient funds for account creation.
const SOLANA_MSG_VALUE_LAMPORTS = 15_000_000n; // ~0.015 SOL

// Gas limit for Solana execution (compute units)
const GAS_LIMIT = 500_000n;

const ABI = [
    'function quoteGreetingWithMsgValue(uint16 targetChain, uint128 gasLimit, uint128 msgValue, address quoterAddress) external view returns (uint256 totalCost)',
    'function sendGreetingWithMsgValue(string calldata greeting, uint16 targetChain, uint128 gasLimit, uint128 msgValue, uint256 totalCost, address quoterAddress) external payable returns (uint64 sequence)',
    'function peers(uint16 chainId) external view returns (bytes32)',
    'event GreetingSent(string greeting, uint16 targetChain, uint64 sequence)',
];

async function main() {
    const greeting = process.argv[2] || 'Hello from Sepolia (on-chain quote)!';

    console.log('Sending Greeting: Sepolia -> Solana (On-Chain Quote)\n');
    console.log(`Message: "${greeting}"`);

    const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    console.log(`Wallet: ${wallet.address}`);

    const balance = await provider.getBalance(wallet.address);
    console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

    const contract = new ethers.Contract(HELLO_WORMHOLE_OC, ABI, wallet);

    // Verify peer is set
    const peer = await contract.peers(CHAIN_ID_SOLANA);
    if (peer === ethers.ZeroHash) {
        throw new Error('No Solana peer registered on contract. Run SetupSolanaPeer first.');
    }
    console.log(`\nSolana peer: ${peer}`);

    // Step 1: Get on-chain quote
    console.log('\nGetting on-chain quote...');
    console.log(`  Gas limit: ${GAS_LIMIT}`);
    console.log(`  msgValue: ${SOLANA_MSG_VALUE_LAMPORTS} lamports (${Number(SOLANA_MSG_VALUE_LAMPORTS) / 1e9} SOL)`);
    console.log(`  Quoter: ${QUOTER_ADDRESS}`);

    const totalCost = await contract.quoteGreetingWithMsgValue(
        CHAIN_ID_SOLANA,
        GAS_LIMIT,
        SOLANA_MSG_VALUE_LAMPORTS,
        QUOTER_ADDRESS,
    );

    console.log(`  Total cost: ${ethers.formatEther(totalCost)} ETH (${totalCost} wei)`);

    if (balance < totalCost) {
        throw new Error(`Insufficient balance: have ${ethers.formatEther(balance)}, need ${ethers.formatEther(totalCost)}`);
    }

    // Step 2: Send greeting
    console.log('\nSending greeting with on-chain quote...');
    const tx = await contract.sendGreetingWithMsgValue(
        greeting,
        CHAIN_ID_SOLANA,
        GAS_LIMIT,
        SOLANA_MSG_VALUE_LAMPORTS,
        totalCost,
        QUOTER_ADDRESS,
        { value: totalCost },
    );

    console.log(`TX Hash: ${tx.hash}`);
    console.log(`Explorer: https://sepolia.etherscan.io/tx/${tx.hash}`);

    console.log('\nWaiting for confirmation...');
    const receipt = await tx.wait();
    console.log(`Confirmed in block ${receipt.blockNumber}`);

    // Parse GreetingSent event
    let vaaSequence: bigint | undefined;
    const iface = new ethers.Interface(ABI);
    for (const log of receipt.logs) {
        try {
            const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
            if (parsed?.name === 'GreetingSent') {
                vaaSequence = BigInt(parsed.args[2]);
                console.log(`\nGreetingSent event:`);
                console.log(`   Message: ${parsed.args[0]}`);
                console.log(`   Target Chain: ${parsed.args[1]}`);
                console.log(`   Sequence: ${vaaSequence}`);
            }
        } catch {}
    }

    // Poll executor status
    const executorStatus = await pollForExecutorStatus(
        'Sepolia',
        receipt.hash,
        'Testnet',
        120000,
    );

    if (Array.isArray(executorStatus)) {
        const relay = executorStatus[0];
        if (relay?.status === 'submitted' && relay.txs?.length) {
            console.log('\nSUCCESS! Message delivered to Solana!');
            console.log(`   Solana TX: ${relay.txs[0].txHash}`);
            console.log(`   https://explorer.solana.com/tx/${relay.txs[0].txHash}?cluster=devnet`);
        } else if (relay?.status === 'error' || relay?.status === 'aborted') {
            console.log(`\nRelay failed: ${relay.failureCause || relay.error || relay.status}`);
        } else if (relay?.status === 'underpaid') {
            console.log('\nRelay underpaid. Try increasing GAS_LIMIT or SOLANA_MSG_VALUE_LAMPORTS.');
        } else {
            console.log(`\nRelay status: ${relay?.status || 'unknown'}`);
        }
    } else {
        console.log('\nExecutor delivery not confirmed within timeout.');
    }

    console.log('\n' + '-'.repeat(60));
    console.log('Links:');
    console.log(`  Sepolia TX:   https://sepolia.etherscan.io/tx/${receipt.hash}`);
    console.log(`  Wormholescan: https://wormholescan.io/#/tx/${receipt.hash}?network=Testnet`);
    console.log(`  Executor:     https://wormholelabs-xyz.github.io/executor-explorer/#/tx/${receipt.hash}?endpoint=https%3A%2F%2Fexecutor-testnet.labsapis.com&env=Testnet`);
}

main().catch((error) => {
    console.error('\nError:', error.message || error);
    process.exit(1);
});
