//! Shared application state.

use fth_ledger::Ledger;
use fth_risk::RiskEngine;
use fth_settlement::{InvoiceEngine, PaymentVerifier, ReceiptIssuer};
use fth_vault::Vault;
use sqlx::PgPool;
use std::sync::Arc;

/// Shared application state passed to all route handlers.
#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub ledger: Arc<Ledger>,
    pub invoices: Arc<InvoiceEngine>,
    pub payments: Arc<PaymentVerifier>,
    pub receipts: Arc<ReceiptIssuer>,
    pub vault: Arc<Vault>,
    pub risk: Arc<RiskEngine>,
}
