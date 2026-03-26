//! Invoice endpoints.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use fth_types::{AccountId, Asset, CreateInvoiceRequest, InvoiceId, Money, Namespace, Rail, WalletAddress};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::state::AppState;

/// API-layer request (flat amount string, not nested Money object).
#[derive(Debug, Deserialize)]
struct ApiCreateInvoice {
    pub payee: String,
    pub amount: String,
    pub asset: Asset,
    #[serde(default = "default_rail")]
    pub rail: Rail,
    pub namespace: Option<String>,
    pub description: Option<String>,
    #[serde(default = "default_ttl")]
    pub ttl_seconds: u32,
    pub resource_url: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

fn default_rail() -> Rail { Rail::UnykornL1 }
fn default_ttl() -> u32 { 3600 }

pub fn routes(state: AppState) -> Router {
    Router::new()
        .route("/v1/invoices", post(create_invoice))
        .route("/v1/invoices/{id}", get(get_invoice))
        .with_state(state)
}

async fn create_invoice(
    State(state): State<AppState>,
    Json(api_req): Json<ApiCreateInvoice>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    // Parse amount string into Money
    let money = Money::new(api_req.asset, &api_req.amount).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "invalid_amount", "message": e.to_string()})),
        )
    })?;

    // Risk check
    let decision = state.risk.evaluate(
        AccountId::new(), // TODO: extract from auth
        money.amount(),
        api_req.asset,
    );
    if !decision.allowed {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(json!({
                "error": "risk_denied",
                "rule": decision.denied_by,
                "score": decision.score,
            })),
        ));
    }

    let req = CreateInvoiceRequest {
        payee: WalletAddress(api_req.payee),
        amount: money,
        asset: api_req.asset,
        rail: api_req.rail,
        namespace: api_req.namespace.map(Namespace),
        description: api_req.description,
        ttl_seconds: api_req.ttl_seconds,
        resource_url: api_req.resource_url,
        metadata: api_req.metadata,
    };

    let invoice = state
        .invoices
        .create(AccountId::new(), req)
        .await
        .map_err(|e| {
            (
                StatusCode::from_u16(e.status_code()).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
                Json(json!({"error": e.error_code(), "message": e.to_string()})),
            )
        })?;

    Ok((StatusCode::CREATED, Json(serde_json::to_value(&invoice).unwrap())))
}

async fn get_invoice(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let invoice_id = InvoiceId(id);
    match state.invoices.get(invoice_id).await {
        Ok(Some(inv)) => Ok(Json(serde_json::to_value(&inv).unwrap())),
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "not_found", "message": "invoice not found"})),
        )),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.error_code(), "message": e.to_string()})),
        )),
    }
}
