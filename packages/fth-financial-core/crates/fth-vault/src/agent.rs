//! Agent types and management.

use chrono::{DateTime, Utc};
use fth_types::{AccountId, Asset, WalletAddress};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Agent status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentStatus {
    Active,
    Paused,
    Depleted,
    Revoked,
}

/// A managed treasury agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: Uuid,
    pub name: String,
    pub wallet_address: WalletAddress,
    pub account_id: Option<AccountId>,
    pub asset: Asset,
    pub status: AgentStatus,
    pub balance: Decimal,
    pub target_balance: Decimal,
    pub min_balance: Decimal,
    pub max_single_refill: Decimal,
    pub max_daily_refill: Decimal,
    pub daily_refilled: Decimal,
    pub last_refill_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Agent {
    /// Does this agent need a refill?
    pub fn needs_refill(&self) -> bool {
        self.status == AgentStatus::Active && self.balance < self.min_balance
    }

    /// How much should we refill?
    pub fn refill_amount(&self) -> Decimal {
        let deficit = self.target_balance - self.balance;
        if deficit <= Decimal::ZERO {
            return Decimal::ZERO;
        }
        // Cap by single refill limit
        let capped = deficit.min(self.max_single_refill);
        // Cap by remaining daily allowance
        let daily_remaining = self.max_daily_refill - self.daily_refilled;
        if daily_remaining <= Decimal::ZERO {
            return Decimal::ZERO;
        }
        capped.min(daily_remaining)
    }

    /// Is this agent healthy (active + above minimum)?
    pub fn is_healthy(&self) -> bool {
        self.status == AgentStatus::Active && self.balance >= self.min_balance
    }
}
