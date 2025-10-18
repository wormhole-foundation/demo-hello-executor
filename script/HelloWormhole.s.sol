// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Script} from "forge-std/Script.sol";
import {HelloWormhole} from "src/HelloWormhole.sol";

contract HelloWormholeScript is Script {
    HelloWormhole public helloWormhole;

    function setUp() public {}

    function run() public {
        vm.startBroadcast();

        // TODO: Replace these addresses with actual Wormhole CoreBridge and Executor addresses
        // for your target network. See Wormhole docs for deployed addresses.
        address coreBridge = vm.envOr("CORE_BRIDGE_ADDRESS", address(0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B)); // Example: Ethereum testnet
        address executor = vm.envOr("EXECUTOR_ADDRESS", address(0x0)); // Replace with actual executor address

        helloWormhole = new HelloWormhole(coreBridge, executor);

        vm.stopBroadcast();
    }
}
