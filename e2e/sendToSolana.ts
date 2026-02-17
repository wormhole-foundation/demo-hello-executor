#!/usr/bin/env tsx
/**
 * Send greeting from Sepolia to Solana via Executor
 */

import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRelayInstructions } from './relay.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

// Configuration
const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const HELLO_WORMHOLE = process.env.HELLO_WORMHOLE_SEPOLIA_CROSSVM || '0xC83dcae38111019e8efbA0B78CE6BA055e7A3f2c';
const PRIVATE_KEY = process.env.PRIVATE_KEY_SEPOLIA!;

// Chain IDs
const CHAIN_ID_SOLANA = 1;
const CHAIN_ID_SEPOLIA = 10002;

// Executor API
const EXECUTOR_API = 'https://executor-testnet.labsapis.com/v0';

// Solana-specific: msgValue in LAMPORTS for rent, priority fees, etc.
// Based on NTT demo: 10_000_000 + 1_500_000 = 11,500,000 lamports (~0.0115 SOL)
const SOLANA_MSG_VALUE_LAMPORTS = 15_000_000n; // 0.015 SOL - a bit more for safety

// HelloWormhole ABI (just the functions we need)
const ABI = [
    'function sendGreeting(string greeting, uint16 targetChain, uint128 gasLimit, uint256 totalCost, bytes signedQuote) external payable returns (uint64)',
    'event GreetingSent(string greeting, uint16 targetChain, uint64 sequence)',
];

/**
 * Parse signed quote bytes to extract cost parameters
 * EQ01 layout: prefix(4) + quoter(20) + payee(32) + srcChain(2) + dstChain(2) + 
 *              expiry(8) + baseFee(8) + dstGasPrice(8) + srcPrice(8) + dstPrice(8) + sig(65)
 */
function parseSignedQuote(signedQuoteHex: string): {
    baseFee: bigint;
    dstGasPrice: bigint;
    srcPrice: bigint;
    dstPrice: bigint;
} {
    const hex = signedQuoteHex.startsWith('0x') ? signedQuoteHex.slice(2) : signedQuoteHex;
    const bytes = Buffer.from(hex, 'hex');
    
    return {
        baseFee: bytes.readBigUInt64BE(68),
        dstGasPrice: bytes.readBigUInt64BE(76),
        srcPrice: bytes.readBigUInt64BE(84),
        dstPrice: bytes.readBigUInt64BE(92),
    };
}

function calculateEstimatedCost(
    quote: { baseFee: bigint; dstGasPrice: bigint; srcPrice: bigint; dstPrice: bigint },
    gasLimit: bigint
): bigint {
    if (quote.dstPrice === 0n) return quote.baseFee;
    const relayCost = (gasLimit * quote.dstGasPrice * quote.srcPrice) / quote.dstPrice;
    return quote.baseFee + relayCost;
}

async function getExecutorQuote(srcChain: number, dstChain: number, gasLimit: number = 500000, msgValueLamports: bigint = 0n) {
    // Create relay instructions with gasLimit and msgValue
    // For Solana destinations, msgValue should be in LAMPORTS
    const relayInstructions = createRelayInstructions(BigInt(gasLimit), msgValueLamports);
    
    console.log(`\n📋 Relay Instructions:`);
    console.log(`   gasLimit: ${gasLimit} (compute units)`);
    console.log(`   msgValue: ${msgValueLamports} lamports (${Number(msgValueLamports) / 1e9} SOL)`);
    console.log(`   encoded:  ${relayInstructions}`);
    
    const response = await fetch(`${EXECUTOR_API}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            srcChain, 
            dstChain, 
            gasLimit,
            relayInstructions,  // Include relay instructions for proper quote
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to get quote: ${await response.text()}`);
    }

    const data = await response.json();
    
    // Parse quote and calculate estimated cost
    const parsed = parseSignedQuote(data.signedQuote);
    const estimatedCost = calculateEstimatedCost(parsed, BigInt(gasLimit));
    
    return {
        ...data,
        estimatedCost: estimatedCost.toString(),
        parsedQuote: parsed,
    };
}

