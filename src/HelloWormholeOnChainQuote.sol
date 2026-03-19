// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {ExecutorSendReceiveQuoteOnChain, InvalidPeer} from "wormhole-solidity-sdk/Executor/Integration.sol";
import {SequenceReplayProtectionLib} from "wormhole-solidity-sdk/libraries/ReplayProtection.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {CONSISTENCY_LEVEL_INSTANT} from "wormhole-solidity-sdk/constants/ConsistencyLevel.sol";
import {CHAIN_ID_SOLANA} from "wormhole-solidity-sdk/constants/Chains.sol";
import {RelayInstructionLib} from "wormhole-solidity-sdk/Executor/RelayInstruction.sol";
import {RequestLib} from "wormhole-solidity-sdk/Executor/Request.sol";
import {toUniversalAddress} from "wormhole-solidity-sdk/Utils.sol";

/**
 * @title HelloWormholeOnChainQuote
 * @notice Cross-chain messaging contract using Wormhole Executor with on-chain quotes
 * @dev Uses ExecutorSendReceiveQuoteOnChain instead of off-chain signed quotes
 *
 * Key differences from HelloWormhole:
 * - Uses `executorQuoterRouter` instead of `executor` address
 * - sendGreeting takes `quoterAddress` instead of `signedQuote`
 * - Provides `quoteGreeting()` for on-chain cost estimation
 *
 * Supports both EVM and Solana destinations:
 * - EVM: use `sendGreeting` / `quoteGreeting` (msgValue = 0)
 * - Solana: use `sendGreetingWithMsgValue` / `quoteGreetingWithMsgValue`
 *   (msgValue in lamports for rent/fees)
 */
