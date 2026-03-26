//! Vault / treasury endpoints.

use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use fth_types::Asset;
use serde_json::{json, Value};

use crate::state::AppState;

pub fn routes(state: AppState) -> Router {
    Router::new()
        .route("/v1/vault/status", get(vault_status))
        .route("/v1/vault/sweep", post(vault_sweep))
        .with_state(state)
}

async fn vault_status(
    State(state): State<AppState>,
) -> Json<Value> {
    let uny_reserve = state.vault.reserve_balance(Asset::Uny);
    let usdf_reserve = state.vault.reserve_balance(Asset::Usdf);

    Json(json!({
        "reserves": {
            "UNY": uny_reserve.to_string(),
            "USDF": usdf_reserve.to_string(),
        },
        "ledger_sequence": state.ledger.sequence().await,
    }))
}

async fn vault_sweep(
    State(state): State<AppState>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (count, total) = state.vault.sweep_refills().await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.error_code(), "message": e.to_string()})),
        )
    })?;

    Ok(Json(json!({
        "refilled_agents": count,
        "total_refilled": total.to_string(),
    })))
}
