//! Receipt issuance — sign and persist payment receipts.

use crate::signer::Ed25519Signer;
use fth_types::{Asset, FinError, Invoice, Money, Receipt, ReceiptId, WalletAddress, Rail};
use sqlx::{PgPool, Row};
use tracing::{info, instrument};
use uuid::Uuid;

/// Issues cryptographically signed receipts after settlement.
pub struct ReceiptIssuer {
    pool: PgPool,
    signer: Ed25519Signer,
}

impl ReceiptIssuer {
    pub fn new(pool: PgPool, signer: Ed25519Signer) -> Self {
        Self { pool, signer }
    }

    /// Issue a signed receipt for a settled invoice.
    #[instrument(skip(self, invoice, payer), fields(invoice_id = %invoice.id))]
    pub async fn issue(
        &self,
        invoice: &Invoice,
        payer: WalletAddress,
        tx_hash: &str,
    ) -> Result<Receipt, FinError> {
        let id = ReceiptId::new();
        let receipt = Receipt {
            id,
            invoice_id: invoice.id,
            payer,
            payee: invoice.payee.clone(),
            amount: invoice.amount.clone(),
            asset: invoice.asset,
            rail: invoice.rail,
            tx_hash: tx_hash.to_string(),
            signature: String::new(), // placeholder — signed below
            pubkey: self.signer.public_key_base64(),
            created_at: chrono::Utc::now(),
        };

        // Sign the canonical payload
        let payload = receipt.canonical_payload();
        let signature = self.signer.sign(&payload);

        let receipt = Receipt {
            signature,
            ..receipt
        };

        // Persist
        sqlx::query(
            r#"
            INSERT INTO fc_receipts (id, invoice_id, payer, payee, amount, asset, rail,
                                  tx_hash, signature, pubkey, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            "#,
        )
        .bind(receipt.id.0)
        .bind(receipt.invoice_id.0)
        .bind(&receipt.payer.0)
        .bind(&receipt.payee.0)
        .bind(receipt.amount.amount().to_string())
        .bind(receipt.asset.ticker())
        .bind(serde_json::to_string(&receipt.rail).unwrap_or_default())
        .bind(&receipt.tx_hash)
        .bind(&receipt.signature)
        .bind(&receipt.pubkey)
        .bind(receipt.created_at)
        .execute(&self.pool)
        .await
        .map_err(|e: sqlx::Error| FinError::Database(e.to_string()))?;

        info!(receipt_id = %id, invoice_id = %invoice.id, "receipt issued");
        Ok(receipt)
    }

    /// Look up a receipt by ID.
    pub async fn get(&self, id: ReceiptId) -> Result<Option<Receipt>, FinError> {
        let row = sqlx::query(
            r#"
            SELECT id, invoice_id, payer, payee, amount, asset, rail,
                   tx_hash, signature, pubkey, created_at
            FROM fc_receipts WHERE id = $1
            "#,
        )
        .bind(id.0)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e: sqlx::Error| FinError::Database(e.to_string()))?;

        match row {
            None => Ok(None),
            Some(r) => {
                let asset_str: String = r.try_get("asset").unwrap_or_else(|_| "UNY".to_string());
                let asset: Asset = asset_str.parse().unwrap_or(Asset::Uny);

                let rail_str: String = r.try_get("rail").unwrap_or_default();
                let rail: Rail = serde_json::from_str(&rail_str).unwrap_or(Rail::UnykornL1);

                let amount_str: String = r.try_get("amount").unwrap_or_default();
                let amount_dec: rust_decimal::Decimal = amount_str
                    .parse()
                    .unwrap_or(rust_decimal::Decimal::ZERO);

                let rid: Uuid = r.get("id");
                let invoice_id: Uuid = r.try_get("invoice_id").unwrap_or_default();
                let payer: String = r.try_get("payer").unwrap_or_default();
                let payee: String = r.try_get("payee").unwrap_or_default();
                let tx_hash: String = r.try_get("tx_hash").unwrap_or_default();
                let signature: String = r.try_get("signature").unwrap_or_default();
                let pubkey: String = r.try_get("pubkey").unwrap_or_default();
                let created_at: chrono::DateTime<chrono::Utc> = r.try_get("created_at")
                    .unwrap_or_else(|_| chrono::Utc::now());

                Ok(Some(Receipt {
                    id: ReceiptId(rid),
                    invoice_id: fth_types::InvoiceId(invoice_id),
                    payer: WalletAddress(payer),
                    payee: WalletAddress(payee),
                    amount: Money::from_decimal(asset, amount_dec)
                        .unwrap_or_else(|_| Money::zero(asset)),
                    asset,
                    rail,
                    tx_hash,
                    signature,
                    pubkey,
                    created_at,
                }))
            }
        }
    }
}
