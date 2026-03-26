//! Risk engine endpoints.

use axum::{
    extract::State,
    routing::get,
    Json, Router,
};
use serde_json::{json, Value};

use crate::state::AppState;

pub fn routes(state: AppState) -> Router {
    Router::new()
        .route("/v1/risk/stats", get(risk_stats))
        .with_state(state)
}

async fn risk_stats(
    State(state): State<AppState>,
) -> Json<Value> {
    let tracked = state.risk.velocity().tracked_accounts();

    Json(json!({
        "tracked_accounts": tracked,
        "engine": "fth-risk",
    }))
}
