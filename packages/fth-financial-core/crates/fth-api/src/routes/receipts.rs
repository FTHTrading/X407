//! Receipt endpoints.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use fth_types::ReceiptId;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::state::AppState;

pub fn routes(state: AppState) -> Router {
    Router::new()
        .route("/v1/receipts/{id}", get(get_receipt))
        .with_state(state)
}

async fn get_receipt(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let receipt_id = ReceiptId(id);
    match state.receipts.get(receipt_id).await {
        Ok(Some(r)) => Ok(Json(serde_json::to_value(&r).unwrap())),
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "not_found", "message": "receipt not found"})),
        )),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.error_code(), "message": e.to_string()})),
        )),
    }
}
