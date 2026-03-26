//! fth-financial-core — Production entry point.
//!
//! Wires together all crates into a running Axum service:
//! Ledger + Settlement + Vault + Risk → HTTP API.

use anyhow::Result;
use fth_api::config::Config;
use fth_api::middleware;
use fth_api::routes;
use fth_api::state::AppState;
use fth_ledger::Ledger;
use fth_risk::{RiskEngine, RiskLimits};
use fth_settlement::{Ed25519Signer, InvoiceEngine, PaymentVerifier, ReceiptIssuer};
use fth_types::AccountId;
use fth_vault::Vault;
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;
use tower_http::compression::CompressionLayer;
use tracing::{info, error};
use tracing_subscriber::{fmt, EnvFilter};
use uuid::Uuid;

#[tokio::main]
async fn main() -> Result<()> {
    // Load config
    let config = Config::from_env().unwrap_or_else(|e| {
        eprintln!("FATAL: failed to load config: {e}");
        std::process::exit(1);
    });

    // Init tracing
    fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new(&config.log_level)),
        )
        .json()
        .init();

    info!(
        bind = %config.bind,
        "starting fth-financial-core v{}",
        env!("CARGO_PKG_VERSION")
    );

    // Database pool
    let pool = PgPoolOptions::new()
        .max_connections(20)
        .connect(&config.database_url)
        .await?;

    info!("database connected");

    // Run migrations / ensure tables exist
    ensure_ledger_tables(&pool).await?;

    // Core engines
    let ledger = Arc::new(Ledger::new(pool.clone()));
    ledger.warmup().await.unwrap_or_else(|e| {
        error!(%e, "ledger warmup failed — starting cold");
    });

    let signer = Ed25519Signer::from_base64_seed(&config.signing_key)
        .map_err(|e| anyhow::anyhow!("invalid signing key: {e}"))?;

    let invoices = Arc::new(InvoiceEngine::new(pool.clone()));
    let payments = Arc::new(PaymentVerifier::new(pool.clone(), ledger.clone()));
    let receipts = Arc::new(ReceiptIssuer::new(pool.clone(), signer));

    // Vault
    // TODO: make master account configurable
    let master_account = AccountId(
        Uuid::parse_str("00000000-0000-0000-0000-000000000001").unwrap(),
    );
    let vault = Arc::new(Vault::new(pool.clone(), ledger.clone(), master_account));

    // Risk
    let mut risk_limits = RiskLimits::default();
    risk_limits.enforce = config.risk_enforce;
    let risk = Arc::new(RiskEngine::new(risk_limits));

    // State
    let state = AppState {
        pool: pool.clone(),
        ledger,
        invoices,
        payments,
        receipts,
        vault,
        risk: risk.clone(),
    };

    // Router
    let app = routes::router(state)
        .layer(axum::middleware::from_fn(middleware::trace_layer))
        .layer(CorsLayer::permissive())
        .layer(CompressionLayer::new());

    // Background tasks
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
        loop {
            interval.tick().await;
            let evicted = risk.maintenance();
            if evicted > 0 {
                info!(evicted, "risk: stale velocity windows evicted");
            }
        }
    });

    // Start
    let listener = TcpListener::bind(&config.bind).await?;
    info!(bind = %config.bind, "listening");
    axum::serve(listener, app).await?;

    Ok(())
}

/// Ensure the financial-core's own tables exist (prefixed with fc_).
async fn ensure_ledger_tables(pool: &sqlx::PgPool) -> Result<()> {
    // Ledger tables
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS ledger_entries (
            id UUID PRIMARY KEY,
            category TEXT NOT NULL,
            reference TEXT,
            metadata JSONB,
            sequence BIGINT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS ledger_legs (
            id UUID PRIMARY KEY,
            entry_id UUID NOT NULL REFERENCES ledger_entries(id),
            leg_index INT NOT NULL,
            account_id UUID NOT NULL,
            direction TEXT NOT NULL,
            amount TEXT NOT NULL,
            asset TEXT NOT NULL,
            memo TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_ledger_legs_entry ON ledger_legs(entry_id)")
        .execute(pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_ledger_legs_account ON ledger_legs(account_id)")
        .execute(pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_ledger_entries_sequence ON ledger_entries(sequence)")
        .execute(pool)
        .await?;

    // Financial-core invoices (separate from x402 invoices table)
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS fc_invoices (
            id UUID PRIMARY KEY,
            account_id UUID NOT NULL,
            payee TEXT NOT NULL,
            amount TEXT NOT NULL,
            asset TEXT NOT NULL DEFAULT 'UNY',
            rail TEXT NOT NULL DEFAULT 'unykorn-l1',
            namespace TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            description TEXT,
            ttl_seconds INT NOT NULL DEFAULT 3600,
            resource_url TEXT,
            tx_hash TEXT,
            metadata JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL,
            paid_at TIMESTAMPTZ
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_fc_invoices_status ON fc_invoices(status, created_at)")
        .execute(pool)
        .await?;

    // Financial-core receipts
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS fc_receipts (
            id UUID PRIMARY KEY,
            invoice_id UUID NOT NULL,
            payer TEXT NOT NULL,
            payee TEXT NOT NULL,
            amount TEXT NOT NULL,
            asset TEXT NOT NULL,
            rail TEXT NOT NULL DEFAULT 'unykorn-l1',
            tx_hash TEXT,
            signature TEXT NOT NULL,
            pubkey TEXT NOT NULL,
            payload TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_fc_receipts_invoice ON fc_receipts(invoice_id)")
        .execute(pool)
        .await?;

    info!("financial-core tables ensured");
    Ok(())
}
