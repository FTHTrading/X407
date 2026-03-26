//! Core ledger engine — validates, persists, and applies journal entries.

use crate::balance::BalanceCache;
use crate::journal::{JournalEntry, LegDirection};
use fth_types::{AccountId, Asset, FinError};
use rust_decimal::Decimal;
use sqlx::{PgPool, Row};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, instrument, warn};
use uuid::Uuid;

/// The ledger engine.
///
/// All financial mutations flow through the ledger. It validates
/// double-entry invariants, persists to Postgres, and updates the
/// in-memory balance cache atomically.
pub struct Ledger {
    pool: PgPool,
    cache: BalanceCache,
    /// Sequence counter for ordering entries within the same millisecond.
    sequence: Arc<RwLock<u64>>,
}

impl Ledger {
    /// Create a new ledger engine.
    pub fn new(pool: PgPool) -> Self {
        Self {
            pool,
            cache: BalanceCache::new(),
            sequence: Arc::new(RwLock::new(0)),
        }
    }

    /// Access the balance cache (read-only).
    pub fn cache(&self) -> &BalanceCache {
        &self.cache
    }

    /// Warm up the balance cache from Postgres.
    #[instrument(skip(self))]
    pub async fn warmup(&self) -> Result<(), FinError> {
        let rows = sqlx::query(
            "SELECT id, asset, balance FROM credit_accounts WHERE frozen = false",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e: sqlx::Error| FinError::Database(e.to_string()))?;

        for row in &rows {
            let id: Uuid = row.get("id");
            let account_id = AccountId(id);
            let asset_str: String = row.get("asset");
            let asset: Asset = asset_str
                .parse()
                .unwrap_or(Asset::Uny);
            let balance: Decimal = row.get("balance");
            self.cache.set(account_id, asset, balance);
        }

        info!(accounts = rows.len(), "balance cache warmed up");
        Ok(())
    }

    /// Submit a journal entry — validate, persist, update cache.
    #[instrument(skip(self, entry), fields(entry_id = %entry.id))]
    pub async fn submit(&self, entry: JournalEntry) -> Result<Uuid, FinError> {
        // 1. Validate balanced
        entry.validate()?;

        // 2. Acquire sequence
        let seq = {
            let mut s = self.sequence.write().await;
            *s += 1;
            *s
        };

        // 3. Begin transaction
        let mut tx = self
            .pool
            .begin()
            .await
            .map_err(|e: sqlx::Error| FinError::Database(e.to_string()))?;

        // 4. Insert journal header
        sqlx::query(
            r#"
            INSERT INTO ledger_entries (id, category, reference, metadata, sequence, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            "#,
        )
        .bind(entry.id)
        .bind(serde_json::to_string(&entry.category).unwrap_or_default())
        .bind(&entry.reference)
        .bind(&entry.metadata)
        .bind(seq as i64)
        .bind(entry.created_at)
        .execute(&mut *tx)
        .await
        .map_err(|e: sqlx::Error| FinError::Database(e.to_string()))?;

        // 5. Insert legs and update account balances
        for (i, leg) in entry.legs.iter().enumerate() {
            let signed_amount = match leg.direction {
                LegDirection::Debit => -leg.amount.amount(),
                LegDirection::Credit => leg.amount.amount(),
            };

            sqlx::query(
                r#"
                INSERT INTO ledger_legs (id, entry_id, leg_index, account_id, direction, amount, asset, memo)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                "#,
            )
            .bind(Uuid::new_v4())
            .bind(entry.id)
            .bind(i as i32)
            .bind(leg.account_id.0)
            .bind(serde_json::to_string(&leg.direction).unwrap_or_default())
            .bind(leg.amount.amount().to_string())
            .bind(leg.amount.asset().ticker())
            .bind(&leg.memo)
            .execute(&mut *tx)
            .await
            .map_err(|e: sqlx::Error| FinError::Database(e.to_string()))?;

            // Update account balance in DB
            sqlx::query(
                r#"
                UPDATE credit_accounts
                SET balance = (COALESCE(balance::numeric, 0) + $1)::text,
                    updated_at = NOW()
                WHERE id = $2
                "#,
            )
            .bind(signed_amount.to_string())
            .bind(leg.account_id.0)
            .execute(&mut *tx)
            .await
            .map_err(|e: sqlx::Error| FinError::Database(e.to_string()))?;
        }

        // 6. Commit
        tx.commit()
            .await
            .map_err(|e: sqlx::Error| FinError::Database(e.to_string()))?;

        // 7. Update balance cache (after commit succeeds)
        for leg in &entry.legs {
            let delta = match leg.direction {
                LegDirection::Debit => -leg.amount.amount(),
                LegDirection::Credit => leg.amount.amount(),
            };
            if let Err(e) = self
                .cache
                .apply_delta(leg.account_id, leg.amount.asset(), delta)
            {
                warn!(
                    account_id = %leg.account_id,
                    error = %e,
                    "cache drift detected — will self-heal on next warmup"
                );
            }
        }

        info!(entry_id = %entry.id, legs = entry.legs.len(), "journal entry committed");
        Ok(entry.id)
    }

    /// Get the cached balance for an account/asset pair.
    pub fn balance(&self, account_id: AccountId, asset: Asset) -> Decimal {
        self.cache.get(account_id, asset)
    }

    /// Get the sequence number (for diagnostics).
    pub async fn sequence(&self) -> u64 {
        *self.sequence.read().await
    }
}