async function checkStatus(txHash: string): Promise<any> {
    const response = await fetch(`${EXECUTOR_API}/status/tx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chainId: CHAIN_ID_SEPOLIA, txHash }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data[0] || null;
}

async function main() {
    const greeting = process.argv[2] || 'Hello Solana from Sepolia! 🌉';
    
    console.log('🚀 Sending Greeting: Sepolia → Solana\n');
    console.log(`Message: "${greeting}"`);

    // Setup provider and wallet
    const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    console.log(`\nWallet: ${wallet.address}`);

    const balance = await provider.getBalance(wallet.address);
    console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

    // Get quote with Solana-specific msgValue in lamports
    console.log('\n📊 Getting Executor quote...');
    const gasLimit = 500000; // For Solana, this is compute units
    // Pass msgValue in LAMPORTS - this tells the Executor how much SOL to use for rent/fees
    const quote = await getExecutorQuote(CHAIN_ID_SEPOLIA, CHAIN_ID_SOLANA, gasLimit, SOLANA_MSG_VALUE_LAMPORTS);
    console.log(`   Signed Quote: ${quote.signedQuote.slice(0, 60)}...`);

    // Estimated cost is now calculated from the parsed quote
    // Note: The Executor seems to expect ~50x more than our formula calculates
    // Adding a safety multiplier until we figure out the exact formula
    const calculatedCost = BigInt(quote.estimatedCost);
    const safetyMultiplier = 50n;  // Executor expects ~46x more
    const estimatedCost = calculatedCost * safetyMultiplier;
    
    console.log(`   Parsed Quote Params:`);
    console.log(`     baseFee: ${quote.parsedQuote.baseFee}`);
    console.log(`     dstGasPrice: ${quote.parsedQuote.dstGasPrice}`);
    console.log(`     srcPrice: ${quote.parsedQuote.srcPrice}`);
    console.log(`     dstPrice: ${quote.parsedQuote.dstPrice}`);
    console.log(`   Calculated Cost: ${ethers.formatEther(calculatedCost)} ETH`);
    console.log(`   With ${safetyMultiplier}x safety: ${ethers.formatEther(estimatedCost)} ETH (${estimatedCost} wei)`);

    // Create contract instance
    const contract = new ethers.Contract(HELLO_WORMHOLE, ABI, wallet);

    // Send greeting
    console.log('\n📤 Sending transaction...');
    const tx = await contract.sendGreeting(
        greeting,
        CHAIN_ID_SOLANA,
        gasLimit,
        estimatedCost,
        quote.signedQuote,
        { value: estimatedCost }
    );

    console.log(`TX Hash: ${tx.hash}`);
    console.log(`Explorer: https://sepolia.etherscan.io/tx/${tx.hash}`);

    // Wait for confirmation
    console.log('\n⏳ Waiting for confirmation...');
    const receipt = await tx.wait();
    console.log(`✅ Confirmed in block ${receipt.blockNumber}`);

    // Parse GreetingSent event
    const iface = new ethers.Interface(ABI);
    for (const log of receipt.logs) {
        try {
            const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
            if (parsed?.name === 'GreetingSent') {
                console.log(`\n📨 GreetingSent event:`);
                console.log(`   Message: ${parsed.args[0]}`);
                console.log(`   Target Chain: ${parsed.args[1]}`);
                console.log(`   Sequence: ${parsed.args[2]}`);
            }
        } catch {}
    }

    // Poll for executor status
    console.log('\n⏳ Waiting for Executor relay...');
    for (let i = 0; i < 24; i++) { // 2 minutes max
        await new Promise(r => setTimeout(r, 5000));
        process.stdout.write('.');

        const status = await checkStatus(tx.hash);
        if (status) {
            if (status.status === 'completed') {
                console.log('\n\n🎉 SUCCESS! Message relayed to Solana!');
                console.log(`Solana TX: ${status.txs?.[0]?.txHash || 'pending'}`);
                break;
            } else if (status.status === 'aborted') {
                console.log(`\n\n❌ Relay aborted: ${status.failureCause}`);
                break;
            } else {
                process.stdout.write(`(${status.status})`);
            }
        }
    }

    console.log('\n\n' + '='.repeat(60));
    console.log('Links:');
    console.log(`  Sepolia: https://sepolia.etherscan.io/tx/${tx.hash}`);
    console.log(`  Wormholescan: https://wormholescan.io/#/tx/${tx.hash}?network=Testnet`);
}

main().catch(console.error);
