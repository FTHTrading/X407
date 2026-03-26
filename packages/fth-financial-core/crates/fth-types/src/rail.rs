//! Payment rail definitions.

use serde::{Deserialize, Serialize};

/// The payment rail used for settlement.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Rail {
    /// UnyKorn L1 chain (chain_id=1337)
    #[serde(alias = "l1", alias = "unykorn-l1")]
    UnykornL1,
    /// Stellar network
    Stellar,
    /// Avalanche C-Chain
    Avalanche,
    /// Internal credit system (off-chain)
    Credit,
}

impl Rail {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::UnykornL1 => "unykorn-l1",
            Self::Stellar => "stellar",
            Self::Avalanche => "avalanche",
            Self::Credit => "credit",
        }
    }
}

impl std::fmt::Display for Rail {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

impl Default for Rail {
    fn default() -> Self {
        Self::UnykornL1
    }
}
