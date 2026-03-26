//! # fth-ledger — Double-entry append-only ledger engine
//!
//! This crate implements a strict double-entry accounting ledger where
//! every financial mutation produces balanced journal entries. Entries
//! are append-only — no updates or deletes — providing a complete,
//! auditable history.
//!
//! ## Architecture
//!
//! - **JournalEntry**: The atomic unit — a set of balanced debit/credit legs.
//! - **Leg**: A single debit or credit against one account.
//! - **Ledger**: The engine that validates, sequences and persists entries.
//! - **BalanceCache**: In-memory balance cache backed by DashMap for hot reads.

pub mod engine;
pub mod journal;
pub mod balance;

pub use engine::Ledger;
pub use journal::{JournalEntry, Leg, LegDirection, JournalEntryBuilder, EntryCategory};
pub use balance::BalanceCache;
