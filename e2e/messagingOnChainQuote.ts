/**
 * Cross-chain messaging functions for HelloWormholeOnChainQuote
 */

import { ethers } from 'ethers';
import type { ChainConfig, SendGreetingResult } from './types.js';
import { getProviderAndWallet, waitForTx } from './utils.js';
import {
    getOnChainQuote,
    getHelloWormholeOnChainQuoteContract,
} from './executorOnChainQuote.js';
import { DEFAULT_GAS_LIMIT } from './relay.js';

/**
 * Send a cross-chain greeting message using the Wormhole Executor with on-chain quotes
 */
export async function sendGreetingOnChainQuote(
    fromConfig: ChainConfig,
    toConfig: ChainConfig,
    greeting: string,
    quoterAddress: string,
): Promise<SendGreetingResult> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(
        `Sending greeting (On-Chain Quote): ${fromConfig.chain} -> ${toConfig.chain}`,
    );
    console.log(`${'='.repeat(60)}`);

    const { provider, wallet } = await getProviderAndWallet(fromConfig);
    const contract = getHelloWormholeOnChainQuoteContract(
        fromConfig.helloWormholeAddress,
        wallet,
    );

    console.log(`\nSender: ${wallet.address}`);
    console.log(`Source contract: ${fromConfig.helloWormholeAddress}`);
    console.log(`Target contract: ${toConfig.helloWormholeAddress}`);
    console.log(`Quoter: ${quoterAddress}`);
    console.log(`Message: "${greeting}"`);

    // Step 1: Set gas limit for execution on target chain
    const gasLimit = DEFAULT_GAS_LIMIT;
    console.log(`\n📋 Configuration:`);
    console.log(`  Gas limit: ${gasLimit}`);

    // Step 2: Get on-chain quote
    console.log('\n📊 Getting on-chain quote...');

    const quote = await getOnChainQuote(
        fromConfig.helloWormholeAddress,
        provider,
        {
            targetChain: toConfig.wormholeChainId,
            gasLimit,
            quoterAddress,
        },
    );

    const totalCost = quote.totalCost;

    console.log(`\n💵 Cost:`);
    console.log(`  Total cost: ${ethers.formatEther(totalCost)} ETH`);

    // Check balance
    const balance = await provider.getBalance(wallet.address);
    console.log(`Wallet balance: ${ethers.formatEther(balance)} ETH`);

    if (balance < totalCost) {
        throw new Error('Insufficient balance for transaction');
    }

    // Step 3: Send greeting with the on-chain quote
    console.log('\n📤 Sending greeting with on-chain quote relay...');

    const tx = await contract.sendGreeting(
        greeting,
        toConfig.wormholeChainId,
        gasLimit,
        totalCost,
        quoterAddress,
        { value: totalCost },
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
