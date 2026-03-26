//! # fth-vault — Treasury vault
//!
//! Manages treasury agent wallets, auto-refill policies, and
//! master-key secured vault operations.
//!
//! ## Key concepts
//!
//! - **Agent**: A managed wallet with auto-refill thresholds.
//! - **RefillPolicy**: Declarative rules controlling when and how much to refill.
//! - **Vault**: The master treasury that holds reserves and funds agents.

pub mod agent;
pub mod policy;
pub mod vault;

pub use agent::{Agent, AgentStatus};
pub use policy::RefillPolicy;
pub use vault::Vault;
