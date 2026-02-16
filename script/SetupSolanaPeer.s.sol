// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Script, console} from "forge-std/Script.sol";
import {HelloWormhole} from "src/HelloWormhole.sol";

/**
 * @title SetupSolanaPeer
 * @notice Sets up a Solana program as a peer on the EVM HelloWormhole contract
 * 
 * Usage:
 *   export HELLO_WORMHOLE_SEPOLIA_CROSSVM=0x...
 *   export SOLANA_PROGRAM_ID_BYTES32=0x... (use cast to convert)
 *   forge script script/SetupSolanaPeer.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast
 * 
 * To convert Solana program ID to bytes32:
 *   # Program ID: 5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp
 *   # Use base58 decode then hex encode
 */
contract SetupSolanaPeerScript is Script {
    // Wormhole chain ID for Solana
    uint16 constant CHAIN_ID_SOLANA = 1;
    
    // Default Solana program ID as bytes32
    // 5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp in bytes32:
    bytes32 constant DEFAULT_SOLANA_PROGRAM = 0x47c51f36dcb45b5bbdba739f0fa993b142f908f06095def3775428b46361b9d3;

    function setUp() public {}

    function run() public {
        address localContract = vm.envAddress("HELLO_WORMHOLE_SEPOLIA_CROSSVM");
        
        // Try to get custom program ID, fall back to default
        bytes32 solanaProgramBytes32;
        try vm.envBytes32("SOLANA_PROGRAM_ID_BYTES32") returns (bytes32 val) {
            solanaProgramBytes32 = val;
        } catch {
            solanaProgramBytes32 = DEFAULT_SOLANA_PROGRAM;
        }

        console.log("Setting up Solana peer on Sepolia HelloWormhole");
        console.log("Local contract:", localContract);
        console.log("Solana program (bytes32):", vm.toString(solanaProgramBytes32));
        console.log("Wormhole chain ID:", CHAIN_ID_SOLANA);

        vm.startBroadcast();

        HelloWormhole hello = HelloWormhole(localContract);
        hello.setPeer(CHAIN_ID_SOLANA, solanaProgramBytes32);

        console.log("Solana peer set successfully!");

        vm.stopBroadcast();
    }
}
