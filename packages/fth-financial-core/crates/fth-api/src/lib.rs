//! # fth-api — Axum HTTP server for the financial core
//!
//! This is the main entry point that wires together all crates
//! into a production HTTP service.

pub mod routes;
pub mod state;
pub mod middleware;
pub mod config;
