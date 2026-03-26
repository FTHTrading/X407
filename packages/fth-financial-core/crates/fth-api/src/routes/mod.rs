//! Route definitions.

pub mod health;
pub mod invoices;
pub mod accounts;
pub mod receipts;
pub mod vault;
pub mod risk;

use axum::Router;
use crate::state::AppState;

/// Build the full router.
pub fn router(state: AppState) -> Router {
    Router::new()
        .merge(health::routes())
        .merge(invoices::routes(state.clone()))
        .merge(accounts::routes(state.clone()))
        .merge(receipts::routes(state.clone()))
        .merge(vault::routes(state.clone()))
        .merge(risk::routes(state))
}
