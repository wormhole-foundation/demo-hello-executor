/**
 * Cross-chain messaging functions for HelloWormhole
 */

import { ethers } from 'ethers';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { ChainConfig, SendGreetingResult } from './types.js';
import {
    getProviderAndWallet,
    getHelloWormholeContract,
    waitForTx,
    pollForEvent,
    getCoreBridgeAddress,
} from './utils.js';
import { getExecutorQuote, calculateTotalCost } from './executor.js';
import {
    createRelayInstructions,
    DEFAULT_GAS_LIMIT,
    DEFAULT_MSG_VALUE,
} from './relay.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load ABI
let helloWormholeAbi: any;
async function loadAbi() {
    if (!helloWormholeAbi) {
        const abiData = await readFile(
            join(__dirname, 'abi', 'HelloWormhole.json'),
            'utf-8'
        );
        helloWormholeAbi = JSON.parse(abiData).abi;
    }
    return helloWormholeAbi;
}

/**
 * Send a cross-chain greeting message using the Wormhole Executor
 */
export async function sendGreeting(
    fromConfig: ChainConfig,
    toConfig: ChainConfig,
    greeting: string
): Promise<SendGreetingResult> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Sending greeting: ${fromConfig.chain} -> ${toConfig.chain}`);
    console.log(`${'='.repeat(60)}`);

    const abi = await loadAbi();
    const { provider, wallet } = await getProviderAndWallet(fromConfig);
    const contract = getHelloWormholeContract(
        fromConfig.helloWormholeAddress,
        wallet,
        abi
    );

    console.log(`\nSender: ${wallet.address}`);
    console.log(`Source contract: ${fromConfig.helloWormholeAddress}`);
    console.log(`Target contract: ${toConfig.helloWormholeAddress}`);
    console.log(`Message: "${greeting}"`);

    // Step 1: Set gas limit for execution on target chain
    // Based on successful test runs, 171948 gas is sufficient for:
    // - VAA verification and replay protection
    // - String decoding and event emission
    const gasLimit = DEFAULT_GAS_LIMIT;

    // Step 2: Create relay instructions
    console.log('\n📋 Creating relay instructions...');
    const msgValue = DEFAULT_MSG_VALUE;
    const relayInstructions = createRelayInstructions(gasLimit, msgValue);

    console.log(`  Gas limit: ${gasLimit}`);
    console.log(`  Msg value: ${msgValue}`);
    console.log(`  Relay instructions: ${relayInstructions}`);

    // Step 3: Get Executor quote with the relay instructions
    console.log('\n📊 Getting Executor quote from API...');

    const quote = await getExecutorQuote({
        srcChain: fromConfig.wormholeChainId,
        dstChain: toConfig.wormholeChainId,
        relayInstructions: relayInstructions,
    });

    console.log(`\n💰 Quote details:`);
    console.log(`  Signed quote: ${quote.signedQuote.substring(0, 20)}...`);
    if (quote.estimatedCost) {
        console.log(
            `  Estimated cost: ${ethers.formatEther(quote.estimatedCost)} ETH`
        );
    }

    // Step 4: Calculate total cost (Wormhole fee + Executor fee)
    const coreBridgeAddress = await getCoreBridgeAddress(fromConfig);
    const coreBridge = new ethers.Contract(
        coreBridgeAddress,
        ['function messageFee() view returns (uint256)'],
        provider
    );

    const messageFee = await coreBridge.messageFee();
    const totalCost = calculateTotalCost(messageFee, quote.estimatedCost);

    console.log(`\n💵 Cost breakdown:`);
    console.log(
        `  Wormhole message fee: ${ethers.formatEther(messageFee)} ETH`
    );
    if (quote.estimatedCost) {
        console.log(
            `  Executor estimated cost: ${ethers.formatEther(
                quote.estimatedCost
            )} ETH`
        );
    }
    console.log(`  Total cost: ${ethers.formatEther(totalCost)} ETH`);

    // Check balance
    const balance = await provider.getBalance(wallet.address);
    console.log(`Wallet balance: ${ethers.formatEther(balance)} ETH`);

    if (balance < totalCost) {
        throw new Error('Insufficient balance for transaction');
    }

    // Step 5: Send greeting with the Executor
    console.log('\n📤 Sending greeting with Executor relay...');

    const tx = await contract.sendGreeting(
        greeting,
        toConfig.wormholeChainId,
        gasLimit,
        totalCost,
        quote.signedQuote,
        { value: totalCost }
    );

    const receipt = await waitForTx(tx, 'Sending greeting transaction');

    // Parse GreetingSent event
    const sentEvent = receipt?.logs
        .map((log) => {
            try {
                return contract.interface.parseLog({
                    topics: log.topics as string[],
                    data: log.data,
                });
            } catch {
                return null;
            }
        })
        .find((event) => event?.name === 'GreetingSent');

    if (sentEvent) {
        console.log('\n📨 GreetingSent Event:');
        console.log(`  Greeting: "${sentEvent.args.greeting}"`);
        console.log(`  Target Chain: ${sentEvent.args.targetChain}`);
        console.log(`  Sequence: ${sentEvent.args.sequence}`);
    }

    return { receipt, sequence: sentEvent?.args.sequence };
}

/**
 * Wait for a greeting to be received on the target chain
 */
export async function waitForReceipt(
    chainConfig: ChainConfig
): Promise<boolean> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Waiting for greeting on ${chainConfig.chain}`);
    console.log(`${'='.repeat(60)}`);

    const abi = await loadAbi();
    const { wallet } = await getProviderAndWallet(chainConfig);
    const contract = getHelloWormholeContract(
        chainConfig.helloWormholeAddress,
        wallet,
        abi
    );

    // Create filter for GreetingReceived event
    const filter = contract.filters.GreetingReceived();

    // Poll for event
    const event = await pollForEvent(
        contract,
        'GreetingReceived',
        filter,
        120000 // 2 minute timeout
    );

    if (event) {
        const parsedEvent = contract.interface.parseLog({
            topics: event.topics as string[],
            data: event.data,
        });

        console.log('\n✅ GreetingReceived Event:');
        console.log(`  Greeting: "${parsedEvent?.args.greeting}"`);
        console.log(`  Sender Chain: ${parsedEvent?.args.senderChain}`);
        console.log(`  Sender: ${parsedEvent?.args.sender}`);
        console.log(`  Block: ${event.blockNumber}`);
        console.log(`  Transaction: ${event.transactionHash}`);

        return true;
    }

    return false;
}
