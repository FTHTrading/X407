//! Sliding-window velocity tracker backed by DashMap.

use chrono::{DateTime, Utc};
use dashmap::DashMap;
use fth_types::AccountId;
use parking_lot::Mutex;
use rust_decimal::Decimal;
use std::collections::VecDeque;
use std::sync::Arc;
use std::time::Duration;

/// A single recorded event in the window.
#[derive(Debug, Clone)]
struct Event {
    amount: Decimal,
    at: DateTime<Utc>,
}

/// Per-account sliding window.
#[derive(Debug)]
struct Window {
    events: VecDeque<Event>,
}

impl Window {
    fn new() -> Self {
        Self {
            events: VecDeque::new(),
        }
    }

    /// Prune events outside the window.
    fn prune(&mut self, window: Duration) {
        let cutoff = Utc::now() - chrono::Duration::from_std(window).unwrap_or_default();
        while let Some(front) = self.events.front() {
            if front.at < cutoff {
                self.events.pop_front();
            } else {
                break;
            }
        }
    }

    /// Count of events in the window.
    fn count(&self) -> u32 {
        self.events.len() as u32
    }

    /// Sum of amounts in the window.
    fn total(&self) -> Decimal {
        self.events.iter().map(|e| e.amount).sum()
    }

    /// Push a new event.
    fn push(&mut self, amount: Decimal) {
        self.events.push_back(Event {
            amount,
            at: Utc::now(),
        });
    }
}

/// Thread-safe velocity tracker using DashMap + per-entry Mutex.
#[derive(Debug, Clone)]
pub struct VelocityTracker {
    windows: Arc<DashMap<AccountId, Mutex<Window>>>,
    window_duration: Duration,
}

impl VelocityTracker {
    pub fn new(window_duration: Duration) -> Self {
        Self {
            windows: Arc::new(DashMap::new()),
            window_duration,
        }
    }

    /// Record a transaction for an account and return (count, total) after recording.
    pub fn record(&self, account_id: AccountId, amount: Decimal) -> (u32, Decimal) {
        let entry = self
            .windows
            .entry(account_id)
            .or_insert_with(|| Mutex::new(Window::new()));
        let mut window = entry.value().lock();
        window.prune(self.window_duration);
        window.push(amount);
        (window.count(), window.total())
    }

    /// Peek at current window stats without recording.
    pub fn peek(&self, account_id: AccountId) -> (u32, Decimal) {
        match self.windows.get(&account_id) {
            None => (0, Decimal::ZERO),
            Some(entry) => {
                let mut window = entry.value().lock();
                window.prune(self.window_duration);
                (window.count(), window.total())
            }
        }
    }

    /// Number of tracked accounts.
    pub fn tracked_accounts(&self) -> usize {
        self.windows.len()
    }

    /// Evict stale accounts (those with empty windows after pruning).
    pub fn evict_stale(&self) -> usize {
        let mut evicted = 0;
        self.windows.retain(|_, v| {
            let mut window = v.lock();
            window.prune(self.window_duration);
            if window.events.is_empty() {
                evicted += 1;
                false
            } else {
                true
            }
        });
        evicted
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn velocity_tracking() {
        let tracker = VelocityTracker::new(Duration::from_secs(3600));
        let account = AccountId::new();

        let (count, total) = tracker.record(account, Decimal::new(100, 0));
        assert_eq!(count, 1);
        assert_eq!(total, Decimal::new(100, 0));

        let (count, total) = tracker.record(account, Decimal::new(200, 0));
        assert_eq!(count, 2);
        assert_eq!(total, Decimal::new(300, 0));

        // Peek doesn't change state
        let (count, total) = tracker.peek(account);
        assert_eq!(count, 2);
        assert_eq!(total, Decimal::new(300, 0));
    }
}
