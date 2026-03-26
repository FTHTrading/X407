//! Money type — the only way to represent monetary amounts in the system.
//!
//! Backed by [`rust_decimal::Decimal`] for exact arithmetic. All operations
//! are checked — overflow, underflow, and negative balances are compile-time
//! or runtime errors, never silent truncation.

use crate::asset::Asset;
use crate::error::FinError;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::ops::{Add, Sub};
use std::str::FromStr;

/// A monetary amount bound to a specific asset. Immutable value type.
///
/// ```rust
/// use fth_types::{Money, Asset};
/// let five_uny = Money::new(Asset::Uny, "5.00").unwrap();
/// let ten_uny = Money::new(Asset::Uny, "10.00").unwrap();
/// let sum = (five_uny + ten_uny).unwrap();
/// assert_eq!(sum.to_string(), "15.00 UNY");
/// ```
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct Money {
    asset: Asset,
    /// Internal representation — exact decimal, never floating point.
    amount: Decimal,
}

impl Money {
    /// Create a new Money from a string amount.
    pub fn new(asset: Asset, amount: &str) -> Result<Self, FinError> {
        let decimal = Decimal::from_str(amount)
            .map_err(|_| FinError::InvalidAmount(amount.to_string()))?;
        if decimal.is_sign_negative() {
            return Err(FinError::NegativeAmount(decimal.to_string()));
        }
        Ok(Self { asset, amount: decimal })
    }

    /// Create from a raw Decimal (must be non-negative).
    pub fn from_decimal(asset: Asset, amount: Decimal) -> Result<Self, FinError> {
        if amount.is_sign_negative() {
            return Err(FinError::NegativeAmount(amount.to_string()));
        }
        Ok(Self { asset, amount })
    }

    /// Zero amount for the given asset.
    #[inline]
    pub const fn zero(asset: Asset) -> Self {
        Self { asset, amount: Decimal::ZERO }
    }

    /// The asset this money is denominated in.
    #[inline]
    pub const fn asset(&self) -> Asset {
        self.asset
    }

    /// Raw decimal amount.
    #[inline]
    pub const fn amount(&self) -> Decimal {
        self.amount
    }

    /// Is this amount zero?
    #[inline]
    pub fn is_zero(&self) -> bool {
        self.amount.is_zero()
    }

    /// String representation of the amount only (no ticker).
    pub fn amount_str(&self) -> String {
        self.amount.to_string()
    }

    /// Checked subtraction — returns error if result would be negative.
    pub fn checked_sub(self, other: Self) -> Result<Self, FinError> {
        if self.asset != other.asset {
            return Err(FinError::AssetMismatch {
                expected: self.asset,
                got: other.asset,
            });
        }
        let result = self.amount - other.amount;
        if result.is_sign_negative() {
            return Err(FinError::InsufficientBalance {
                available: self.amount.to_string(),
                required: other.amount.to_string(),
                asset: self.asset,
            });
        }
        Ok(Self { asset: self.asset, amount: result })
    }

    /// Checked addition — returns error on asset mismatch.
    pub fn checked_add(self, other: Self) -> Result<Self, FinError> {
        if self.asset != other.asset {
            return Err(FinError::AssetMismatch {
                expected: self.asset,
                got: other.asset,
            });
        }
        Ok(Self {
            asset: self.asset,
            amount: self.amount + other.amount,
        })
    }

    /// Scale to a number of decimal places (for display / storage).
    pub fn round(self, dp: u32) -> Self {
        Self {
            asset: self.asset,
            amount: self.amount.round_dp(dp),
        }
    }
}

impl fmt::Display for Money {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} {}", self.amount, self.asset.ticker())
    }
}

/// Addition returns Result to enforce asset parity.
impl Add for Money {
    type Output = Result<Money, FinError>;
    fn add(self, rhs: Self) -> Self::Output {
        self.checked_add(rhs)
    }
}

/// Subtraction returns Result to prevent negative balances.
impl Sub for Money {
    type Output = Result<Money, FinError>;
    fn sub(self, rhs: Self) -> Self::Output {
        self.checked_sub(rhs)
    }
}
