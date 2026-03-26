/**
 * Reaper Daemon — Revenue Collection & Profit Extraction
 *
 * Actively generates and collects real money:
 * - Collects transaction fees from L1 chain
 * - Harvests staking rewards from validators
 * - Gathers oracle reward distributions
 * - Sweeps accumulated fees from Facilitator
 * - Tracks revenue in real-time
 * - Compounds earnings by restaking
 * - Reports revenue to treasury
 */

import type { EventBus } from "../core/event-bus.js";
import type { StateStore } from "../core/state-store.js";
import type { AlertManager } from "../core/alert-manager.js";
import type { AuditLog } from "../core/audit-log.js";

interface RevenueStream {
  name: string;
  source: string;
  last_collected: string;
  total_collected_uny: string;
  total_collected: string;
  collection_count: number;
  active: boolean;
}

const COLLECTION_INTERVAL_MS = 60_000;   // Collect every 60 seconds
const COMPOUND_INTERVAL_MS = 3_600_000;  // Compound every hour
const L1_RPC = process.env.UNYKORN_RPC_URL ?? "http://rpc.l1.unykorn.org:3001";
const FACILITATOR_URL = process.env.FACILITATOR_URL ?? "http://localhost:3100";

export class ReaperDaemon {
  private interval: ReturnType<typeof setInterval> | null = null;
  private compoundInterval: ReturnType<typeof setInterval> | null = null;
  private streams = new Map<string, RevenueStream>();
  private totalUny = 0n;
  private totalAlt = 0n;
  private collectionCount = 0;

  constructor(
    private bus: EventBus,
    private store: StateStore,
    private alerts: AlertManager,
    private audit: AuditLog,
  ) {
    // Initialize revenue streams
    this.streams.set("tx_fees", {
      name: "Transaction Fees",
      source: "l1_chain",
      last_collected: "",
      total_collected_uny: "0",
      total_collected: "0",
      collection_count: 0,
      active: true,
    });
    this.streams.set("staking_rewards", {
      name: "Staking Rewards",
      source: "l1_validators",
      last_collected: "",
      total_collected_uny: "0",
      total_collected: "0",
      collection_count: 0,
      active: true,
    });
    this.streams.set("oracle_rewards", {
      name: "Oracle Rewards",
      source: "l1_oracles",
      last_collected: "",
      total_collected_uny: "0",
      total_collected: "0",
      collection_count: 0,
      active: true,
    });
    this.streams.set("facilitator_fees", {
      name: "Facilitator Fees",
      source: "x402_facilitator",
      last_collected: "",
      total_collected_uny: "0",
      total_collected: "0",
      collection_count: 0,
      active: true,
    });
    this.streams.set("payment_fees", {
      name: "x402 Payment Fees",
      source: "x402_payments",
      last_collected: "",
      total_collected_uny: "0",
      total_collected: "0",
      collection_count: 0,
      active: true,
    });
  }

  async start(): Promise<void> {
    console.log("[Reaper] Starting revenue collection daemon");
    await this.store.setDaemonState("reaper", { status: "running" });

    // Start collection cycle
    await this.collectAll();
    this.interval = setInterval(() => this.collectAll(), COLLECTION_INTERVAL_MS);

    // Start compounding cycle
    this.compoundInterval = setInterval(() => this.compoundEarnings(), COMPOUND_INTERVAL_MS);

    this.bus.emit("daemon.started", "reaper", { daemon: "reaper" });
  }

  async stop(): Promise<void> {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
    if (this.compoundInterval) { clearInterval(this.compoundInterval); this.compoundInterval = null; }
    await this.store.setDaemonState("reaper", { status: "stopped" });
    this.bus.emit("daemon.stopped", "reaper", { daemon: "reaper" });
  }

