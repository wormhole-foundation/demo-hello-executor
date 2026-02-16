#!/usr/bin/env tsx
/**
 * Send greeting from Sepolia to Solana via Executor
 */

import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

// Configuration
const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const HELLO_WORMHOLE = process.env.HELLO_WORMHOLE_SEPOLIA_CROSSVM || '0xC83dcae38111019e8efbA0B78CE6BA055e7A3f2c';
const PRIVATE_KEY = process.env.PRIVATE_KEY_SEPOLIA!;

// Chain IDs
const CHAIN_ID_SOLANA = 1;
const CHAIN_ID_SEPOLIA = 10002;

// Executor API
const EXECUTOR_API = 'https://executor-testnet.labsapis.com/v0';

// HelloWormhole ABI (just the functions we need)
const ABI = [
    'function sendGreeting(string greeting, uint16 targetChain, uint128 gasLimit, uint256 totalCost, bytes signedQuote) external payable returns (uint64)',
    'event GreetingSent(string greeting, uint16 targetChain, uint64 sequence)',
];

async function getExecutorQuote(srcChain: number, dstChain: number, gasLimit: number = 500000) {
    const response = await fetch(`${EXECUTOR_API}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ srcChain, dstChain, gasLimit }),
    });

    if (!response.ok) {
        throw new Error(`Failed to get quote: ${await response.text()}`);
    }

    return response.json();
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

    // Get quote
    console.log('\n📊 Getting Executor quote...');
    const gasLimit = 500000; // For Solana, this is compute units
    const quote = await getExecutorQuote(CHAIN_ID_SEPOLIA, CHAIN_ID_SOLANA, gasLimit);
    console.log(`   Signed Quote: ${quote.signedQuote.slice(0, 60)}...`);

    // Parse estimated cost from quote
    // The cost is typically returned or we calculate from quote params
    const estimatedCost = quote.estimatedCost ? BigInt(quote.estimatedCost) : ethers.parseEther('0.001');
    console.log(`   Estimated Cost: ${ethers.formatEther(estimatedCost)} ETH`);

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
