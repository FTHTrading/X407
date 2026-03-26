//! Credit account types.

use crate::{Money, Rail, WalletAddress, Namespace};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Unique account identifier (UUID).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct AccountId(pub Uuid);

impl AccountId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }
}

impl Default for AccountId {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Display for AccountId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Account status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AccountStatus {
    Active,
    Frozen,
    Closed,
}

/// A credit account in the system.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub id: AccountId,
    pub wallet_address: WalletAddress,
    pub balance: Money,
    pub rail: Rail,
    pub namespace: Option<Namespace>,
    pub status: AccountStatus,
    pub kyc_level: String,
    pub frozen: bool,
    pub pubkey: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Account {
    /// Can this account be charged?
    pub fn can_transact(&self) -> bool {
        self.status == AccountStatus::Active && !self.frozen
    }

    /// Does this account have sufficient balance for the given amount?
    pub fn has_sufficient_balance(&self, amount: &Money) -> bool {
        self.balance.amount() >= amount.amount() && self.balance.asset() == amount.asset()
    }
}

/// Transaction type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransactionType {
    Deposit,
    Charge,
    Refund,
    Transfer,
    Fee,
}

/// A ledger transaction entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub id: Uuid,
    pub account_id: AccountId,
    pub tx_type: TransactionType,
    pub amount: Money,
    pub balance_after: Money,
    pub reference: Option<String>,
    pub rail: Option<Rail>,
    pub tx_hash: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
}
