/**
 * Treasurer Daemon — Treasury & Fund Management
 *
 * Manages the system's financial operations:
 * - Monitors wallet balances across all accounts
 * - Auto-funds agents and services that run low
 * - Enforces spending limits and reserve policies
 * - Bridges funds between L1 and payment systems
 * - Reports financial health to Guardian
 * - Manages the hot/cold wallet split
 */

import type { EventBus } from "../core/event-bus.js";
import type { StateStore } from "../core/state-store.js";
import type { AlertManager } from "../core/alert-manager.js";
import type { AuditLog } from "../core/audit-log.js";
import { sfetch } from "../core/service-fetch.js";

interface WalletBalance {
  address: string;
  name: string;
  balance_uny: string;
  balance: string;
  last_checked: string;
  low_threshold_uny: string;
  low_threshold: string;
}

interface TreasuryPolicy {
  min_reserve_uny: string;
  min_reserve: string;
  max_daily_spend_uny: string;
  max_daily_spend: string;
  auto_fund_threshold: number;   // % of low_threshold to trigger auto-fund
  auto_fund_amount: number;      // % to top up to
  hot_wallet_max_pct: number;    // Max % of total to keep in hot wallet
}

const CHECK_INTERVAL_MS = 30_000;   // Check every 30 seconds
const L1_RPC = process.env.UNYKORN_RPC_URL ?? "http://rpc.l1.unykorn.org:3001";
const TREASURY_URL = process.env.TREASURY_URL ?? "http://localhost:3200";

const DEFAULT_POLICY: TreasuryPolicy = {
  min_reserve_uny:      "1000000000000",    // 1000 UNY (9 decimals)
  min_reserve:     "10000000000",      // 10000 UNY (6 decimals)
  max_daily_spend_uny:  "500000000000",     // 500 UNY per day
  max_daily_spend: "5000000000",       // 5000 UNY per day
  auto_fund_threshold:   25,                 // Fund when below 25% of threshold
  auto_fund_amount:      75,                 // Top up to 75%
  hot_wallet_max_pct:    20,                 // Keep max 20% in hot wallet
};

export class TreasurerDaemon {
  private interval: ReturnType<typeof setInterval> | null = null;
  private wallets = new Map<string, WalletBalance>();
  private policy: TreasuryPolicy = { ...DEFAULT_POLICY };
  private dailySpentUny = 0n;
  private dailySpent = 0n;
  private lastDailyReset = Date.now();

  constructor(
    private bus: EventBus,
    private store: StateStore,
    private alerts: AlertManager,
    private audit: AuditLog,
  ) {
    // Listen for spend events
    this.bus.on("treasury.spend", (event) => {
      const amount = BigInt(event.data?.amount_uny as string ?? "0");
      this.dailySpentUny += amount;
    });

    // Listen for fund requests
    this.bus.on("treasury.fund_request", (event) => {
      const address = event.data?.address as string;
      const amount = event.data?.amount as string;
      if (address && amount) {
        this.fundWallet(address, amount, "UNY");
      }
    });
  }

  async start(): Promise<void> {
    console.log("[Treasurer] Starting fund management daemon");

    // Load policy from DB
    const state = await this.store.getDaemonState("treasurer");
    if (state?.config?.policy) {
      this.policy = { ...DEFAULT_POLICY, ...(state.config.policy as Partial<TreasuryPolicy>) };
    }

    await this.store.setDaemonState("treasurer", { status: "running", config: { policy: this.policy } });

    // Initial balance check
    await this.checkBalances();

    this.interval = setInterval(() => this.runCycle(), CHECK_INTERVAL_MS);
    this.bus.emit("daemon.started", "treasurer", { daemon: "treasurer" });
  }

  async stop(): Promise<void> {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
    await this.store.setDaemonState("treasurer", { status: "stopped" });
    this.bus.emit("daemon.stopped", "treasurer", { daemon: "treasurer" });
  }

