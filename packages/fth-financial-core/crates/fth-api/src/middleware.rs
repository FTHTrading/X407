//! Request middleware — authentication, tracing, metrics.

use axum::{
    extract::Request,
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::Response,
};
use tracing::info;
use std::time::Instant;

/// Request timing + tracing middleware.
pub async fn trace_layer(req: Request, next: Next) -> Response {
    let method = req.method().clone();
    let uri = req.uri().clone();
    let start = Instant::now();

    let response = next.run(req).await;

    let elapsed = start.elapsed();
    let status = response.status().as_u16();

    info!(
        method = %method,
        uri = %uri,
        status,
        elapsed_ms = elapsed.as_millis() as u64,
        "request"
    );

    response
}

/// Simple API-key auth middleware.
pub async fn auth_layer(
    headers: HeaderMap,
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // In production, validate the X-Api-Key header against DB.
    // For now, just ensure it's present.
    if let Some(_key) = headers.get("x-api-key") {
        Ok(next.run(req).await)
    } else {
        // Allow health/metrics endpoints without auth
        let path = req.uri().path();
        if path == "/health" || path == "/metrics" || path == "/" {
            Ok(next.run(req).await)
        } else {
            Err(StatusCode::UNAUTHORIZED)
        }
    }
}
