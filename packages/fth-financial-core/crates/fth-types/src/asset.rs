//! Asset definitions — every currency the system can handle.

use serde::{Deserialize, Serialize};
use std::fmt;
use std::str::FromStr;

/// Supported asset symbols. Exhaustive enum ensures the compiler catches
/// any unhandled currency at compile time.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum Asset {
    /// UnyKorn native stablecoin — primary settlement asset
    #[serde(alias = "uny")]
    Uny,
    /// FTH USD-pegged stablecoin (legacy / secondary)
    #[serde(alias = "usdf")]
    Usdf,
    /// Staked USDF (yield-bearing)
    #[serde(rename = "sUSDF", alias = "susdf")]
    SUsdf,
    /// Extended USDF (collateralized)
    #[serde(rename = "xUSDF", alias = "xusdf")]
    XUsdf,
    /// USDC (Circle)
    #[serde(alias = "usdc")]
    Usdc,
}

impl Asset {
    /// Number of decimal places for this asset.
    #[inline]
    pub const fn decimals(self) -> u8 {
        match self {
            Self::Uny => 18,
            Self::Usdf => 7,
            Self::SUsdf => 7,
            Self::XUsdf => 7,
            Self::Usdc => 6,
        }
    }

    /// Human-readable ticker symbol.
    #[inline]
    pub const fn ticker(self) -> &'static str {
        match self {
            Self::Uny => "UNY",
            Self::Usdf => "USDF",
            Self::SUsdf => "sUSDF",
            Self::XUsdf => "xUSDF",
            Self::Usdc => "USDC",
        }
    }

    /// Classification for risk / reporting.
    #[inline]
    pub const fn class(self) -> AssetClass {
        match self {
            Self::Uny | Self::Usdf | Self::SUsdf | Self::XUsdf | Self::Usdc => AssetClass::Stablecoin,
        }
    }

    /// Is this asset the primary settlement currency?
    #[inline]
    pub const fn is_primary(self) -> bool {
        matches!(self, Self::Uny)
    }
}

impl fmt::Display for Asset {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.ticker())
    }
}

impl Default for Asset {
    fn default() -> Self {
        Self::Uny
    }
}

impl FromStr for Asset {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_uppercase().as_str() {
            "UNY" => Ok(Self::Uny),
            "USDF" => Ok(Self::Usdf),
            "SUSDF" => Ok(Self::SUsdf),
            "XUSDF" => Ok(Self::XUsdf),
            "USDC" => Ok(Self::Usdc),
            _ => Err(format!("unknown asset: {}", s)),
        }
    }
}

/// Asset classification used by risk engine and reporting.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AssetClass {
    Stablecoin,
    Volatile,
    Synthetic,
}
