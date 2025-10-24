/**
 * Type definitions for Wormhole Executor integration
 */

import type { Network, Chain } from '@wormhole-foundation/sdk-base';
import type { ethers } from 'ethers';

export interface ChainConfig {
    chain: Chain;
    network: Network;
    rpcUrl?: string;
    privateKey: string;
    helloWormholeAddress: string;
    wormholeChainId: number;
}

export interface ExecutorQuoteParams {
    srcChain: number;
    dstChain: number;
    relayInstructions?: string;
}

export interface ExecutorQuote {
    signedQuote: string;
    estimatedCost?: string;
}

export interface ExecutorCapabilities {
    requestPrefixes: string[];
    gasDropOffLimit?: string;
    maxGasLimit?: string;
    maxMsgValue?: string;
}

export interface SendGreetingResult {
    receipt: ethers.TransactionReceipt | null;
    sequence: bigint | undefined;
}

export interface VAAData {
    vaa: string;
    timestamp: string;
}
