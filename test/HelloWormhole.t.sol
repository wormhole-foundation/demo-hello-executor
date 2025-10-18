// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Test} from "forge-std/Test.sol";
import {HelloWormhole} from "../src/HelloWormhole.sol";
import {TestnetChainConstants} from "wormhole-solidity-sdk/testing/ChainConsts.sol";
import {CHAIN_ID_SEPOLIA, CHAIN_ID_BASE_SEPOLIA} from "wormhole-solidity-sdk/constants/Chains.sol";

contract HelloWormholeTest is Test {
    HelloWormhole public helloWormholeSepolia;
    HelloWormhole public helloWormholeBaseSepolia;

    uint256 sepoliaFork;
    uint256 baseSepoliaFork;

    function setUp() public {
        // Create forks for Sepolia and Base Sepolia
        sepoliaFork = vm.createFork("https://ethereum-sepolia.publicnode.com");
        baseSepoliaFork = vm.createFork("https://sepolia.base.org");

        // Deploy on Sepolia fork
        vm.selectFork(sepoliaFork);
        address sepoliaCoreBridge = TestnetChainConstants._coreBridge(CHAIN_ID_SEPOLIA);
        address sepoliaExecutor = address(0x2); // No executor constant available, keeping mock

        helloWormholeSepolia = new HelloWormhole(sepoliaCoreBridge, sepoliaExecutor);

        // Deploy on Base Sepolia fork
        vm.selectFork(baseSepoliaFork);
        address baseSepoliaCoreBridge = TestnetChainConstants._coreBridge(CHAIN_ID_BASE_SEPOLIA);
        address baseSepoliaExecutor = address(0x2); // No executor constant available, keeping mock

        helloWormholeBaseSepolia = new HelloWormhole(baseSepoliaCoreBridge, baseSepoliaExecutor);
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
}
