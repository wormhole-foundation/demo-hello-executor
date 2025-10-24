import type { Network, Chain } from '@wormhole-foundation/sdk-base';
import type {
    ExecutorQuoteParams,
    ExecutorQuote,
    ExecutorCapabilities,
} from './types.js';

/**
 * Executor API client for getting quotes and relay status
 * API Docs: https://github.com/wormholelabs-xyz/example-messaging-executor/blob/main/api-docs/main.tsp
 * Uses SDK's fetchStatus: https://github.com/wormhole-foundation/wormhole-sdk-ts/blob/main/core/definitions/src/protocols/executor/api.ts
 */

/**
 * Get the Executor API URL for the given network from the SDK
 * Source: https://github.com/wormhole-foundation/wormhole-sdk-ts/blob/main/core/base/src/constants/executor.ts
 */
export async function getExecutorApiUrl(network: Network): Promise<string> {
    // Dynamic import to get the executor constants from SDK
    const sdk = (await import('@wormhole-foundation/sdk-base')) as any;
    return sdk.executor.executorAPI(network);
}

/**
 * Get capabilities for all chains from the Executor API
 */
export async function getExecutorCapabilities(
    network: Network = 'Testnet'
): Promise<Record<number, ExecutorCapabilities>> {
    const apiUrl = await getExecutorApiUrl(network);
    const url = `${apiUrl}/capabilities`;

    console.log(`📋 Fetching Executor capabilities from ${url}`);

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch capabilities: ${response.statusText}`);
    }

    return (await response.json()) as Record<number, ExecutorCapabilities>;
}

/**
 * Get a quote from the Executor API using SDK's fetchQuote function
 *
 * The Executor provides automatic cross-chain message delivery.
 * This function requests a signed quote for delivering a message.
 */
export async function getExecutorQuote(
    params: ExecutorQuoteParams,
    network: Network = 'Testnet'
): Promise<ExecutorQuote> {
    const apiUrl = await getExecutorApiUrl(network);

    console.log('📊 Requesting Executor quote using SDK...');
    console.log('  API:', apiUrl);
    console.log('  Source chain:', params.srcChain);
    console.log('  Destination chain:', params.dstChain);
    if (params.relayInstructions) {
        console.log('  Relay instructions:', params.relayInstructions);
    }

    try {
        // Use SDK's fetchQuote function
        const sdkDefs = (await import(
            '@wormhole-foundation/sdk-definitions'
        )) as any;
        const quote = await sdkDefs.fetchQuote(
            apiUrl,
            params.srcChain,
            params.dstChain,
            params.relayInstructions
        );

        // The API returns both signedQuote and estimatedCost
        const estimatedCost = quote.estimatedCost;

        console.log('\n💰 Quote received:');
        console.log(
            '  Signed quote:',
            quote.signedQuote.substring(0, 20) + '...'
        );
        console.log('  Estimated cost:', estimatedCost, 'wei');

        return {
            signedQuote: quote.signedQuote,
            estimatedCost: estimatedCost,
        };
    } catch (error: any) {
        console.error('❌ Error getting Executor quote:', error);
        console.error('   Error details:', error.message, error.cause);
        throw new Error(`Failed to get Executor quote: ${error.message}`);
    }
}

/**
 * Check transaction status via Executor API
 *
 * API Endpoint: POST /v0/status/tx
 */
export async function checkTransactionStatus(
    txHash: string,
    chainId?: number,
    network: Network = 'Testnet'
): Promise<
    Array<{
        txHash: string;
        chainId: number;
        blockNumber: string;
        blockTime: string;
        status: string;
    }>
> {
    const apiUrl = await getExecutorApiUrl(network);
    const url = `${apiUrl}/status/tx`;

    console.log(`🔍 Checking transaction status: ${txHash}`);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            txHash,
            chainId,
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to check status: ${response.statusText}`);
    }

    return (await response.json()) as Array<{
        txHash: string;
        chainId: number;
        blockNumber: string;
        blockTime: string;
        status: string;
    }>;
}

/**
 * Poll for Executor to process the VAA and check its status
 * Uses the SDK's fetchStatus function
 * Returns an array of StatusResponse objects when the transaction is found
 */
export async function pollForExecutorStatus(
    chain: Chain,
    txHash: string,
    network: Network = 'Testnet',
    timeoutMs: number = 60000
): Promise<any> {
    const startTime = Date.now();

    console.log(`\n📡 Polling Executor for transaction status...`);
    console.log(`   Chain: ${chain}`);
    console.log(`   Transaction: ${txHash}`);

    // Dynamic import to get fetchStatus from SDK
    const sdkDefs = (await import(
        '@wormhole-foundation/sdk-definitions'
    )) as any;
    const apiUrl = await getExecutorApiUrl(network);

    while (Date.now() - startTime < timeoutMs) {
        try {
            // Use SDK's fetchStatus function
            const status = await sdkDefs.fetchStatus(apiUrl, txHash, chain);

            // fetchStatus returns an array of StatusResponse objects
            // An empty array means the transaction hasn't been seen yet
            if (Array.isArray(status) && status.length > 0) {
                console.log(`\n✅ Executor has processed the transaction!`);
                return status;
            }
        } catch (error) {
            // Ignore errors and continue polling
        }

        // Wait before polling again
        await new Promise((resolve) => setTimeout(resolve, 3000));
        process.stdout.write('.');
    }

    console.log(`\n⚠️  Timeout waiting for Executor to process transaction`);
    return [
        {
            status: 'timeout',
            message: 'Executor did not process transaction within timeout',
        },
    ];
}

/**
 * Calculate total cost for sending a message
 * Includes both Wormhole message fee and Executor relay fee
 */
export function calculateTotalCost(
    wormholeMessageFee: bigint,
    executorEstimatedCost?: string
): bigint {
    const executorCost = executorEstimatedCost
        ? BigInt(executorEstimatedCost)
        : 0n;
    return wormholeMessageFee + executorCost;
}
