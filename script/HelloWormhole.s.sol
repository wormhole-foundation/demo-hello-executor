// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Script, console} from "forge-std/Script.sol";
import {HelloWormhole} from "src/HelloWormhole.sol";

contract HelloWormholeScript is Script {
    HelloWormhole public helloWormhole;

    function setUp() public {}

    function run() public {
        uint256 chainId = block.chainid;
        address coreBridge;
        address executor;

        // Sepolia (chainId: 11155111)
        if (chainId == 11155111) {
            coreBridge = 0x4a8bc80Ed5a4067f1CCf107057b8270E0cC11A78;
            executor = 0xD0fb39f5a3361F21457653cB70F9D0C9bD86B66B;
        }
        // Base Sepolia (chainId: 84532)
        else if (chainId == 84532) {
            coreBridge = 0x79A1027a6A159502049F10906D333EC57E95F083;
            executor = 0x51B47D493CBA7aB97e3F8F163D6Ce07592CE4482;
        }
        // Allow env override
        else {
            coreBridge = vm.envAddress("CORE_BRIDGE_ADDRESS");
            executor = vm.envAddress("EXECUTOR_ADDRESS");
        }

        vm.startBroadcast();
        helloWormhole = new HelloWormhole(coreBridge, executor);
        console.log("HelloWormhole deployed at:", address(helloWormhole));

        vm.stopBroadcast();
    }
}
