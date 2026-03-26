//! Invoice types for the x402 payment protocol.

use crate::{AccountId, Asset, Money, Rail, WalletAddress, Namespace};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Unique invoice identifier.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct InvoiceId(pub Uuid);

impl InvoiceId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }
}

impl Default for InvoiceId {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Display for InvoiceId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Invoice lifecycle status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InvoiceStatus {
    /// Newly created, awaiting payment.
    Pending,
    /// Payment received and verified.
    Paid,
    /// Payment not received within TTL.
    Expired,
    /// Invoice cancelled by issuer.
    Cancelled,
    /// Payment disputed (reserved for future use).
    Disputed,
}

/// A payment invoice.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Invoice {
    pub id: InvoiceId,
    pub account_id: AccountId,
    pub payee: WalletAddress,
    pub amount: Money,
    pub asset: Asset,
    pub rail: Rail,
    pub namespace: Option<Namespace>,
    pub status: InvoiceStatus,
    pub description: Option<String>,
    /// Time-to-live in seconds.
    pub ttl_seconds: u32,
    pub resource_url: Option<String>,
    pub tx_hash: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub paid_at: Option<DateTime<Utc>>,
}

impl Invoice {
    /// Is this invoice still payable?
    pub fn is_payable(&self) -> bool {
        self.status == InvoiceStatus::Pending && Utc::now() < self.expires_at
    }

    /// Is this invoice terminal (no further state changes)?
    pub fn is_terminal(&self) -> bool {
        matches!(
            self.status,
            InvoiceStatus::Paid | InvoiceStatus::Expired | InvoiceStatus::Cancelled
        )
    }
}

/// Parameters for creating a new invoice.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateInvoiceRequest {
    pub payee: WalletAddress,
    pub amount: Money,
    pub asset: Asset,
    pub rail: Rail,
    pub namespace: Option<Namespace>,
    pub description: Option<String>,
    pub ttl_seconds: u32,
    pub resource_url: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

/// Parameters for verifying a payment against an invoice.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyPaymentRequest {
    pub invoice_id: InvoiceId,
    pub tx_hash: String,
    pub payload: String,
    pub signature: String,
}
