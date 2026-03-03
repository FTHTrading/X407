/**
 * src/abis/vaultRegistry.ts
 * VaultRegistry read ABI for the wallet UI.
 */

export const VAULT_REGISTRY_ABI = [
  {
    name: "entryCount", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint256" }],
  },
  {
    name: "exists", type: "function", stateMutability: "view",
    inputs:  [{ name: "label", type: "string" }],
    outputs: [{ type: "bool" }],
  },
  {
    name: "getEntry", type: "function", stateMutability: "view",
    inputs:  [{ name: "label", type: "string" }],
    outputs: [{
      type: "tuple",
      components: [
        { name: "label",        type: "bytes32"  },
        { name: "entryType",    type: "uint8"    },
        { name: "contractAddr", type: "address"  },
        { name: "chainId",      type: "uint256"  },
        { name: "metadataUri",  type: "string"   },
        { name: "verified",     type: "bool"     },
        { name: "addedAt",      type: "uint256"  },
      ],
    }],
  },
  {
    name: "getEntries", type: "function", stateMutability: "view",
    inputs:  [{ name: "from", type: "uint256" }, { name: "to", type: "uint256" }],
    outputs: [{
      type: "tuple[]",
      components: [
        { name: "label",        type: "bytes32"  },
        { name: "entryType",    type: "uint8"    },
        { name: "contractAddr", type: "address"  },
        { name: "chainId",      type: "uint256"  },
        { name: "metadataUri",  type: "string"   },
        { name: "verified",     type: "bool"     },
        { name: "addedAt",      type: "uint256"  },
      ],
    }],
  },
] as const;

// Entry type labels
export const ENTRY_TYPE_LABEL: Record<number, string> = {
  0: "TOKEN", 1: "VAULT", 2: "POOL", 3: "BRIDGE",
  4: "ORACLE", 5: "DAO", 6: "NFT", 7: "OTHER",
};
