// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {ExecutorSendReceiveQuoteOffChain} from "wormhole-solidity-sdk/Executor/Integration.sol";
import {SequenceReplayProtectionLib} from "wormhole-solidity-sdk/libraries/ReplayProtection.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {CONSISTENCY_LEVEL_INSTANT} from "wormhole-solidity-sdk/constants/ConsistencyLevel.sol";

contract HelloWormhole is ExecutorSendReceiveQuoteOffChain, AccessControl {
    using SequenceReplayProtectionLib for *;

    bytes32 public constant PEER_ADMIN_ROLE = keccak256("PEER_ADMIN_ROLE");

    mapping(uint16 => bytes32) public peers;

    constructor(address coreBridge, address executor) ExecutorSendReceiveQuoteOffChain(coreBridge, executor) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PEER_ADMIN_ROLE, msg.sender);
    }

    event GreetingReceived(string greeting, uint16 senderChain, bytes32 sender);
    event GreetingSent(string greeting, uint16 targetChain, uint64 sequence);

    error NoValueAllowed();

    function _getPeer(uint16 chainId) internal view override returns (bytes32) {
        return peers[chainId];
    }

    function setPeer(uint16 chainId, bytes32 peerAddress) external onlyRole(PEER_ADMIN_ROLE) {
        peers[chainId] = peerAddress;
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
        // Decode the payload to extract the greeting message
        string memory greeting = string(payload);

        // Emit an event with the greeting message and sender details
        emit GreetingReceived(greeting, peerChain, peerAddress);
    }

    /**
     * @notice Send a cross-chain greeting with custom msgValue (for SVM destinations)
     * @dev For EVM→Solana transfers, msgValue should be in LAMPORTS (e.g., 15_000_000 for 0.015 SOL)
     * @param greeting The message to send
     * @param targetChain The Wormhole chain ID of the destination
     * @param gasLimit Gas limit / compute units for execution on target chain
     * @param msgValue Native token amount for destination (lamports for Solana, wei for EVM)
     * @param totalCost Total cost (Wormhole fee + executor fee)
     * @param signedQuote The signed quote from Executor API
     * @return sequence The Wormhole sequence number
     */
    function sendGreetingWithMsgValue(
        string calldata greeting,
        uint16 targetChain,
        uint128 gasLimit,
        uint128 msgValue,
        uint256 totalCost,
        bytes calldata signedQuote
    ) public payable returns (uint64 sequence) {
        // Encode the greeting as bytes
        bytes memory payload = bytes(greeting);

        // Publish and relay the message to the target chain
        sequence = _publishAndRelay(
            payload,
            CONSISTENCY_LEVEL_INSTANT, // choose safe or finalized based on your needs
            totalCost,
            targetChain,
            msg.sender, // refund address
            signedQuote,
            gasLimit,
            msgValue, // pass through for SVM destinations (in lamports)
            "" // no extra relay instructions
        );

        emit GreetingSent(greeting, targetChain, sequence);
    }

    /**
     * @notice Send a cross-chain greeting (EVM to EVM, msgValue=0)
     * @dev For EVM→EVM transfers, msgValue should be 0. Calls sendGreetingWithMsgValue(msgValue=0).
     */
    function sendGreeting(
        string calldata greeting,
        uint16 targetChain,
        uint128 gasLimit,
        uint256 totalCost,
        bytes calldata signedQuote
    ) external payable returns (uint64 sequence) {
        return sendGreetingWithMsgValue(greeting, targetChain, gasLimit, 0, totalCost, signedQuote);
    }
}
