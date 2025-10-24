import { ethers } from 'ethers';
import type { ChainConfig } from './types.js';
import { Wormhole, toChainId } from '@wormhole-foundation/sdk';
import { EvmPlatform } from '@wormhole-foundation/sdk-evm';

/**
 * Convert EVM address to Wormhole universal address (bytes32)
 */
export function toUniversalAddress(address: string): string {
    return '0x' + address.slice(2).padStart(64, '0');
}

/**
 * Convert Wormhole universal address to EVM address
 */
export function fromUniversalAddress(universalAddress: string): string {
    return '0x' + universalAddress.slice(-40);
}

/**
 * Get Wormhole SDK context with CoreBridge addresses
 */
export async function getWormholeContext(chainConfig: ChainConfig) {
    const wh = new Wormhole(chainConfig.network, [EvmPlatform]);
    const chainContext = wh.getChain(chainConfig.chain);

    return { wh, chainContext };
}

/**
 * Get provider and wallet for a chain
 * Uses SDK's default RPC if not provided in config
 */
export async function getProviderAndWallet(chainConfig: ChainConfig) {
    // Use provided RPC or get from SDK
    let rpcUrl = chainConfig.rpcUrl;

    if (!rpcUrl) {
        const { chainContext } = await getWormholeContext(chainConfig);
        const rpcConfig = chainContext.config.rpc;
        rpcUrl = Array.isArray(rpcConfig) ? rpcConfig[0] : rpcConfig;
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(chainConfig.privateKey, provider);

    return { provider, wallet };
}

/**
 * Get CoreBridge address from SDK
 */
export async function getCoreBridgeAddress(
    chainConfig: ChainConfig
): Promise<string> {
    const { chainContext } = await getWormholeContext(chainConfig);
    const contracts = chainContext.config.contracts;

    if (!contracts?.coreBridge) {
        throw new Error(
            `CoreBridge address not found for ${chainConfig.chain}`
        );
    }

    return contracts.coreBridge;
}

/**
 * Get HelloWormhole contract instance
 */
export function getHelloWormholeContract(
    address: string,
    wallet: ethers.Wallet,
    abi: any[]
) {
    return new ethers.Contract(address, abi, wallet);
}

/**
 * Wait for transaction and log result
 */
export async function waitForTx(
    tx: ethers.ContractTransactionResponse,
    description: string
) {
    console.log(`\n${description}`);
    console.log(`Transaction hash: ${tx.hash}`);
    console.log('Waiting for confirmation...');

    const receipt = await tx.wait();

    if (receipt?.status === 1) {
        console.log('✅ Transaction confirmed!');
        console.log(`Block: ${receipt.blockNumber}`);
        console.log(`Gas used: ${receipt.gasUsed.toString()}`);
    } else {
        console.log('❌ Transaction failed');
    }

    return receipt;
}

/**
 * Format greeting message with timestamp
 */
export function formatGreeting(message: string): string {
    const timestamp = new Date().toISOString();
    return `${message} [${timestamp}]`;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll for event with timeout
 */
export async function pollForEvent(
    contract: ethers.Contract,
    eventName: string,
    filter: any,
    timeoutMs: number = 60000
): Promise<ethers.EventLog | null> {
    const startTime = Date.now();
    const provider = contract.runner?.provider;
    if (!provider) throw new Error('No provider available');

    // Get the current block number and search from 1000 blocks back
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - 1000);

    console.log(`\nPolling for ${eventName} event from block ${fromBlock}...`);

    while (Date.now() - startTime < timeoutMs) {
        const events = await contract.queryFilter(filter, fromBlock);

        if (events.length > 0) {
            console.log(`✅ Found ${eventName} event!`);
            return events[0] as ethers.EventLog;
        }

        await sleep(2000); // Poll every 2 seconds
        process.stdout.write('.');
    }

    console.log(`\n⚠️  Timeout waiting for ${eventName} event`);
    return null;
}

/**
 * Poll for VAA to be signed and available via Wormhole Scan API
 */
export async function pollForVAA(
    emitterChain: number,
    emitterAddress: string,
    sequence: number,
    network: 'Mainnet' | 'Testnet' = 'Testnet',
    timeoutMs: number = 120000
): Promise<{ vaa: string; timestamp: string } | null> {
    const startTime = Date.now();
    const baseUrl =
        network === 'Mainnet'
            ? 'https://api.wormholescan.io'
            : 'https://api.testnet.wormholescan.io';

    // Convert emitter address to padded format (64 characters without 0x)
    const paddedEmitter = emitterAddress
        .toLowerCase()
        .replace('0x', '')
        .padStart(64, '0');
    const url = `${baseUrl}/api/v1/vaas/${emitterChain}/${paddedEmitter}/${sequence}`;

    console.log(`\n🔍 Polling Wormhole Scan for VAA...`);
    console.log(
        `   Chain: ${emitterChain}, Emitter: ${emitterAddress}, Sequence: ${sequence}`
    );
    console.log(`   API: ${url}`);

    while (Date.now() - startTime < timeoutMs) {
        try {
            const response = await fetch(url);

            if (response.ok) {
                const data = (await response.json()) as any;
                if (data.data && data.data.vaa) {
                    console.log(`\n✅ VAA signed and available!`);
                    console.log(`   Timestamp: ${data.data.timestamp}`);
                    console.log(`   VAA: ${data.data.vaa.substring(0, 66)}...`);
                    return {
                        vaa: data.data.vaa,
                        timestamp: data.data.timestamp,
                    };
                }
            } else if (response.status === 404) {
                // VAA not yet available, continue polling
            } else {
                console.log(
                    `\n⚠️  Unexpected response status: ${response.status}`
                );
            }
        } catch (error) {
            console.log(`\n⚠️  Error fetching VAA: ${error}`);
        }

        await sleep(3000); // Poll every 3 seconds
        process.stdout.write('.');
    }

    console.log(`\n⚠️  Timeout waiting for VAA to be signed`);
    return null;
}
