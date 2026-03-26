//! Service configuration.

use serde::Deserialize;

/// Application configuration loaded from environment variables.
#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    /// Bind address (e.g. "0.0.0.0:4000").
    #[serde(default = "default_bind")]
    pub bind: String,

    /// PostgreSQL connection string.
    pub database_url: String,

    /// Ed25519 signing key (base64-encoded 32-byte seed).
    pub signing_key: String,

    /// L1 RPC endpoint.
    #[serde(default = "default_l1_rpc")]
    pub l1_rpc_url: String,

    /// Log level.
    #[serde(default = "default_log_level")]
    pub log_level: String,

    /// Whether risk engine is in enforce mode.
    #[serde(default = "default_true")]
    pub risk_enforce: bool,
}

fn default_bind() -> String {
    "0.0.0.0:4400".into()
}

fn default_l1_rpc() -> String {
    "http://localhost:8545".into()
}

fn default_log_level() -> String {
    "info".into()
}

fn default_true() -> bool {
    true
}

impl Config {
    /// Load from environment variables with `FTH_` prefix.
    pub fn from_env() -> Result<Self, envy::Error> {
        envy::prefixed("FTH_").from_env()
    }
}
