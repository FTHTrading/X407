//! Health and readiness endpoints.

use axum::{routing::get, Json, Router};
use serde_json::{json, Value};

pub fn routes() -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/", get(root))
}

async fn root() -> Json<Value> {
    Json(json!({
        "service": "fth-financial-core",
        "version": env!("CARGO_PKG_VERSION"),
        "protocol": "fth-x402/2.0",
    }))
}

async fn health() -> Json<Value> {
    Json(json!({
        "status": "healthy",
        "service": "fth-financial-core",
        "version": env!("CARGO_PKG_VERSION"),
        "uptime_seconds": 0, // TODO: track via state
    }))
}
