//! Core risk engine — evaluates operations against risk policies.

use crate::limits::RiskLimits;
use crate::velocity::VelocityTracker;
use fth_types::{AccountId, Asset};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// Risk decision.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskDecision {
    /// Whether the operation is allowed.
    pub allowed: bool,
    /// Risk score (0.0 = safe, 1.0 = max risk).
    pub score: f64,
    /// Rule that triggered denial, if any.
    pub denied_by: Option<String>,
    /// Advisory flags (e.g., "high_amount", "velocity_warning").
    pub flags: Vec<String>,
}

impl RiskDecision {
    fn allow() -> Self {
        Self {
            allowed: true,
            score: 0.0,
            denied_by: None,
            flags: Vec::new(),
        }
    }

    fn deny(rule: impl Into<String>, score: f64) -> Self {
        Self {
            allowed: false,
            score,
            denied_by: Some(rule.into()),
            flags: Vec::new(),
        }
    }

    fn with_flag(mut self, flag: impl Into<String>) -> Self {
        self.flags.push(flag.into());
        self
    }

    fn with_score(mut self, score: f64) -> Self {
        self.score = score;
        self
    }
}

/// The risk engine.
pub struct RiskEngine {
    limits: RiskLimits,
    velocity: VelocityTracker,
}

impl RiskEngine {
    pub fn new(limits: RiskLimits) -> Self {
        let velocity = VelocityTracker::new(limits.window_duration);
        Self { limits, velocity }
    }

    /// Access the velocity tracker.
    pub fn velocity(&self) -> &VelocityTracker {
        &self.velocity
    }

    /// Evaluate a proposed financial operation.
    ///
    /// This is called BEFORE the operation is executed. If the decision
    /// is `allowed = false` and `enforce = true`, the operation should be
    /// rejected.
    pub fn evaluate(
        &self,
        account_id: AccountId,
        amount: Decimal,
        _asset: Asset,
    ) -> RiskDecision {
        let mut decision = RiskDecision::allow();
        let mut score = 0.0_f64;

        // Rule 1: Single-transaction amount limit
        if amount > self.limits.max_single_amount {
            if self.limits.enforce {
                return RiskDecision::deny(
                    "max_single_amount",
                    1.0,
                );
            }
            decision = decision.with_flag("max_single_amount_exceeded");
            score += 0.5;
        }

        // Rule 2: Window velocity (count + amount)
        let (count, total) = self.velocity.peek(account_id);

        if count >= self.limits.max_window_count {
            if self.limits.enforce {
                return RiskDecision::deny("max_window_count", 0.9);
            }
            decision = decision.with_flag("velocity_count_exceeded");
            score += 0.3;
        }

        if total + amount > self.limits.max_window_amount {
            if self.limits.enforce {
                return RiskDecision::deny("max_window_amount", 0.95);
            }
            decision = decision.with_flag("velocity_amount_exceeded");
            score += 0.4;
        }

        // Rule 3: Proximity to limits (advisory flags)
        let count_ratio = count as f64 / self.limits.max_window_count as f64;
        if count_ratio > 0.8 {
            decision = decision.with_flag("velocity_warning");
            score += 0.1;
        }

        let amount_ratio = if self.limits.max_single_amount > Decimal::ZERO {
            amount.to_string().parse::<f64>().unwrap_or(0.0)
                / self.limits.max_single_amount.to_string().parse::<f64>().unwrap_or(1.0)
        } else {
            0.0
        };
        if amount_ratio > 0.8 {
            decision = decision.with_flag("high_amount");
            score += 0.1;
        }

        decision.with_score(score.min(1.0))
    }

    /// Record a completed transaction (updates velocity window).
    pub fn record_transaction(&self, account_id: AccountId, amount: Decimal) {
        self.velocity.record(account_id, amount);
    }

    /// Run periodic maintenance (evict stale velocity windows).
    pub fn maintenance(&self) -> usize {
        self.velocity.evict_stale()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_normal_transaction() {
        let engine = RiskEngine::new(RiskLimits::default());
        let account = AccountId::new();
        let decision = engine.evaluate(account, Decimal::new(100, 0), Asset::Uny);
        assert!(decision.allowed);
    }

    #[test]
    fn denies_oversized_transaction() {
        let engine = RiskEngine::new(RiskLimits::default());
        let account = AccountId::new();
        // Default max_single_amount = 10,000
        let decision = engine.evaluate(account, Decimal::new(20_000, 0), Asset::Uny);
        assert!(!decision.allowed);
        assert_eq!(decision.denied_by.as_deref(), Some("max_single_amount"));
    }

    use fth_types::Asset;
}
