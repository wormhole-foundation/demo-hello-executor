import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
    toChainId,
    type Chain,
    type Network,
} from '@wormhole-foundation/sdk-base';
import type { ChainConfig } from './types.js';

// Get the directory of this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from e2e/.env
dotenvConfig({ path: resolve(__dirname, '.env') });

// Configuration for the on-chain quote version
export const configOnChainQuote = {
    sepolia: {
        chain: 'Sepolia' as Chain,
        network: 'Testnet' as Network,
        rpcUrl: process.env.SEPOLIA_RPC_URL, // Optional - SDK has defaults
        privateKey: process.env.PRIVATE_KEY_SEPOLIA!,
        helloWormholeAddress: process.env.HELLO_WORMHOLE_OC_SEPOLIA!,
        wormholeChainId: toChainId('Sepolia'),
    } as ChainConfig,
    baseSepolia: {
        chain: 'BaseSepolia' as Chain,
        network: 'Testnet' as Network,
        rpcUrl: process.env.BASE_SEPOLIA_RPC_URL, // Optional - SDK has defaults
        privateKey: process.env.PRIVATE_KEY_BASE_SEPOLIA!,
        helloWormholeAddress: process.env.HELLO_WORMHOLE_OC_BASE_SEPOLIA!,
        wormholeChainId: toChainId('BaseSepolia'),
    } as ChainConfig,
    // On-chain quoter configuration
    quoter: {
        // The quoter public key/address operated by Wormhole
        address:
            process.env.QUOTER_ADDRESS ||
            '0x5241c9276698439fef2780dbab76fec90b633fbd',
        // ExecutorQuoterRouter addresses per chain
        executorQuoterRouter: {
            sepolia: '0xc0C35D7bfBc4175e0991Ae294f561b433eA4158f',
            baseSepolia: '0x2507d6899C3D4b93BF46b555d0cB401f44065772',
        },
    },
};

export function validateConfigOnChainQuote() {
    const requiredVars = [
        'PRIVATE_KEY_SEPOLIA',
        'PRIVATE_KEY_BASE_SEPOLIA',
        'HELLO_WORMHOLE_OC_SEPOLIA',
        'HELLO_WORMHOLE_OC_BASE_SEPOLIA',
    ];

    const missing = requiredVars.filter((v) => !process.env[v]);

    if (missing.length > 0) {
        throw new Error(
            `Missing required environment variables: ${missing.join(', ')}\n` +
                'Please copy .env.example to .env and fill in the values.',
        );
    }
}
