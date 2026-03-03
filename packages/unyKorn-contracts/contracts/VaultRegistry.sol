// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title  VaultRegistry
/// @notice On-chain registry for all UnyKorn-deployed contracts and assets.
///         Owner (operator / multi-sig) registers entries; anyone can read.
///
/// @dev    Entries are keyed by (bytes32 label) for O(1) lookup.
///         An "entry" covers: tokens, vaults, pools, bridges, oracles — anything
///         the operator wants on-chain provenance for.
contract VaultRegistry is Ownable {

    // ── Entry types ──────────────────────────────────────────────────────────
    /// @dev  Adding to this enum is non-breaking (existing entries unaffected).
    enum EntryType {
        TOKEN,      // 0 — ERC-20 token
        VAULT,      // 1 — ERC-6551 / custom vault
        POOL,       // 2 — DEX liquidity pool
        BRIDGE,     // 3 — cross-chain bridge contract
        ORACLE,     // 4 — price / KYC oracle
        DAO,        // 5 — governance contract
        NFT,        // 6 — ERC-721 / ERC-1155
        OTHER       // 7 — catch-all
    }

    // ── Data structures ───────────────────────────────────────────────────────
    struct Entry {
        bytes32   label;        // unique human-readable key (e.g. "uny-token-43114")
        EntryType entryType;
        address   contractAddr;
        uint256   chainId;
        string    metadataUri;  // IPFS CID or https URL for full metadata
        bool      verified;     // upgraded to true after on-chain confirmation
        uint256   addedAt;      // block.timestamp of registration
    }

    // label → Entry
    mapping(bytes32 => Entry)   private _entries;
    // ordered list of labels (for enumeration)
    bytes32[]                   private _labels;

    // ── Events ────────────────────────────────────────────────────────────────
    event EntryAdded(bytes32 indexed label, address indexed contractAddr, EntryType entryType, uint256 chainId);
    event EntryVerified(bytes32 indexed label);
    event MetadataUpdated(bytes32 indexed label, string newUri);
    event EntryRemoved(bytes32 indexed label);

    // ── Errors ────────────────────────────────────────────────────────────────
    error LabelAlreadyExists(bytes32 label);
    error LabelNotFound(bytes32 label);
    error ZeroAddress();
    error EmptyLabel();

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(address initialOwner) Ownable(initialOwner) {}

    // ── Owner: write ──────────────────────────────────────────────────────────

    /// @notice Register a new entry.
    /// @param label        Short unique slug, e.g. "uny-token-43114"
    /// @param entryType    See EntryType enum
    /// @param contractAddr On-chain address of the contract
    /// @param chainId      Chain ID where the contract lives
    /// @param metadataUri  IPFS CID (ipfs://Qm...) or https URL
    function addEntry(
        string calldata label,
        EntryType entryType,
        address contractAddr,
        uint256 chainId,
        string calldata metadataUri
    ) external onlyOwner {
        if (bytes(label).length == 0) revert EmptyLabel();
        if (contractAddr == address(0)) revert ZeroAddress();

        bytes32 key = keccak256(bytes(label));
        if (_entries[key].addedAt != 0) revert LabelAlreadyExists(key);

        _entries[key] = Entry({
            label:        key,
            entryType:    entryType,
            contractAddr: contractAddr,
            chainId:      chainId,
            metadataUri:  metadataUri,
            verified:     false,
            addedAt:      block.timestamp
        });
        _labels.push(key);

        emit EntryAdded(key, contractAddr, entryType, chainId);
    }

    /// @notice Mark an entry as verified (after confirming on-chain deployment).
    function verify(string calldata label) external onlyOwner {
        bytes32 key = keccak256(bytes(label));
        if (_entries[key].addedAt == 0) revert LabelNotFound(key);
        _entries[key].verified = true;
        emit EntryVerified(key);
    }

    /// @notice Update the metadata URI for an entry (e.g. after pinning to IPFS).
    function updateMetadata(string calldata label, string calldata newUri) external onlyOwner {
        bytes32 key = keccak256(bytes(label));
        if (_entries[key].addedAt == 0) revert LabelNotFound(key);
        _entries[key].metadataUri = newUri;
        emit MetadataUpdated(key, newUri);
    }

    /// @notice Remove an entry (soft-delete by clearing storage and splicing label list).
    function removeEntry(string calldata label) external onlyOwner {
        bytes32 key = keccak256(bytes(label));
        if (_entries[key].addedAt == 0) revert LabelNotFound(key);
        delete _entries[key];

        // Remove from _labels array
        uint256 len = _labels.length;
        for (uint256 i = 0; i < len; i++) {
            if (_labels[i] == key) {
                _labels[i] = _labels[len - 1];
                _labels.pop();
                break;
            }
        }
        emit EntryRemoved(key);
    }

    // ── Public: read ──────────────────────────────────────────────────────────

    /// @notice Returns the full Entry struct for a given label string.
    function getEntry(string calldata label) external view returns (Entry memory) {
        bytes32 key = keccak256(bytes(label));
        if (_entries[key].addedAt == 0) revert LabelNotFound(key);
        return _entries[key];
    }

    /// @notice Returns the Entry by raw bytes32 key.
    function getEntryByKey(bytes32 key) external view returns (Entry memory) {
        if (_entries[key].addedAt == 0) revert LabelNotFound(key);
        return _entries[key];
    }

    /// @notice Total number of registered entries.
    function entryCount() external view returns (uint256) {
        return _labels.length;
    }

    /// @notice Paginated read of all entries (0-indexed, inclusive).
    /// @param from  Start index
    /// @param to    End index (exclusive, capped at entryCount)
    function getEntries(uint256 from, uint256 to) external view
        returns (Entry[] memory entries)
    {
        uint256 total = _labels.length;
        if (to > total) to = total;
        if (from >= to) return entries;

        entries = new Entry[](to - from);
        for (uint256 i = from; i < to; i++) {
            entries[i - from] = _entries[_labels[i]];
        }
    }

    /// @notice Look up whether a label is registered.
    function exists(string calldata label) external view returns (bool) {
        return _entries[keccak256(bytes(label))].addedAt != 0;
    }
}