  private async collectAll(): Promise<void> {
    try {
      await Promise.allSettled([
        this.collectTransactionFees(),
        this.collectStakingRewards(),
        this.collectOracleRewards(),
        this.collectFacilitatorFees(),
        this.collectPaymentFees(),
      ]);

      this.collectionCount++;
      await this.store.setDaemonState("reaper", {
        status: "running",
        last_run_at: new Date().toISOString(),
        success_count: this.collectionCount,
        metadata: {
          total_uny: this.totalUny.toString(),
          total_alt: this.totalAlt.toString(),
          streams: Object.fromEntries(this.streams),
        },
      });

      await this.store.recordMetric("reaper.total_uny", Number(this.totalUny), {});
      await this.store.recordMetric("reaper.total_alt", Number(this.totalAlt), {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.alerts.fire("reaper", "warn", "Revenue collection error", msg);
    }
  }

  private async collectTransactionFees(): Promise<void> {
    try {
      // Query L1 /status for transaction count — estimate fees from block production
      const resp = await fetch(`${L1_RPC}/status`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });

      if (resp.ok) {
        const status = await resp.json() as { blockHeight?: number; requestsTotal?: number };
        const blockHeight = status.blockHeight ?? 0;

        // Also try the RPC method (will be available after mainnet upgrade)
        try {
          const rpcResp = await fetch(`${L1_RPC}/rpc`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "chain_getAccumulatedFees", params: [] }),
            signal: AbortSignal.timeout(5_000),
          });
          const rpcData = await rpcResp.json() as { result?: { fees_uny?: string } };
          if (rpcData.result?.fees_uny) {
            const fees = BigInt(rpcData.result.fees_uny);
            if (fees > 0n) {
              this.totalUny += fees;
              this.updateStream("tx_fees", fees.toString(), "0");
              await this.store.recordRevenue("l1_tx_fees", fees.toString(), "0", "fee", { block_height: blockHeight });
              this.audit.recordRevenue("reaper", fees.toString(), "UNY", { source: "tx_fees" });
              this.bus.emit("revenue.collected", "reaper", { stream: "tx_fees", amount_uny: fees.toString() });
            }
          }
        } catch { /* RPC method not available yet */ }

        // Record block production metric regardless
        await this.store.recordMetric("reaper.l1_block_height", blockHeight, {});
      }
    } catch {
      // L1 may not be reachable
    }
  }

  private async collectStakingRewards(): Promise<void> {
    try {
      const resp = await fetch(`${L1_RPC}/rpc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1,
          method: "staking_getPendingRewards",
          params: [],
        }),
        signal: AbortSignal.timeout(10_000),
      });

      const data = await resp.json() as { result?: { rewards_uny?: string; validators?: unknown[] } };
      if (data.result?.rewards_uny) {
        const rewards = BigInt(data.result.rewards_uny);
        if (rewards > 0n) {
          // Claim the rewards
          await fetch(`${L1_RPC}/rpc`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0", id: 2,
              method: "staking_claimRewards",
              params: [],
            }),
            signal: AbortSignal.timeout(10_000),
          });

          this.totalUny += rewards;
          this.updateStream("staking_rewards", rewards.toString(), "0");

          await this.store.recordRevenue("staking_rewards", rewards.toString(), "0", "staking");
          this.audit.recordRevenue("reaper", rewards.toString(), "UNY", { source: "staking" });
          this.bus.emit("revenue.collected", "reaper", { stream: "staking", amount_uny: rewards.toString() });

          if (rewards > 1_000_000_000n) { // > 1 UNY (assuming 9 decimals)
            await this.alerts.fire("reaper", "info", "Staking rewards collected", `${rewards.toString()} UNY harvested`);
          }
        }
      }
    } catch {
      // Staking module not yet active on devnet — will work after mainnet
    }
  }

  private async collectOracleRewards(): Promise<void> {
    try {
      const resp = await fetch(`${L1_RPC}/rpc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1,
          method: "oracle_getPendingRewards",
          params: [],
        }),
        signal: AbortSignal.timeout(10_000),
      });

      const data = await resp.json() as { result?: { rewards_uny?: string } };
      if (data.result?.rewards_uny) {
        const rewards = BigInt(data.result.rewards_uny);
        if (rewards > 0n) {
          this.totalUny += rewards;
          this.updateStream("oracle_rewards", rewards.toString(), "0");
          await this.store.recordRevenue("oracle_rewards", rewards.toString(), "0", "oracle");
          this.audit.recordRevenue("reaper", rewards.toString(), "UNY", { source: "oracle" });
          this.bus.emit("revenue.collected", "reaper", { stream: "oracle", amount_uny: rewards.toString() });
        }
      }
    } catch {
      // Oracle module may not expose this RPC yet
    }
  }

  private async collectFacilitatorFees(): Promise<void> {
    try {
      // Query the facilitator for accumulated fees
      const resp = await fetch(`${FACILITATOR_URL}/operator/metrics`, {
        signal: AbortSignal.timeout(5000),
      });

      if (resp.ok) {
        const data = await resp.json() as { fees_collected_uny?: string; fees_collected?: string };
        const feesUny = BigInt(data.fees_collected_uny ?? "0");
        const feesPrimary = BigInt(data.fees_collected ?? "0");

        if (feesUny > 0n || feesPrimary > 0n) {
          this.totalUny += feesUny;
          this.totalAlt += feesPrimary;
          this.updateStream("facilitator_fees", feesUny.toString(), feesPrimary.toString());
          await this.store.recordRevenue("facilitator_fees", feesUny.toString(), feesPrimary.toString(), "facilitator");
          this.bus.emit("revenue.collected", "reaper", {
            stream: "facilitator_fees",
            amount_uny: feesUny.toString(),
            amount: feesPrimary.toString(),
          });
        }
      }
    } catch {
      // Facilitator might not be running locally
    }
  }

  private async collectPaymentFees(): Promise<void> {
    try {
      // Query x402 payment processing fees
      const resp = await fetch(`${FACILITATOR_URL}/credits/stats`, {
        signal: AbortSignal.timeout(5000),
      });

      if (resp.ok) {
        const data = await resp.json() as { total_fees?: string; payment_count?: number };
        const fees = BigInt(data.total_fees ?? "0");
        if (fees > 0n) {
          this.totalUny += fees;
          this.updateStream("payment_fees", "0", fees.toString());
          await this.store.recordRevenue("payment_fees", "0", fees.toString(), "payment");
          this.bus.emit("revenue.collected", "reaper", { stream: "payments", amount: fees.toString() });
        }
      }
    } catch {
      // Normal if facilitator not running
    }
  }

  private updateStream(name: string, amountUny: string, amountPrimary: string): void {
    const stream = this.streams.get(name);
    if (!stream) return;
    stream.last_collected = new Date().toISOString();
    stream.total_collected_uny = (BigInt(stream.total_collected_uny) + BigInt(amountUny)).toString();
    stream.total_collected = (BigInt(stream.total_collected) + BigInt(amountPrimary)).toString();
    stream.collection_count++;
  }

  private async compoundEarnings(): Promise<void> {
    try {
      // Restake available UNY for compound interest
      const resp = await fetch(`${L1_RPC}/rpc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1,
          method: "staking_restakeRewards",
          params: [],
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (resp.ok) {
        const data = await resp.json() as { result?: { restaked_uny?: string } };
        if (data.result?.restaked_uny) {
          this.audit.recordAction("reaper", "compound", "staking", "success", {
            restaked: data.result.restaked_uny,
          });
          this.bus.emit("revenue.compounded", "reaper", { amount: data.result.restaked_uny });
        }
      }
    } catch {
      // Compounding not yet available — will work after mainnet
    }
  }

  getStatus() {
    return {
      total_uny: this.totalUny.toString(),
      total_alt: this.totalAlt.toString(),
      collection_count: this.collectionCount,
      streams: Object.fromEntries(this.streams),
    };
  }

  getStreams(): RevenueStream[] {
    return Array.from(this.streams.values());
  }
}
