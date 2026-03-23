// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Test} from "forge-std/Test.sol";
import {HelloWormholeOnChainQuote} from "../src/HelloWormholeOnChainQuote.sol";
import {TestnetChainConstants} from "wormhole-solidity-sdk/testing/ChainConsts.sol";
import {CHAIN_ID_SEPOLIA, CHAIN_ID_BASE_SEPOLIA, CHAIN_ID_SOLANA} from "wormhole-solidity-sdk/constants/Chains.sol";

// Exposes _executeVaa for unit-testing the payload decoding logic.
contract HelloWormholeOnChainQuoteHarness is HelloWormholeOnChainQuote {
    constructor(address coreBridge, address router) HelloWormholeOnChainQuote(coreBridge, router) {}

    function executeVaa(bytes calldata payload, uint16 peerChain, bytes32 peerAddress) external {
        _executeVaa(payload, 0, peerChain, peerAddress, 0, 0);
    }
}

contract HelloWormholeOnChainQuoteTest is Test {
    HelloWormholeOnChainQuote public helloWormholeSepolia;
    HelloWormholeOnChainQuote public helloWormholeBaseSepolia;
    HelloWormholeOnChainQuoteHarness public harness;

    // ExecutorQuoterRouter addresses from testnet deployment
    address constant SEPOLIA_EXECUTOR_QUOTER_ROUTER = 0xc0C35D7bfBc4175e0991Ae294f561b433eA4158f;
    address constant BASE_SEPOLIA_EXECUTOR_QUOTER_ROUTER = 0x2507d6899C3D4b93BF46b555d0cB401f44065772;

    // On-chain quoter public key/address
    address constant QUOTER_ADDRESS = 0x5241C9276698439fEf2780DbaB76fEc90B633Fbd;

    uint256 sepoliaFork;
    uint256 baseSepoliaFork;

    function setUp() public {
        // Create forks for Sepolia and Base Sepolia
        sepoliaFork = vm.createFork("https://ethereum-sepolia.publicnode.com");
        baseSepoliaFork = vm.createFork("https://sepolia.base.org");

        // Deploy on Sepolia fork
        vm.selectFork(sepoliaFork);
        address sepoliaCoreBridge = TestnetChainConstants._coreBridge(CHAIN_ID_SEPOLIA);

        helloWormholeSepolia = new HelloWormholeOnChainQuote(sepoliaCoreBridge, SEPOLIA_EXECUTOR_QUOTER_ROUTER);
        harness = new HelloWormholeOnChainQuoteHarness(sepoliaCoreBridge, SEPOLIA_EXECUTOR_QUOTER_ROUTER);

        // Deploy on Base Sepolia fork
        vm.selectFork(baseSepoliaFork);
        address baseSepoliaCoreBridge = TestnetChainConstants._coreBridge(CHAIN_ID_BASE_SEPOLIA);

        helloWormholeBaseSepolia =
            new HelloWormholeOnChainQuote(baseSepoliaCoreBridge, BASE_SEPOLIA_EXECUTOR_QUOTER_ROUTER);
    }

    function test_DeploymentOnSepolia() public {
        vm.selectFork(sepoliaFork);

        // Verify the contract was deployed correctly
        assertTrue(address(helloWormholeSepolia) != address(0));

        // Verify the deployer has the admin role
        assertTrue(helloWormholeSepolia.hasRole(helloWormholeSepolia.DEFAULT_ADMIN_ROLE(), address(this)));
        assertTrue(helloWormholeSepolia.hasRole(helloWormholeSepolia.PEER_ADMIN_ROLE(), address(this)));
    }

    function test_DeploymentOnBaseSepolia() public {
        vm.selectFork(baseSepoliaFork);

        // Verify the contract was deployed correctly
        assertTrue(address(helloWormholeBaseSepolia) != address(0));

        // Verify the deployer has the admin role
        assertTrue(helloWormholeBaseSepolia.hasRole(helloWormholeBaseSepolia.DEFAULT_ADMIN_ROLE(), address(this)));
        assertTrue(helloWormholeBaseSepolia.hasRole(helloWormholeBaseSepolia.PEER_ADMIN_ROLE(), address(this)));
    }

    function test_SetPeer() public {
        vm.selectFork(sepoliaFork);

        bytes32 peerAddress = bytes32(uint256(uint160(address(helloWormholeBaseSepolia))));

        // Set Base Sepolia as a peer
        helloWormholeSepolia.setPeer(CHAIN_ID_BASE_SEPOLIA, peerAddress);

        // Verify peer was set
        assertEq(helloWormholeSepolia.peers(CHAIN_ID_BASE_SEPOLIA), peerAddress);
    }

    function test_SetPeerRevertsForNonAdmin() public {
        vm.selectFork(sepoliaFork);

        bytes32 peerAddress = bytes32(uint256(uint160(address(helloWormholeBaseSepolia))));
        address nonAdmin = address(0x123);

        // Try to set peer as non-admin
        vm.prank(nonAdmin);
        vm.expectRevert();
        helloWormholeSepolia.setPeer(CHAIN_ID_BASE_SEPOLIA, peerAddress);
    }

    function test_QuoteGreetingRequiresPeer() public {
        vm.selectFork(sepoliaFork);

        // Should revert when no peer is set
        vm.expectRevert("No peer set for target chain");
        helloWormholeSepolia.quoteGreeting(
            CHAIN_ID_BASE_SEPOLIA,
            200000, // gas limit
            QUOTER_ADDRESS
        );
    }

    function test_QuoteGreetingWithPeer() public {
        vm.selectFork(sepoliaFork);

        // Set peer first
        bytes32 peerAddress = bytes32(uint256(uint160(address(helloWormholeBaseSepolia))));
        helloWormholeSepolia.setPeer(CHAIN_ID_BASE_SEPOLIA, peerAddress);

        // Get quote - this will call the actual on-chain quoter
        uint256 quote = helloWormholeSepolia.quoteGreeting(
            CHAIN_ID_BASE_SEPOLIA,
            200000, // gas limit
            QUOTER_ADDRESS
        );

        // Quote should be greater than 0 (includes at least the Wormhole message fee)
        assertGt(quote, 0, "Quote should be non-zero");
    }

    function test_SendGreetingEmitsEvent() public {
        vm.selectFork(sepoliaFork);

        // Set peer first
        bytes32 peerAddress = bytes32(uint256(uint160(address(helloWormholeBaseSepolia))));
        helloWormholeSepolia.setPeer(CHAIN_ID_BASE_SEPOLIA, peerAddress);

        // Get quote
        uint256 totalCost = helloWormholeSepolia.quoteGreeting(CHAIN_ID_BASE_SEPOLIA, 200000, QUOTER_ADDRESS);

        // Fund the test contract
        vm.deal(address(this), totalCost);

        // Expect the GreetingSent event
        vm.expectEmit(false, false, false, true);
        emit HelloWormholeOnChainQuote.GreetingSent("Hello from test!", CHAIN_ID_BASE_SEPOLIA, 0);

        // Send greeting
        helloWormholeSepolia.sendGreeting{value: totalCost}(
            "Hello from test!", CHAIN_ID_BASE_SEPOLIA, 200000, totalCost, QUOTER_ADDRESS
        );
    }

    function test_SendGreetingReturnsSequence() public {
        vm.selectFork(sepoliaFork);

        // Set peer first
        bytes32 peerAddress = bytes32(uint256(uint160(address(helloWormholeBaseSepolia))));
        helloWormholeSepolia.setPeer(CHAIN_ID_BASE_SEPOLIA, peerAddress);

        // Get quote
        uint256 totalCost = helloWormholeSepolia.quoteGreeting(CHAIN_ID_BASE_SEPOLIA, 200000, QUOTER_ADDRESS);

        // Fund the test contract
        vm.deal(address(this), totalCost);

        // Verify the call succeeds without reverting and returns a sequence number
        uint64 sequence = helloWormholeSepolia.sendGreeting{value: totalCost}(
            "Hello!", CHAIN_ID_BASE_SEPOLIA, 200000, totalCost, QUOTER_ADDRESS
        );
        assertTrue(sequence < type(uint64).max);
    }

    // ── Solana peer registration ─────────────────────────────────────────────

    function test_SetSolanaPeer() public {
        vm.selectFork(sepoliaFork);

        // For SVM peers, TWO addresses must be registered:
        //   peers[chainId]       = program ID (executor routing, must be executable)
        //   vaaEmitters[chainId] = emitter PDA (incoming VAA verification)
        bytes32 solanaProgramId = bytes32(0x62cf7e5a219d24a831e51b2c2417fa898920b930fd1c6947f3a4fc8feec1020f);
        bytes32 solanaEmitterPda = bytes32(0x58235d29729e44920df367836a92ab77fcee36b7a27b03304cd699f5eb0efae5);

        helloWormholeSepolia.setPeer(CHAIN_ID_SOLANA, solanaProgramId);
        helloWormholeSepolia.setVaaEmitter(CHAIN_ID_SOLANA, solanaEmitterPda);

        assertEq(helloWormholeSepolia.peers(CHAIN_ID_SOLANA), solanaProgramId);
        assertEq(helloWormholeSepolia.vaaEmitters(CHAIN_ID_SOLANA), solanaEmitterPda);
    }

    // ── Solana payload decoding ──────────────────────────────────────────────

    function test_ExecuteVaaSolanaPayloadStripsHeader() public {
        vm.selectFork(sepoliaFork);

        // Simulate a Solana Hello payload: 0x01 | u16_BE(len) | utf8 message
        string memory message = "Hello from Solana";
        bytes memory msgBytes = bytes(message);
        bytes memory payload = abi.encodePacked(uint8(0x01), uint16(msgBytes.length), msgBytes);

        bytes32 emitterPda = bytes32(0x58235d29729e44920df367836a92ab77fcee36b7a27b03304cd699f5eb0efae5);

        vm.expectEmit(true, true, true, true);
        emit HelloWormholeOnChainQuote.GreetingReceived(message, CHAIN_ID_SOLANA, emitterPda);
        harness.executeVaa(payload, CHAIN_ID_SOLANA, emitterPda);
    }

    function test_ExecuteVaaSolanaPayloadRevertsOnBadHeader() public {
        vm.selectFork(sepoliaFork);

        // Payload missing the 0x01 type tag
        bytes memory payload = abi.encodePacked(uint8(0x00), bytes32(0));
        bytes32 emitterPda = bytes32(0x58235d29729e44920df367836a92ab77fcee36b7a27b03304cd699f5eb0efae5);

        vm.expectRevert(bytes("HelloWormhole: expected Solana Hello payload"));
        harness.executeVaa(payload, CHAIN_ID_SOLANA, emitterPda);
    }

    // ── Solana payload size guard ────────────────────────────────────────────

    function test_SendGreetingRevertsWhenPayloadExceedsSolanaLimit() public {
        vm.selectFork(sepoliaFork);

        bytes32 solanaProgramId = bytes32(0x62cf7e5a219d24a831e51b2c2417fa898920b930fd1c6947f3a4fc8feec1020f);
        helloWormholeSepolia.setPeer(CHAIN_ID_SOLANA, solanaProgramId);

        // 513-byte string — one byte over the 512-byte Solana cap
        string memory tooBig = string(new bytes(513));

        vm.deal(address(this), 1 ether);
        vm.expectRevert(abi.encodeWithSelector(HelloWormholeOnChainQuote.PayloadTooLargeForSolana.selector, 513, 512));
        helloWormholeSepolia.sendGreeting{value: 0.01 ether}(
            tooBig, CHAIN_ID_SOLANA, 500_000, 15_000_000, 0.01 ether, QUOTER_ADDRESS
        );
    }

    // ── quoteGreeting (overloaded with msgValue) ─────────────────────────────

    function test_QuoteGreetingOverloadedIncludesMsgValue() public {
        vm.selectFork(sepoliaFork);

        bytes32 solanaProgramId = bytes32(0x62cf7e5a219d24a831e51b2c2417fa898920b930fd1c6947f3a4fc8feec1020f);
        helloWormholeSepolia.setPeer(CHAIN_ID_SOLANA, solanaProgramId);

        uint256 quoteWithoutMsgValue = helloWormholeSepolia.quoteGreeting(CHAIN_ID_SOLANA, 500_000, 0, QUOTER_ADDRESS);
        uint256 quoteWithMsgValue =
            helloWormholeSepolia.quoteGreeting(CHAIN_ID_SOLANA, 500_000, 15_000_000, QUOTER_ADDRESS);

        // Quote with msgValue should be higher than without
        assertGt(quoteWithMsgValue, quoteWithoutMsgValue, "msgValue should increase the quote");
    }
}
