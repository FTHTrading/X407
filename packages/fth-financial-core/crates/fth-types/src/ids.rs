//! Strongly-typed identifiers — newtypes prevent mixing wallet addresses
//! with namespaces, invoice IDs with receipt IDs, etc.

use serde::{Deserialize, Serialize};
use std::fmt;

/// Wallet address (hex string, e.g., "0x...").
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct WalletAddress(pub String);

impl WalletAddress {
    pub fn new(addr: impl Into<String>) -> Self {
        Self(addr.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for WalletAddress {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// Namespace for route scoping (e.g., "fth.x402.route.genesis-repro").
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Namespace(pub String);

impl Namespace {
    pub fn new(ns: impl Into<String>) -> Self {
        Self(ns.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for Namespace {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}
