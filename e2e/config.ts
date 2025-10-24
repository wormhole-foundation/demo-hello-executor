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

// Use SDK's predefined RPC URLs and contract addresses
// CoreBridge addresses and chain IDs are available in the SDK's chain context
export const config = {
    sepolia: {
        chain: 'Sepolia' as Chain,
        network: 'Testnet' as Network,
        rpcUrl: process.env.SEPOLIA_RPC_URL, // Optional - SDK has defaults
        privateKey: process.env.PRIVATE_KEY_SEPOLIA!,
        helloWormholeAddress: process.env.HELLO_WORMHOLE_SEPOLIA!,
        wormholeChainId: toChainId('Sepolia'),
    } as ChainConfig,
    baseSepolia: {
        chain: 'BaseSepolia' as Chain,
        network: 'Testnet' as Network,
        rpcUrl: process.env.BASE_SEPOLIA_RPC_URL, // Optional - SDK has defaults
        privateKey: process.env.PRIVATE_KEY_BASE_SEPOLIA!,
        helloWormholeAddress: process.env.HELLO_WORMHOLE_BASE_SEPOLIA!,
        wormholeChainId: toChainId('BaseSepolia'),
    } as ChainConfig,
};

export function validateConfig() {
    const requiredVars = [
        'PRIVATE_KEY_SEPOLIA',
        'PRIVATE_KEY_BASE_SEPOLIA',
        'HELLO_WORMHOLE_SEPOLIA',
        'HELLO_WORMHOLE_BASE_SEPOLIA',
    ];

    const missing = requiredVars.filter((v) => !process.env[v]);

    if (missing.length > 0) {
        throw new Error(
            `Missing required environment variables: ${missing.join(', ')}\n` +
                'Please copy .env.example to .env and fill in the values.'
        );
    }
}
