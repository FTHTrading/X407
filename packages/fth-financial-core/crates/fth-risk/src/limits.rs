//! Risk limits configuration.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Configurable risk limits applied to financial operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskLimits {
    /// Maximum single transaction amount.
    pub max_single_amount: Decimal,
    /// Maximum total amount per account per rolling window.
    pub max_window_amount: Decimal,
    /// Maximum number of transactions per account per rolling window.
    pub max_window_count: u32,
    /// Rolling window duration.
    #[serde(with = "humantime_serde")]
    pub window_duration: Duration,
    /// Maximum outstanding exposure per account (sum of pending invoices).
    pub max_exposure: Decimal,
    /// Whether to enforce limits (false = audit-only mode).
    pub enforce: bool,
}

impl Default for RiskLimits {
    fn default() -> Self {
        Self {
            max_single_amount: Decimal::new(10_000, 0),
            max_window_amount: Decimal::new(100_000, 0),
            max_window_count: 1000,
            window_duration: Duration::from_secs(3600), // 1 hour
            max_exposure: Decimal::new(50_000, 0),
            enforce: true,
        }
    }
}

/// humantime_serde provides human-readable duration serialization.
mod humantime_serde {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};
    use std::time::Duration;

    pub fn serialize<S>(d: &Duration, s: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        d.as_secs().serialize(s)
    }

    pub fn deserialize<'de, D>(d: D) -> Result<Duration, D::Error>
    where
        D: Deserializer<'de>,
    {
        let secs = u64::deserialize(d)?;
        Ok(Duration::from_secs(secs))
    }
}
