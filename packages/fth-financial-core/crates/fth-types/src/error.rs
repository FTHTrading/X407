//! Error types for the financial core.

use crate::asset::Asset;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum FinError {
    // ── Money errors ──
    #[error("invalid monetary amount: {0}")]
    InvalidAmount(String),

    #[error("negative amount not allowed: {0}")]
    NegativeAmount(String),

    #[error("asset mismatch: expected {expected}, got {got}")]
    AssetMismatch { expected: Asset, got: Asset },

    #[error("insufficient balance: available={available} {asset}, required={required}")]
    InsufficientBalance {
        available: String,
        required: String,
        asset: Asset,
    },

    // ── Account errors ──
    #[error("account not found: {0}")]
    AccountNotFound(String),

    #[error("account frozen: {0}")]
    AccountFrozen(String),

    #[error("duplicate account: {0}")]
    DuplicateAccount(String),

    // ── Invoice errors ──
    #[error("invoice not found: {0}")]
    InvoiceNotFound(String),

    #[error("invoice expired: {0}")]
    InvoiceExpired(String),

    #[error("invoice already paid: {0}")]
    InvoiceAlreadyPaid(String),

    #[error("invoice not payable: {invoice_id}")]
    InvoiceNotPayable { invoice_id: String },

    // ── Ledger errors ──
    #[error("ledger unbalanced: debits={debit_total}, credits={credit_total}")]
    LedgerUnbalanced { debit_total: String, credit_total: String },

    // ── Crypto errors ──
    #[error("crypto error: {0}")]
    CryptoError(String),

    // ── Settlement errors ──
    #[error("settlement failed: {0}")]
    SettlementFailed(String),

    #[error("double-spend detected: receipt {0}")]
    DoubleSpend(String),

    // ── Vault / treasury errors ──
    #[error("vault locked")]
    VaultLocked,

    #[error("refill limit exceeded: daily={daily_used}, max={daily_max}")]
    RefillLimitExceeded { daily_used: String, daily_max: String },

    #[error("agent not found: {0}")]
    AgentNotFound(String),

    // ── Risk errors ──
    #[error("risk limit breached: {0}")]
    RiskLimitBreached(String),

    #[error("velocity check failed: {count} transactions in {window_secs}s, limit={limit}")]
    VelocityExceeded {
        count: u64,
        window_secs: u64,
        limit: u64,
    },

    // ── Crypto / signature errors ──
    #[error("invalid signature")]
    InvalidSignature,

    #[error("invalid public key: {0}")]
    InvalidPublicKey(String),

    // ── Infrastructure ──
    #[error("database error: {0}")]
    Database(String),

    #[error("internal error: {0}")]
    Internal(String),
}

impl FinError {
    /// HTTP status code for API responses.
    pub const fn status_code(&self) -> u16 {
        match self {
            Self::InvalidAmount(_)
            | Self::NegativeAmount(_)
            | Self::AssetMismatch { .. }
            | Self::InvalidPublicKey(_) => 400,

            Self::InvalidSignature => 401,

            Self::InsufficientBalance { .. }
            | Self::InvoiceExpired(_)
            | Self::InvoiceAlreadyPaid(_)
            | Self::InvoiceNotPayable { .. } => 402,

            Self::AccountFrozen(_) | Self::VaultLocked => 403,

            Self::AccountNotFound(_)
            | Self::InvoiceNotFound(_)
            | Self::AgentNotFound(_) => 404,

            Self::DuplicateAccount(_) | Self::DoubleSpend(_) => 409,

            Self::RefillLimitExceeded { .. }
            | Self::VelocityExceeded { .. }
            | Self::RiskLimitBreached(_) => 429,

            Self::SettlementFailed(_)
            | Self::LedgerUnbalanced { .. }
            | Self::CryptoError(_)
            | Self::Database(_)
            | Self::Internal(_) => 500,
        }
    }

    /// Machine-readable error code for API responses.
    pub fn error_code(&self) -> &'static str {
        match self {
            Self::InvalidAmount(_) => "invalid_amount",
            Self::NegativeAmount(_) => "negative_amount",
            Self::AssetMismatch { .. } => "asset_mismatch",
            Self::InsufficientBalance { .. } => "insufficient_balance",
            Self::AccountNotFound(_) => "account_not_found",
            Self::AccountFrozen(_) => "account_frozen",
            Self::DuplicateAccount(_) => "duplicate_account",
            Self::InvoiceNotFound(_) => "invoice_not_found",
            Self::InvoiceExpired(_) => "invoice_expired",
            Self::InvoiceAlreadyPaid(_) => "invoice_already_paid",
            Self::InvoiceNotPayable { .. } => "invoice_not_payable",
            Self::LedgerUnbalanced { .. } => "ledger_unbalanced",
            Self::CryptoError(_) => "crypto_error",
            Self::SettlementFailed(_) => "settlement_failed",
            Self::DoubleSpend(_) => "double_spend",
            Self::VaultLocked => "vault_locked",
            Self::RefillLimitExceeded { .. } => "refill_limit_exceeded",
            Self::AgentNotFound(_) => "agent_not_found",
            Self::RiskLimitBreached(_) => "risk_limit_breached",
            Self::VelocityExceeded { .. } => "velocity_exceeded",
            Self::InvalidSignature => "invalid_signature",
            Self::InvalidPublicKey(_) => "invalid_public_key",
            Self::Database(_) => "database_error",
            Self::Internal(_) => "internal_error",
        }
    }
}