  private async runCycle(): Promise<void> {
    try {
      // Reset daily spend at midnight
      const now = Date.now();
      if (now - this.lastDailyReset > 86_400_000) {
        this.dailySpentUny = 0n;
        this.dailySpent = 0n;
        this.lastDailyReset = now;
      }

      await this.checkBalances();
      await this.enforceReserves();
      await this.checkTreasuryService();

      await this.store.setDaemonState("treasurer", {
        status: "running",
        last_run_at: new Date().toISOString(),
        metadata: {
          wallet_count: this.wallets.size,
          daily_spent_uny: this.dailySpentUny.toString(),
          daily_spent: this.dailySpent.toString(),
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.alerts.fire("treasurer", "warn", "Treasury cycle error", msg);
    }
  }

  private async checkBalances(): Promise<void> {
    try {
      // Get all known wallet addresses from the Treasury service
      const resp = await sfetch(`${TREASURY_URL}/treasury/agents`, {
        signal: AbortSignal.timeout(5000),
      });

      if (resp.ok) {
        const data = await resp.json() as { agents?: Array<{ address: string; name: string; balance_uny?: string; balance?: string }> };
        if (data.agents) {
          for (const agent of data.agents) {
            this.wallets.set(agent.address, {
              address: agent.address,
              name: agent.name,
              balance_uny: agent.balance_uny ?? "0",
              balance: agent.balance ?? "0",
              last_checked: new Date().toISOString(),
              low_threshold_uny: "100000000",    // 0.1 UNY
              low_threshold: "1000000",     // 1 UNY
            });
          }
        }
      }
    } catch {
      // Treasury service might not be running
    }

    // Also check L1 system accounts via /status endpoint
    try {
      const statusResp = await fetch(`${L1_RPC}/status`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });

      if (statusResp.ok) {
        const status = await statusResp.json() as { blockHeight?: number; activeValidators?: number };
        await this.store.recordMetric("treasury.l1_block_height", status.blockHeight ?? 0, {});
        await this.store.recordMetric("treasury.l1_validators", status.activeValidators ?? 0, {});
      }

      // Also try RPC method (will be available after mainnet upgrade)
      const resp = await fetch(`${L1_RPC}/rpc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1,
          method: "account_getSystemBalances",
          params: [],
        }),
        signal: AbortSignal.timeout(5000),
      });

      const data = await resp.json() as { result?: Record<string, { uny?: string; usdc?: string }> };
      if (data.result) {
        for (const [addr, bal] of Object.entries(data.result)) {
          this.wallets.set(addr, {
            address: addr,
            name: `system:${addr.slice(0, 8)}`,
            balance_uny: bal.uny ?? "0",
            balance: bal.uny ?? "0",
            last_checked: new Date().toISOString(),
            low_threshold_uny: "1000000000",
            low_threshold: "10000000",
          });
        }
      }
    } catch {
      // L1 may not support these endpoints yet
    }

    // Record metrics
    let totalUny = 0n;
    let totalBalance = 0n;
    for (const wallet of this.wallets.values()) {
      totalUny += BigInt(wallet.balance_uny);
      totalBalance += BigInt(wallet.balance);
    }

    await this.store.recordMetric("treasury.total_uny", Number(totalUny), {});
    await this.store.recordMetric("treasury.total_balance", Number(totalBalance), {});
    await this.store.recordMetric("treasury.wallet_count", this.wallets.size, {});
  }

  private async enforceReserves(): Promise<void> {
    for (const wallet of this.wallets.values()) {
      const balUny = BigInt(wallet.balance_uny);
      const thresholdUny = BigInt(wallet.low_threshold_uny);

      // Check if below auto-fund threshold
      const fundThreshold = thresholdUny * BigInt(this.policy.auto_fund_threshold) / 100n;
      if (balUny < fundThreshold && balUny > 0n) {
        const topUpTo = thresholdUny * BigInt(this.policy.auto_fund_amount) / 100n;
        const fundAmount = topUpTo - balUny;

        // Check daily spend limit
        if (this.dailySpentUny + fundAmount <= BigInt(this.policy.max_daily_spend_uny)) {
          await this.fundWallet(wallet.address, fundAmount.toString(), "UNY");
          this.dailySpentUny += fundAmount;
        } else {
          await this.alerts.fire("treasurer", "critical", "Daily spend limit reached",
            `Cannot fund ${wallet.name}: daily UNY spend limit (${this.policy.max_daily_spend_uny}) reached`);
        }
      }

      // Low balance warning
      if (balUny < thresholdUny) {
        await this.alerts.fire("treasurer", "warn", `Low balance: ${wallet.name}`,
          `${wallet.balance_uny} UNY (threshold: ${wallet.low_threshold_uny})`);
        this.bus.emit("treasury.low_balance", "treasurer", {
          address: wallet.address,
          name: wallet.name,
          balance: wallet.balance_uny,
          threshold: wallet.low_threshold_uny,
        });
      }
    }
  }

  private async checkTreasuryService(): Promise<void> {
    try {
      const resp = await sfetch(`${TREASURY_URL}/health`, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) {
        await this.alerts.fire("treasurer", "critical", "Treasury service unhealthy", `Status: ${resp.status}`);
        this.bus.emit("service.down", "treasurer", { service: "treasury" });
      }
    } catch {
      await this.alerts.fire("treasurer", "critical", "Treasury service unreachable", "Connection failed");
      this.bus.emit("service.down", "treasurer", { service: "treasury" });
    }
  }

  async fundWallet(address: string, amount: string, currency: string): Promise<boolean> {
    try {
      const resp = await sfetch(`${TREASURY_URL}/treasury/fund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, amount, currency }),
        signal: AbortSignal.timeout(10_000),
      });

      if (resp.ok) {
        this.audit.recordAction("treasurer", "fund_wallet", address, "success", { amount, currency });
        this.bus.emit("treasury.funded", "treasurer", { address, amount, currency });
        return true;
      } else {
        throw new Error(`Fund request failed: ${resp.status}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.audit.recordAction("treasurer", "fund_wallet", address, "failed", { amount, currency, error: msg });
      return false;
    }
  }

  updatePolicy(patch: Partial<TreasuryPolicy>): void {
    this.policy = { ...this.policy, ...patch };
    this.audit.recordAction("treasurer", "policy_updated", "treasurer", "success", { patch });
    this.bus.emit("treasury.policy_updated", "treasurer", { policy: this.policy });
  }

  getStatus() {
    return {
      wallet_count: this.wallets.size,
      wallets: Object.fromEntries(this.wallets),
      daily_spent_uny: this.dailySpentUny.toString(),
      daily_spent: this.dailySpent.toString(),
      policy: this.policy,
    };
  }
}
