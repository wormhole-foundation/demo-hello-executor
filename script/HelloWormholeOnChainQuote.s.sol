// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Script, console} from "forge-std/Script.sol";
import {HelloWormholeOnChainQuote} from "src/HelloWormholeOnChainQuote.sol";

contract HelloWormholeOnChainQuoteScript is Script {
    HelloWormholeOnChainQuote public helloWormhole;

    function setUp() public {}

    function run() public {
        uint256 chainId = block.chainid;
        address coreBridge;
        address executorQuoterRouter;

        // Sepolia (chainId: 11155111)
        if (chainId == 11155111) {
            coreBridge = 0x4a8bc80Ed5a4067f1CCf107057b8270E0cC11A78;
            executorQuoterRouter = 0xc0C35D7bfBc4175e0991Ae294f561b433eA4158f;
        }
        // Base Sepolia (chainId: 84532)
        else if (chainId == 84532) {
            coreBridge = 0x79A1027a6A159502049F10906D333EC57E95F083;
            executorQuoterRouter = 0x2507d6899C3D4b93BF46b555d0cB401f44065772;
        }
        // Allow env override for other chains
        else {
            coreBridge = vm.envAddress("CORE_BRIDGE_ADDRESS");
            executorQuoterRouter = vm.envAddress("EXECUTOR_QUOTER_ROUTER_ADDRESS");
        }

        console.log("Deploying HelloWormholeOnChainQuote...");
        console.log("  Chain ID:", chainId);
        console.log("  Core Bridge:", coreBridge);
        console.log("  Executor Quoter Router:", executorQuoterRouter);

        vm.startBroadcast();
        helloWormhole = new HelloWormholeOnChainQuote(coreBridge, executorQuoterRouter);
        console.log("HelloWormholeOnChainQuote deployed at:", address(helloWormhole));

        vm.stopBroadcast();
    }
}
