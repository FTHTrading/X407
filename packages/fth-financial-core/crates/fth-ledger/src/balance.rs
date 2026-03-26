//! In-memory balance cache with concurrent read/write via DashMap.

use dashmap::DashMap;
use fth_types::{AccountId, Asset, FinError};
use rust_decimal::Decimal;
use std::sync::Arc;

/// Thread-safe composite key for per-account-per-asset balances.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[allow(dead_code)]
struct BalanceKey {
    account_id: AccountId,
    asset: Asset,
}

/// Concurrent balance cache for hot-path reads.
///
/// All mutations go through the ledger engine which writes to Postgres;
/// this cache is populated from DB on start and kept in sync via the
/// engine's `apply` path.
#[derive(Debug, Clone)]
pub struct BalanceCache {
    inner: Arc<DashMap<(AccountId, Asset), Decimal>>,
}

impl BalanceCache {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(DashMap::new()),
        }
    }

    /// Get the cached balance for an account/asset pair.
    pub fn get(&self, account_id: AccountId, asset: Asset) -> Decimal {
        self.inner
            .get(&(account_id, asset))
            .map(|r| *r.value())
            .unwrap_or(Decimal::ZERO)
    }

    /// Set a balance (used during warmup from DB).
    pub fn set(&self, account_id: AccountId, asset: Asset, balance: Decimal) {
        self.inner.insert((account_id, asset), balance);
    }

    /// Apply a delta (positive for credits, negative for debits).
    pub fn apply_delta(
        &self,
        account_id: AccountId,
        asset: Asset,
        delta: Decimal,
    ) -> Result<Decimal, FinError> {
        let mut entry = self.inner.entry((account_id, asset)).or_insert(Decimal::ZERO);
        let new_balance = *entry + delta;
        if new_balance < Decimal::ZERO {
            return Err(FinError::InsufficientBalance {
                available: entry.to_string(),
                required: delta.abs().to_string(),
                asset,
            });
        }
        *entry = new_balance;
        Ok(new_balance)
    }

    /// Remove an account from the cache.
    pub fn remove(&self, account_id: AccountId, asset: Asset) {
        self.inner.remove(&(account_id, asset));
    }

    /// Total number of cached entries.
    pub fn len(&self) -> usize {
        self.inner.len()
    }

    /// Is the cache empty?
    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }
}

impl Default for BalanceCache {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_apply_delta() {
        let cache = BalanceCache::new();
        let id = AccountId::new();
        let asset = Asset::Uny;

        // Credit 100
        let bal = cache.apply_delta(id, asset, Decimal::new(100, 0)).unwrap();
        assert_eq!(bal, Decimal::new(100, 0));

        // Debit 30
        let bal = cache.apply_delta(id, asset, Decimal::new(-30, 0)).unwrap();
        assert_eq!(bal, Decimal::new(70, 0));

        // Overdraft fails
        let result = cache.apply_delta(id, asset, Decimal::new(-80, 0));
        assert!(result.is_err());
    }
}
