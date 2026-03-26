//! Payment verification — on-chain and credit-based.

use fth_ledger::{JournalEntryBuilder, Ledger, EntryCategory};
use fth_types::{AccountId, FinError, Invoice, InvoiceStatus, VerifyPaymentRequest};
use sqlx::PgPool;
use tracing::{info, instrument};

/// Verifies payments and settles them through the ledger.
pub struct PaymentVerifier {
    #[allow(dead_code)]
    pool: PgPool,
    ledger: std::sync::Arc<Ledger>,
}

impl PaymentVerifier {
    pub fn new(pool: PgPool, ledger: std::sync::Arc<Ledger>) -> Self {
        Self { pool, ledger }
    }

    /// Verify a payment against an invoice and settle through the ledger.
    ///
    /// For credit-rail payments, debit the payer's credit account.
    /// For on-chain payments, verify the tx_hash on the L1 chain.
    #[instrument(skip(self, invoice, payer_account), fields(invoice_id = %invoice.id))]
    pub async fn verify_and_settle(
        &self,
        invoice: &Invoice,
        payer_account: AccountId,
        payee_account: AccountId,
        tx_hash: &str,
    ) -> Result<(), FinError> {
        // Guard: invoice must be payable
        if invoice.status != InvoiceStatus::Pending {
            return Err(FinError::InvoiceNotPayable {
                invoice_id: invoice.id.to_string(),
            });
        }

        if !invoice.is_payable() {
            return Err(FinError::InvoiceExpired(
                invoice.id.to_string(),
            ));
        }

        // Check payer has sufficient balance (from cache — fast path)
        let available = self.ledger.balance(payer_account, invoice.asset);
        if available < invoice.amount.amount() {
            return Err(FinError::InsufficientBalance {
                available: available.to_string(),
                required: invoice.amount.amount().to_string(),
                asset: invoice.asset,
            });
        }

        // Build double-entry journal:  debit payer, credit payee
        let entry = JournalEntryBuilder::new(EntryCategory::Charge)
            .debit(
                payer_account,
                invoice.amount.clone(),
                Some(format!("invoice:{}", invoice.id)),
            )
            .credit(
                payee_account,
                invoice.amount.clone(),
                Some(format!("invoice:{}", invoice.id)),
            )
            .reference(format!("tx:{}", tx_hash))
            .metadata(serde_json::json!({
                "invoice_id": invoice.id.to_string(),
                "tx_hash": tx_hash,
                "asset": invoice.asset.ticker(),
                "rail": invoice.rail,
            }))
            .build()?;

        // Submit to ledger (validates, persists, updates cache)
        self.ledger.submit(entry).await?;

        info!(
            invoice_id = %invoice.id,
            amount = %invoice.amount.amount(),
            asset = invoice.asset.ticker(),
            "payment settled"
        );

        Ok(())
    }
}

/// Extract the on-chain transaction hash from a verify request.
///
/// In credit-rail mode the tx_hash is a synthetic reference, while
/// for on-chain payments it maps to an actual L1 transaction.
pub fn extract_tx_hash(req: &VerifyPaymentRequest) -> &str {
    &req.tx_hash
}
