//! Master treasury vault — manages reserves and funds agents.

use crate::agent::{Agent, AgentStatus};
use fth_ledger::{EntryCategory, JournalEntryBuilder, Ledger};
use fth_types::{AccountId, Asset, FinError, Money};
use rust_decimal::Decimal;
use sqlx::{PgPool, Row};
use std::sync::Arc;
use tracing::{info, instrument, warn};
use uuid::Uuid;

/// The master vault account ID. This is the system omnibus.
#[allow(dead_code)]
const VAULT_NAMESPACE: &str = "vault:master";

/// Treasury vault — manages the master reserve and agent refills.
pub struct Vault {
    pool: PgPool,
    ledger: Arc<Ledger>,
    master_account: AccountId,
}

impl Vault {
    /// Create a new vault with a known master account.
    pub fn new(pool: PgPool, ledger: Arc<Ledger>, master_account: AccountId) -> Self {
        Self {
            pool,
            ledger,
            master_account,
        }
    }

    /// Get the master reserve balance for an asset.
    pub fn reserve_balance(&self, asset: Asset) -> Decimal {
        self.ledger.balance(self.master_account, asset)
    }

    /// Refill an agent's credit account from the master reserve.
    #[instrument(skip(self), fields(agent_id = %agent.id, agent_name = %agent.name))]
    pub async fn refill_agent(&self, agent: &Agent) -> Result<Decimal, FinError> {
        let refill_amount = agent.refill_amount();
        if refill_amount <= Decimal::ZERO {
            return Ok(Decimal::ZERO);
        }

        let account_id = agent.account_id.ok_or_else(|| {
            FinError::AccountNotFound(format!("agent {} has no credit account", agent.id))
        })?;

        let money = Money::from_decimal(agent.asset, refill_amount)?;

        // Double-entry: debit vault master, credit agent
        let entry = JournalEntryBuilder::new(EntryCategory::Transfer)
            .debit(
                self.master_account,
                money.clone(),
                Some(format!("refill:agent:{}", agent.id)),
            )
            .credit(
                account_id,
                money,
                Some(format!("refill:from:vault")),
            )
            .reference(format!("agent-refill:{}", agent.id))
            .metadata(serde_json::json!({
                "agent_id": agent.id.to_string(),
                "agent_name": &agent.name,
                "asset": agent.asset.ticker(),
                "refill_amount": refill_amount.to_string(),
            }))
            .build()?;

        self.ledger.submit(entry).await?;

        // Update the agent's balance and last_refill_at in the DB
        let now = chrono::Utc::now();
        sqlx::query(
            r#"
            UPDATE treasury_agents
            SET balance = (COALESCE(balance::numeric, 0) + $1)::text,
                daily_refilled = (COALESCE(daily_refilled::numeric, 0) + $1)::text,
                last_refill_at = $2,
                updated_at = $2
            WHERE id = $3
            "#,
        )
        .bind(refill_amount.to_string())
        .bind(now)
        .bind(agent.id)
        .execute(&self.pool)
        .await
        .map_err(|e: sqlx::Error| FinError::Database(e.to_string()))?;

        // Record in refill history
        sqlx::query(
            r#"
            INSERT INTO treasury_refills (id, agent_id, amount, asset, created_at)
            VALUES ($1, $2, $3, $4, $5)
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(agent.id)
        .bind(refill_amount.to_string())
        .bind(agent.asset.ticker())
        .bind(now)
        .execute(&self.pool)
        .await
        .map_err(|e: sqlx::Error| FinError::Database(e.to_string()))?;

        info!(
            agent = %agent.name,
            amount = %refill_amount,
            asset = agent.asset.ticker(),
            "agent refilled"
        );

        Ok(refill_amount)
    }

    /// Run a full refill sweep — check all active agents.
    #[instrument(skip(self))]
    pub async fn sweep_refills(&self) -> Result<(u32, Decimal), FinError> {
        let rows = sqlx::query(
            r#"
            SELECT id, name, wallet_address, account_id, asset, status,
                   balance, target_balance, min_balance,
                   max_single_refill, max_daily_refill, daily_refilled,
                   last_refill_at, created_at, updated_at
            FROM treasury_agents
            WHERE status = 'active'
            "#,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e: sqlx::Error| FinError::Database(e.to_string()))?;

        let mut refill_count: u32 = 0;
        let mut total_refilled = Decimal::ZERO;

        for row in rows {
            let asset_str: String = row.try_get("asset").unwrap_or_else(|_| "UNY".to_string());
            let asset: Asset = asset_str.parse().unwrap_or(Asset::Uny);

            let agent_id: Uuid = row.get("id");
            let agent_name: String = row.try_get("name").unwrap_or_default();
            let wallet_addr: String = row.try_get("wallet_address").unwrap_or_default();
            let acct_id: Option<Uuid> = row.try_get("account_id").unwrap_or(None);
            let balance_str: Option<String> = row.try_get("balance").unwrap_or(None);
            let target_str: Option<String> = row.try_get("target_balance").unwrap_or(None);
            let min_str: Option<String> = row.try_get("min_balance").unwrap_or(None);
            let max_single_str: Option<String> = row.try_get("max_single_refill").unwrap_or(None);
            let max_daily_str: Option<String> = row.try_get("max_daily_refill").unwrap_or(None);
            let daily_str: Option<String> = row.try_get("daily_refilled").unwrap_or(None);
            let last_refill_at: Option<chrono::DateTime<chrono::Utc>> = row.try_get("last_refill_at").unwrap_or(None);
            let created_at: chrono::DateTime<chrono::Utc> = row.try_get("created_at").unwrap_or_else(|_| chrono::Utc::now());
            let updated_at: chrono::DateTime<chrono::Utc> = row.try_get("updated_at").unwrap_or_else(|_| chrono::Utc::now());

            let agent = Agent {
                id: agent_id,
                name: agent_name,
                wallet_address: fth_types::WalletAddress(wallet_addr),
                account_id: acct_id.map(AccountId),
                asset,
                status: AgentStatus::Active,
                balance: parse_decimal(&balance_str),
                target_balance: parse_decimal(&target_str),
                min_balance: parse_decimal(&min_str),
                max_single_refill: parse_decimal(&max_single_str),
                max_daily_refill: parse_decimal(&max_daily_str),
                daily_refilled: parse_decimal(&daily_str),
                last_refill_at,
                created_at,
                updated_at,
            };

            if agent.needs_refill() {
                match self.refill_agent(&agent).await {
                    Ok(amount) if amount > Decimal::ZERO => {
                        refill_count += 1;
                        total_refilled += amount;
                    }
                    Ok(_) => {}
                    Err(e) => {
                        warn!(agent = %agent.name, error = %e, "refill failed");
                    }
                }
            }
        }

        if refill_count > 0 {
            info!(
                refill_count,
                total = %total_refilled,
                "sweep complete"
            );
        }

        Ok((refill_count, total_refilled))
    }
}

/// Parse a Decimal from an Option<String>, defaulting to ZERO.
fn parse_decimal(opt: &Option<String>) -> Decimal {
    opt.as_deref()
        .and_then(|s| s.parse().ok())
        .unwrap_or(Decimal::ZERO)
}
