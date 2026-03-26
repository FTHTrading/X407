//! Account endpoints.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use fth_types::{AccountId, Asset};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::state::AppState;

pub fn routes(state: AppState) -> Router {
    Router::new()
        .route("/v1/accounts/{id}/balance", get(get_balance))
        .with_state(state)
}

async fn get_balance(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let account_id = AccountId(id);

    // Get balances for all assets from cache
    let uny_bal = state.ledger.balance(account_id, Asset::Uny);
    let usdf_bal = state.ledger.balance(account_id, Asset::Usdf);

    Ok(Json(json!({
        "account_id": id.to_string(),
        "balances": {
            "UNY": uny_bal.to_string(),
            "USDF": usdf_bal.to_string(),
        }
    })))
}
