//! # fth-settlement — Settlement engine
//!
//! Handles the full lifecycle of a payment:
//!
//! 1. **Invoice creation** — Validate params, persist, start expiry timer.
//! 2. **Payment verification** — Verify on-chain tx or credit balance, match to invoice.
//! 3. **Settlement** — Debit payer, credit payee via the ledger.
//! 4. **Receipt generation** — Produce a cryptographically signed receipt.

pub mod invoices;
pub mod payments;
pub mod receipts;
pub mod signer;

pub use invoices::InvoiceEngine;
pub use payments::PaymentVerifier;
pub use receipts::ReceiptIssuer;
pub use signer::Ed25519Signer;