contract HelloWormholeOnChainQuote is ExecutorSendReceiveQuoteOnChain, AccessControl {
    using SequenceReplayProtectionLib for *;

    bytes32 public constant PEER_ADMIN_ROLE = keccak256("PEER_ADMIN_ROLE");

    // peers[chainId]: the address the Executor uses to route messages to the peer.
    //   - EVM chains:   the deployed HelloWormholeOnChainQuote contract address (left-padded to bytes32)
    //   - Solana:       the PROGRAM ID (left-aligned, no padding) — must be executable so
    //                   the Executor can call it as the VAA resolver
    mapping(uint16 => bytes32) public peers;

    // vaaEmitters[chainId]: the Wormhole emitter address to verify on *incoming* VAAs.
    //   Only needs to be set when the emitter differs from peers[chainId].
    //   - EVM chains:   leave as bytes32(0) — emitter == peers[chainId] (same contract)
    //   - Solana:       set to the EMITTER PDA (the PDA that signs Wormhole messages),
    //                   because the emitter PDA ≠ program ID
    mapping(uint16 => bytes32) public vaaEmitters;

    // Solana's receive_greeting enforces a 512-byte cap on the message payload.
    // Enforce it here so callers don't pay a relay fee for a delivery that will fail.
    uint256 private constant SOLANA_MAX_PAYLOAD_BYTES = 512;

    error PayloadTooLargeForSolana(uint256 length, uint256 maxLength);

    constructor(address coreBridge, address executorQuoterRouter)
        ExecutorSendReceiveQuoteOnChain(coreBridge, executorQuoterRouter)
    {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PEER_ADMIN_ROLE, msg.sender);
    }

    event GreetingReceived(string greeting, uint16 senderChain, bytes32 sender);
    event GreetingSent(string greeting, uint16 targetChain, uint64 sequence);

    error NoValueAllowed();

    function _getPeer(uint16 chainId) internal view override returns (bytes32) {
        return peers[chainId];
    }

    function _checkPeer(uint16 chainId, bytes32 peerAddress) internal view override {
        bytes32 emitter = vaaEmitters[chainId];
        if (emitter == bytes32(0)) emitter = peers[chainId];
        if (emitter != peerAddress) revert InvalidPeer();
    }

    /// @notice Register the peer address for a destination chain.
    function setPeer(uint16 chainId, bytes32 peerAddress) external onlyRole(PEER_ADMIN_ROLE) {
        peers[chainId] = peerAddress;
    }

    /// @notice Register the VAA emitter address for a source chain (needed for Solana).
    function setVaaEmitter(uint16 chainId, bytes32 emitterAddress) external onlyRole(PEER_ADMIN_ROLE) {
        vaaEmitters[chainId] = emitterAddress;
    }

    function _replayProtect(
        uint16 emitterChainId,
        bytes32 emitterAddress,
        uint64 sequence,
        bytes calldata /* encodedVaa */
    )
        internal
        override
    {
        SequenceReplayProtectionLib.replayProtect(emitterChainId, emitterAddress, sequence);
    }

    function _executeVaa(
        bytes calldata payload,
        uint32,
        /* timestamp */
        uint16 peerChain,
        bytes32 peerAddress,
        uint64,
        /* sequence */
        uint8 /* consistencyLevel */
    )
        internal
        override
    {
        if (msg.value > 0) {
            revert NoValueAllowed();
        }

        // Solana payloads use a tagged format: 0x01 | u16_BE(len) | utf8 message.
        // EVM payloads are raw UTF-8 bytes. Strip the header only for Solana senders.
        string memory greeting;
        if (peerChain == CHAIN_ID_SOLANA) {
            require(payload.length >= 3 && payload[0] == 0x01, "HelloWormhole: expected Solana Hello payload");
            uint16 len = (uint16(uint8(payload[1])) << 8) | uint16(uint8(payload[2]));
            require(payload.length == 3 + uint256(len), "HelloWormhole: payload length mismatch");
            greeting = string(payload[3:]);
        } else {
            greeting = string(payload);
        }

        emit GreetingReceived(greeting, peerChain, peerAddress);
    }

    /**
     * @notice Get a quote for sending a greeting using on-chain quoter
     * @param targetChain The Wormhole chain ID of the destination
     * @param gasLimit Gas limit for execution on target chain
     * @param quoterAddress The on-chain quoter contract address
     * @return totalCost The total cost including Wormhole message fee and executor fee
     */
    function quoteGreeting(uint16 targetChain, uint128 gasLimit, address quoterAddress)
        external
        view
        returns (uint256 totalCost)
    {
        return _quoteGreeting(targetChain, gasLimit, 0, quoterAddress);
    }

    /**
     * @notice Get a quote for sending a greeting with msgValue (needed for Solana destinations)
     * @param msgValue For Solana: lamports for rent/priority fees. For EVM: 0.
     */
    function quoteGreetingWithMsgValue(uint16 targetChain, uint128 gasLimit, uint128 msgValue, address quoterAddress)
        external
        view
        returns (uint256 totalCost)
    {
        return _quoteGreeting(targetChain, gasLimit, msgValue, quoterAddress);
    }

    function _quoteGreeting(uint16 targetChain, uint128 gasLimit, uint128 msgValue, address quoterAddress)
        internal
        view
        returns (uint256 totalCost)
    {
        bytes32 peerAddress = peers[targetChain];
        require(peerAddress != bytes32(0), "No peer set for target chain");

        bytes memory relayInstructions = RelayInstructionLib.encodeGas(gasLimit, msgValue);

        bytes memory requestBytes = RequestLib.encodeVaaMultiSigRequest(
            _chainId,
            toUniversalAddress(address(this)),
            0 // sequence placeholder - not needed for quote
        );

        uint256 executorFee = _executorQuoterRouter.quoteExecution(
            targetChain, peerAddress, address(0), quoterAddress, requestBytes, relayInstructions
        );

        totalCost = executorFee + _coreBridge.messageFee();
    }

    /**
     * @notice Send a cross-chain greeting using on-chain quote
     * @param greeting The message to send
     * @param targetChain The Wormhole chain ID of the destination
     * @param gasLimit Gas limit for execution on target chain
     * @param totalCost Total cost (Wormhole fee + executor fee from quoteGreeting)
     * @param quoterAddress The on-chain quoter contract address
     * @return sequence The Wormhole sequence number
     */
    function sendGreeting(
        string calldata greeting,
        uint16 targetChain,
        uint128 gasLimit,
        uint256 totalCost,
        address quoterAddress
    ) external payable returns (uint64 sequence) {
        sequence = _sendGreeting(greeting, targetChain, gasLimit, 0, totalCost, quoterAddress);
    }

    /**
     * @notice Send a cross-chain greeting with msgValue (needed for Solana destinations)
     * @param msgValue For Solana: lamports for rent/priority fees. For EVM: 0.
     */
    function sendGreetingWithMsgValue(
        string calldata greeting,
        uint16 targetChain,
        uint128 gasLimit,
        uint128 msgValue,
        uint256 totalCost,
        address quoterAddress
    ) external payable returns (uint64 sequence) {
        sequence = _sendGreeting(greeting, targetChain, gasLimit, msgValue, totalCost, quoterAddress);
    }

    function _sendGreeting(
        string calldata greeting,
        uint16 targetChain,
        uint128 gasLimit,
        uint128 msgValue,
        uint256 totalCost,
        address quoterAddress
    ) internal returns (uint64 sequence) {
        bytes memory payload = bytes(greeting);

        if (targetChain == CHAIN_ID_SOLANA && payload.length > SOLANA_MAX_PAYLOAD_BYTES) {
            revert PayloadTooLargeForSolana(payload.length, SOLANA_MAX_PAYLOAD_BYTES);
        }

        sequence = _publishAndRelay(
            payload,
            CONSISTENCY_LEVEL_INSTANT,
            totalCost,
            targetChain,
            msg.sender,
            quoterAddress,
            gasLimit,
            msgValue,
            ""
        );
        emit GreetingSent(greeting, targetChain, sequence);
    }
}
