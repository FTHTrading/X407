// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title  UnyKorn Token (UNY)
/// @notice Standard ERC-20 token with a fixed supply minted at deployment.
///         Deployed on Avalanche C-Chain: 0xc09003213b34c7bec8d2eddfad4b43e51d007d66
///
/// Supply:  1,000,000,000 UNY (1 billion, 18 decimals)
/// Owner:   receives entire supply on deploy; can transfer/renounce ownership
/// Burning: any holder may burn their own tokens (reduces total supply)
contract UNYToken is ERC20, ERC20Burnable, Ownable {
    /// @dev 1 billion tokens with 18 decimal places
    uint256 public constant INITIAL_SUPPLY = 1_000_000_000 * 10 ** 18;

    /// @param initialOwner Address that receives the full initial supply and is
    ///        set as contract owner.  Use the deployer / multi-sig address.
    constructor(address initialOwner)
        ERC20("UnyKorn Token", "UNY")
        Ownable(initialOwner)
    {
        _mint(initialOwner, INITIAL_SUPPLY);
    }
}
