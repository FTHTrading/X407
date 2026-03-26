//! Refill policy configuration.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// Declarative refill policy for a treasury agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefillPolicy {
    /// Balance below which a refill is triggered.
    pub min_balance: Decimal,
    /// Target balance after a refill.
    pub target_balance: Decimal,
    /// Maximum single refill amount.
    pub max_single_refill: Decimal,
    /// Maximum total refill per 24-hour rolling window.
    pub max_daily_refill: Decimal,
    /// Whether the agent is enabled for auto-refill.
    pub enabled: bool,
}

impl RefillPolicy {
    /// Validate policy constraints.
    pub fn validate(&self) -> Result<(), String> {
        if self.min_balance < Decimal::ZERO {
            return Err("min_balance must be non-negative".into());
        }
        if self.target_balance < self.min_balance {
            return Err("target_balance must be >= min_balance".into());
        }
        if self.max_single_refill <= Decimal::ZERO {
            return Err("max_single_refill must be positive".into());
        }
        if self.max_daily_refill < self.max_single_refill {
            return Err("max_daily_refill must be >= max_single_refill".into());
        }
        Ok(())
    }
}

impl Default for RefillPolicy {
    fn default() -> Self {
        Self {
            min_balance: Decimal::new(100, 0),
            target_balance: Decimal::new(1000, 0),
            max_single_refill: Decimal::new(500, 0),
            max_daily_refill: Decimal::new(2000, 0),
            enabled: true,
        }
    }
}
