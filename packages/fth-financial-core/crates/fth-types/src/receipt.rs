//! Signed receipt types.

use crate::{Asset, InvoiceId, Money, Rail, WalletAddress};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Unique receipt identifier.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct ReceiptId(pub Uuid);

impl ReceiptId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }
}

impl Default for ReceiptId {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Display for ReceiptId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// A cryptographically signed payment receipt.
///
/// Receipts are the immutable proof of payment for the x402 protocol.
/// They contain a deterministic payload signed with Ed25519.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Receipt {
    pub id: ReceiptId,
    pub invoice_id: InvoiceId,
    pub payer: WalletAddress,
    pub payee: WalletAddress,
    pub amount: Money,
    pub asset: Asset,
    pub rail: Rail,
    pub tx_hash: String,
    /// Base64-encoded Ed25519 signature of the canonical payload.
    pub signature: String,
    /// Base64-encoded Ed25519 public key that produced the signature.
    pub pubkey: String,
    pub created_at: DateTime<Utc>,
}

impl Receipt {
    /// Build the canonical payload bytes that are signed.
    ///
    /// Format: `invoice_id|payer|payee|amount|asset|rail|tx_hash`
    pub fn canonical_payload(&self) -> Vec<u8> {
        format!(
            "{}|{}|{}|{}|{}|{}|{}",
            self.invoice_id,
            self.payer.0,
            self.payee.0,
            self.amount.amount(),
            self.asset.ticker(),
            serde_json::to_string(&self.rail).unwrap_or_default(),
            self.tx_hash,
        )
        .into_bytes()
    }
}

/// Compact receipt returned in x402 HTTP headers.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompactReceipt {
    pub receipt_id: ReceiptId,
    pub invoice_id: InvoiceId,
    pub amount: String,
    pub asset: String,
    pub signature: String,
    pub pubkey: String,
}

impl From<&Receipt> for CompactReceipt {
    fn from(r: &Receipt) -> Self {
        Self {
            receipt_id: r.id,
            invoice_id: r.invoice_id,
            amount: r.amount.amount().to_string(),
            asset: r.asset.ticker().to_string(),
            signature: r.signature.clone(),
            pubkey: r.pubkey.clone(),
        }
    }
}
