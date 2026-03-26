//! Invoice creation and lifecycle management.

use chrono::Utc;
use fth_types::{CreateInvoiceRequest, FinError, Invoice, InvoiceId, InvoiceStatus, AccountId};
use sqlx::{PgPool, Row};
use tracing::{info, instrument, warn};
use uuid::Uuid;

/// Manages invoice creation, expiry, and status transitions.
pub struct InvoiceEngine {
    pool: PgPool,
}

impl InvoiceEngine {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Create a new invoice.
    #[instrument(skip(self, req), fields(payee = %req.payee.0))]
    pub async fn create(
        &self,
        account_id: AccountId,
        req: CreateInvoiceRequest,
    ) -> Result<Invoice, FinError> {
        let now = Utc::now();
        let expires_at = now + chrono::Duration::seconds(req.ttl_seconds as i64);
        let id = InvoiceId::new();

        sqlx::query(
            r#"
            INSERT INTO fc_invoices (id, account_id, payee, amount, asset, rail, namespace,
                                  status, description, ttl_seconds, resource_url, metadata,
                                  created_at, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10, $11, $12, $13)
            "#,
        )
        .bind(id.0)
        .bind(account_id.0)
        .bind(&req.payee.0)
        .bind(req.amount.amount().to_string())
        .bind(req.asset.ticker())
        .bind(serde_json::to_string(&req.rail).unwrap_or_default())
        .bind(req.namespace.as_ref().map(|n| &n.0))
        .bind(&req.description)
        .bind(req.ttl_seconds as i32)
        .bind(&req.resource_url)
        .bind(&req.metadata)
        .bind(now)
        .bind(expires_at)
        .execute(&self.pool)
        .await
        .map_err(|e: sqlx::Error| FinError::Database(e.to_string()))?;

        let invoice = Invoice {
            id,
            account_id,
            payee: req.payee,
            amount: req.amount,
            asset: req.asset,
            rail: req.rail,
            namespace: req.namespace,
            status: InvoiceStatus::Pending,
            description: req.description,
            ttl_seconds: req.ttl_seconds,
            resource_url: req.resource_url,
            tx_hash: None,
            metadata: req.metadata,
            created_at: now,
            expires_at,
            paid_at: None,
        };

        info!(invoice_id = %id, "invoice created");
        Ok(invoice)
    }

    /// Look up an invoice by ID.
    pub async fn get(&self, id: InvoiceId) -> Result<Option<Invoice>, FinError> {
        let row = sqlx::query(
            r#"
            SELECT id, account_id, payee, amount, asset, rail, namespace,
                   status, description, ttl_seconds, resource_url, tx_hash,
                   metadata, created_at, expires_at, paid_at
            FROM fc_invoices WHERE id = $1
            "#,
        )
        .bind(id.0)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e: sqlx::Error| FinError::Database(e.to_string()))?;

        match row {
            None => Ok(None),
            Some(r) => {
                let status_str: String = r.get("status");
                let status = match status_str.as_str() {
                    "paid" => InvoiceStatus::Paid,
                    "expired" => InvoiceStatus::Expired,
                    "cancelled" => InvoiceStatus::Cancelled,
                    "disputed" => InvoiceStatus::Disputed,
                    _ => InvoiceStatus::Pending,
                };

                let asset_str: String = r.try_get("asset").unwrap_or_else(|_| "UNY".to_string());
                let asset: fth_types::Asset = asset_str
                    .parse()
                    .unwrap_or(fth_types::Asset::Uny);

                let rail_str: String = r.try_get("rail").unwrap_or_default();
                let rail: fth_types::Rail = serde_json::from_str(&rail_str)
                    .unwrap_or(fth_types::Rail::UnykornL1);

                let amount_str: String = r.try_get("amount").unwrap_or_default();
                let amount_dec: rust_decimal::Decimal = amount_str
                    .parse()
                    .unwrap_or(rust_decimal::Decimal::ZERO);

                let inv_id: Uuid = r.get("id");
                let acct_id: Uuid = r.get("account_id");
                let payee_str: String = r.try_get("payee").unwrap_or_default();
                let namespace_opt: Option<String> = r.try_get("namespace").unwrap_or(None);
                let description: Option<String> = r.try_get("description").unwrap_or(None);
                let ttl: i32 = r.try_get("ttl_seconds").unwrap_or(0);
                let resource_url: Option<String> = r.try_get("resource_url").unwrap_or(None);
                let tx_hash: Option<String> = r.try_get("tx_hash").unwrap_or(None);
                let metadata: Option<String> = r.try_get("metadata").unwrap_or(None);
                let metadata_value: Option<serde_json::Value> = metadata
                    .and_then(|s| serde_json::from_str(&s).ok());
                let created_at: chrono::DateTime<Utc> = r.try_get("created_at").unwrap_or_else(|_| Utc::now());
                let expires_at: chrono::DateTime<Utc> = r.try_get("expires_at").unwrap_or_else(|_| Utc::now());
                let paid_at: Option<chrono::DateTime<Utc>> = r.try_get("paid_at").unwrap_or(None);

                Ok(Some(Invoice {
                    id: InvoiceId(inv_id),
                    account_id: AccountId(acct_id),
                    payee: fth_types::WalletAddress(payee_str),
                    amount: fth_types::Money::from_decimal(asset, amount_dec)
                        .unwrap_or_else(|_| fth_types::Money::zero(asset)),
                    asset,
                    rail,
                    namespace: namespace_opt.map(fth_types::Namespace),
                    status,
                    description,
                    ttl_seconds: ttl as u32,
                    resource_url,
                    tx_hash,
                    metadata: metadata_value,
                    created_at,
                    expires_at,
                    paid_at,
                }))
            }
        }
    }

    /// Mark an invoice as paid.
    #[instrument(skip(self))]
    pub async fn mark_paid(
        &self,
        id: InvoiceId,
        tx_hash: &str,
    ) -> Result<(), FinError> {
        let now = Utc::now();
        let result = sqlx::query(
            r#"
            UPDATE fc_invoices
            SET status = 'paid', tx_hash = $1, paid_at = $2
            WHERE id = $3 AND status = 'pending'
            "#,
        )
        .bind(tx_hash)
        .bind(now)
        .bind(id.0)
        .execute(&self.pool)
        .await
        .map_err(|e: sqlx::Error| FinError::Database(e.to_string()))?;

        if result.rows_affected() == 0 {
            warn!(invoice_id = %id, "mark_paid: invoice not found or not pending");
            return Err(FinError::InvoiceNotPayable {
                invoice_id: id.to_string(),
            });
        }

        info!(invoice_id = %id, tx_hash, "invoice marked paid");
        Ok(())
    }

    /// Expire all invoices past their TTL.
    #[instrument(skip(self))]
    pub async fn expire_stale(&self) -> Result<u64, FinError> {
        let now = Utc::now();
        let result = sqlx::query(
            r#"
            UPDATE fc_invoices
            SET status = 'expired'
            WHERE status = 'pending' AND expires_at < $1
            "#,
        )
        .bind(now)
        .execute(&self.pool)
        .await
        .map_err(|e: sqlx::Error| FinError::Database(e.to_string()))?;

        let count = result.rows_affected();
        if count > 0 {
            info!(expired = count, "stale invoices expired");
        }
        Ok(count)
    }
}
