//! FTH Financial Core — Canonical Type System
//!
//! Zero-copy, strongly-typed financial primitives. Every money amount is
//! a [`Money`] — never a float, never a string that sneaks past validation.
//! Asset enums are exhaustive so the compiler catches unhandled currencies.

pub mod asset;
pub mod money;
pub mod account;
pub mod invoice;
pub mod receipt;
pub mod error;
pub mod ids;
pub mod rail;

pub use asset::{Asset, AssetClass};
pub use money::Money;
pub use account::{Account, AccountId, AccountStatus};
pub use invoice::{Invoice, InvoiceId, InvoiceStatus, CreateInvoiceRequest, VerifyPaymentRequest};
pub use receipt::{Receipt, ReceiptId};
pub use error::FinError;
pub use ids::{WalletAddress, Namespace};
pub use rail::Rail;
