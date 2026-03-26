//! Journal entry and leg types.

use chrono::{DateTime, Utc};
use fth_types::{AccountId, Asset, FinError, Money};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Direction of a ledger leg.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LegDirection {
    Debit,
    Credit,
}

/// A single leg (line) of a journal entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Leg {
    pub account_id: AccountId,
    pub direction: LegDirection,
    pub amount: Money,
    pub memo: Option<String>,
}

/// Category for journal entries.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EntryCategory {
    Deposit,
    Charge,
    Refund,
    Transfer,
    Fee,
    Settlement,
    Adjustment,
}

/// A balanced, immutable journal entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JournalEntry {
    pub id: Uuid,
    pub category: EntryCategory,
    pub legs: Vec<Leg>,
    pub reference: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
}

impl JournalEntry {
    /// Validate that all debits equal all credits for each asset.
    pub fn validate(&self) -> Result<(), FinError> {
        if self.legs.is_empty() {
            return Err(FinError::LedgerUnbalanced {
                debit_total: "0".into(),
                credit_total: "0".into(),
            });
        }

        // Group by asset and verify balance
        let mut debit_sums: std::collections::HashMap<Asset, Decimal> =
            std::collections::HashMap::new();
        let mut credit_sums: std::collections::HashMap<Asset, Decimal> =
            std::collections::HashMap::new();

        for leg in &self.legs {
            let map = match leg.direction {
                LegDirection::Debit => &mut debit_sums,
                LegDirection::Credit => &mut credit_sums,
            };
            *map.entry(leg.amount.asset()).or_insert(Decimal::ZERO) += leg.amount.amount();
        }

        // Every asset that appears must have equal debits and credits.
        let all_assets: std::collections::HashSet<Asset> = debit_sums
            .keys()
            .chain(credit_sums.keys())
            .copied()
            .collect();

        for asset in all_assets {
            let d = debit_sums.get(&asset).copied().unwrap_or(Decimal::ZERO);
            let c = credit_sums.get(&asset).copied().unwrap_or(Decimal::ZERO);
            if d != c {
                return Err(FinError::LedgerUnbalanced {
                    debit_total: d.to_string(),
                    credit_total: c.to_string(),
                });
            }
        }

        Ok(())
    }
}

/// Builder for constructing a journal entry.
pub struct JournalEntryBuilder {
    category: EntryCategory,
    legs: Vec<Leg>,
    reference: Option<String>,
    metadata: Option<serde_json::Value>,
}

impl JournalEntryBuilder {
    pub fn new(category: EntryCategory) -> Self {
        Self {
            category,
            legs: Vec::new(),
            reference: None,
            metadata: None,
        }
    }

    pub fn debit(mut self, account_id: AccountId, amount: Money, memo: Option<String>) -> Self {
        self.legs.push(Leg {
            account_id,
            direction: LegDirection::Debit,
            amount,
            memo,
        });
        self
    }

    pub fn credit(mut self, account_id: AccountId, amount: Money, memo: Option<String>) -> Self {
        self.legs.push(Leg {
            account_id,
            direction: LegDirection::Credit,
            amount,
            memo,
        });
        self
    }

    pub fn reference(mut self, r: impl Into<String>) -> Self {
        self.reference = Some(r.into());
        self
    }

    pub fn metadata(mut self, m: serde_json::Value) -> Self {
        self.metadata = Some(m);
        self
    }

    /// Build and validate the entry. Returns error if unbalanced.
    pub fn build(self) -> Result<JournalEntry, FinError> {
        let entry = JournalEntry {
            id: Uuid::new_v4(),
            category: self.category,
            legs: self.legs,
            reference: self.reference,
            metadata: self.metadata,
            created_at: Utc::now(),
        };
        entry.validate()?;
        Ok(entry)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use fth_types::Asset;

    #[test]
    fn balanced_entry_validates() {
        let a = AccountId::new();
        let b = AccountId::new();
        let amount = Money::new(Asset::Uny, "100").unwrap();

        let entry = JournalEntryBuilder::new(EntryCategory::Transfer)
            .debit(a, amount.clone(), None)
            .credit(b, amount, None)
            .build();

        assert!(entry.is_ok());
    }

    #[test]
    fn unbalanced_entry_fails() {
        let a = AccountId::new();
        let b = AccountId::new();
        let d = Money::new(Asset::Uny, "100").unwrap();
        let c = Money::new(Asset::Uny, "50").unwrap();

        let entry = JournalEntryBuilder::new(EntryCategory::Transfer)
            .debit(a, d, None)
            .credit(b, c, None)
            .build();

        assert!(entry.is_err());
    }
}
