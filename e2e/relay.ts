/**
 * Relay instructions utilities for Wormhole Executor
 */

/**
 * Create relay instructions for the Executor quote request
 *
 * Relay instructions tell the Executor:
 * - How much gas to provide when calling _executeVaa on the target chain
 * - How much native token (msg.value) to forward (typically 0 for this use case)
 *
 * Format: 0x01 (version byte) + uint128 gasLimit (16 bytes) + uint128 msgValue (16 bytes)
 *
 * Note: This is different from the ERV1 prefix used in the VAA request payload.
 * The relay instructions here are just metadata for the quote calculation.
 */
export function createRelayInstructions(
    gasLimit: bigint,
    msgValue: bigint
): string {
    // Version byte 0x01 for relay instructions format
    const version = '01';

    // Encode as uint128 (16 bytes each, big-endian)
    const gasLimitHex = gasLimit.toString(16).padStart(32, '0'); // 16 bytes = 32 hex chars
    const msgValueHex = msgValue.toString(16).padStart(32, '0'); // 16 bytes = 32 hex chars

    // Combine: 0x + version (1 byte) + gasLimit (16 bytes) + msgValue (16 bytes)
    return '0x' + version + gasLimitHex + msgValueHex;
}

/**
 * Default gas limit for receiving messages on the target chain
 * Based on successful test runs for simple message delivery:
 * - VAA verification and replay protection
 * - String decoding and event emission
 */
export const DEFAULT_GAS_LIMIT = 171948n;

/**
 * Default msg.value for relay instructions (no native token forwarding)
 */
export const DEFAULT_MSG_VALUE = 0n;
