// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Script, console} from "forge-std/Script.sol";
import {HelloWormhole} from "src/HelloWormhole.sol";

contract SetupPeersScript is Script {
    function setUp() public {}

    function run() public {
        uint256 chainId = block.chainid;
        address localContract;
        address remoteContract;
        uint16 remoteChainId;

        // Sepolia (chainId: 11155111) -> setup Base Sepolia as peer
        if (chainId == 11155111) {
            localContract = vm.envAddress("HELLO_WORMHOLE_SEPOLIA");
            remoteContract = vm.envAddress("HELLO_WORMHOLE_BASE_SEPOLIA");
            remoteChainId = 10004; // Base Sepolia Wormhole chain ID
        }
        // Base Sepolia (chainId: 84532) -> setup Sepolia as peer
        else if (chainId == 84532) {
            localContract = vm.envAddress("HELLO_WORMHOLE_BASE_SEPOLIA");
            remoteContract = vm.envAddress("HELLO_WORMHOLE_SEPOLIA");
            remoteChainId = 10002; // Sepolia Wormhole chain ID
        } else {
            revert("Unsupported chain");
        }

        console.log("Setting up peer on chain ID:", chainId);
        console.log("Local contract:", localContract);
        console.log("Remote contract:", remoteContract);
        console.log("Remote Wormhole chain ID:", remoteChainId);

        // Convert address to bytes32 (left-padded with zeros)
        bytes32 peerAddress = bytes32(uint256(uint160(remoteContract)));

        vm.startBroadcast();

        HelloWormhole hello = HelloWormhole(localContract);
        hello.setPeer(remoteChainId, peerAddress);

        console.log("Peer set successfully!");
        console.log("Peer address (bytes32):", vm.toString(peerAddress));

        vm.stopBroadcast();
    }
}
