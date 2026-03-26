//! # fth-risk — Real-time risk engine
//!
//! Evaluates every financial operation against configurable risk rules:
//!
//! - **Velocity limits**: Max transactions per window per account.
//! - **Exposure caps**: Max outstanding exposure per account/asset.
//! - **Amount thresholds**: Single-transaction size limits.
//! - **Anomaly detection**: Statistical deviation from account baseline.

pub mod engine;
pub mod limits;
pub mod velocity;

pub use engine::{RiskEngine, RiskDecision};
pub use limits::RiskLimits;
pub use velocity::VelocityTracker;
