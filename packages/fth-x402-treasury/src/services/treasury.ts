import pool from "../db";
import type { TreasuryAgentRow, TreasuryEvaluation } from "../types";
import { dispatchTreasuryEvent } from "./webhooks";

type JsonRecord = Record<string, unknown>;

type LoggerLike = {
  info?: (obj: unknown, msg?: string) => void;
  error?: (obj: unknown, msg?: string) => void;
};

type RegisterAgentInput = {
  wallet_address: string;
  namespace?: string;
  rail?: string;
  pubkey?: string;
  target_balance?: string;
  min_balance?: string;
  max_single_refill?: string;
  max_daily_refill?: string;
  metadata?: JsonRecord;
};

type FundAgentInput = {
  amount: string;
  funding_mode?: "credit" | "uny" | "mixed";
  reference?: string;
  anchor_tx_hash?: string;
  metadata?: JsonRecord;
};

type TreasuryHaltInput = {
  scope_type: "global" | "namespace" | "agent";
  scope_key?: string | null;
  active?: boolean;
  reason?: string;
  metadata?: JsonRecord;
};

const AUTO_REFILL_INTERVAL_MS = Number(process.env.TREASURY_REFILL_INTERVAL_MS ?? 60_000);
const DEFAULT_MIN_BALANCE = Number(process.env.TREASURY_DEFAULT_min_balance ?? 10);
const DEFAULT_TARGET_BALANCE = Number(process.env.TREASURY_DEFAULT_target_balance ?? 50);
const DEFAULT_MAX_SINGLE_REFILL = Number(process.env.TREASURY_max_single_refill ?? 25);
const DEFAULT_MAX_DAILY_REFILL = Number(process.env.TREASURY_max_daily_refill ?? 250);
const DEFAULT_FUNDING_MODE = (process.env.TREASURY_FUNDING_MODE ?? "credit") as "credit" | "uny" | "mixed";

let refillTimer: NodeJS.Timeout | null = null;

function amountToString(value: unknown, fallback: number): string {
  const numeric = typeof value === "undefined" || value === null || value === ""
    ? fallback
    : Number(value);

  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`Invalid amount: ${String(value)}`);
  }

  return numeric.toFixed(7);
}

function numeric(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapAgentRow(row: Record<string, unknown>): TreasuryAgentRow {
  return {
    agent_id: String(row.agent_id),
    wallet_address: String(row.wallet_address),
    namespace: row.namespace ? String(row.namespace) : null,
    rail: String(row.rail),
    asset: String(row.asset ?? "UNY"),
    status: String(row.status),
    target_balance: String(row.target_balance),
    min_balance: String(row.min_balance),
    max_single_refill: String(row.max_single_refill),
    max_daily_refill: String(row.max_daily_refill),
    balance: String(row.balance),
    frozen: Boolean(row.frozen),
    last_refill_at: row.last_refill_at ? String(row.last_refill_at) : null,
    metadata: (row.metadata as JsonRecord | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

async function getOrCreateCreditAccount(
  client: { query: typeof pool.query },
  input: RegisterAgentInput,
): Promise<{ id: string; wallet_address: string; balance: string; rail: string; namespace: string | null }> {
  const existing = await client.query(
    `SELECT id, wallet_address, balance, rail, namespace
     FROM credit_accounts
     WHERE wallet_address = $1`,
    [input.wallet_address],
  );

  if (existing.rows[0]) {
    await client.query(
      `UPDATE credit_accounts
       SET rail = COALESCE($2, rail),
           namespace = COALESCE($3, namespace),
           pubkey = COALESCE($4, pubkey),
           updated_at = now()
       WHERE wallet_address = $1`,
      [input.wallet_address, input.rail ?? null, input.namespace ?? null, input.pubkey ?? null],
    );

    return existing.rows[0] as { id: string; wallet_address: string; balance: string; rail: string; namespace: string | null };
  }

  const created = await client.query(
    `INSERT INTO credit_accounts (wallet_address, rail, namespace, balance, pubkey)
     VALUES ($1, $2, $3, 0, $4)
     RETURNING id, wallet_address, balance, rail, namespace`,
    [
      input.wallet_address,
      input.rail ?? "unykorn-l1",
      input.namespace ?? null,
      input.pubkey ?? null,
    ],
  );

  return created.rows[0] as { id: string; wallet_address: string; balance: string; rail: string; namespace: string | null };
}

async function getAgentRowByWhere(
  whereClause: string,
  params: unknown[],
): Promise<TreasuryAgentRow | null> {
  const result = await pool.query(
    `SELECT ta.agent_id, ta.wallet_address, ta.namespace, ca.rail, ta.status,
            ta.target_balance, ta.min_balance,
            ta.max_single_refill, ta.max_daily_refill,
            ca.balance, ca.frozen, ta.last_refill_at,
            ta.metadata, ta.created_at, ta.updated_at
     FROM treasury_agents ta
     JOIN credit_accounts ca ON ca.wallet_address = ta.wallet_address
     ${whereClause}`,
    params,
  );

  return result.rows[0] ? mapAgentRow(result.rows[0] as Record<string, unknown>) : null;
}

async function getDailyRefilledAmount(
  client: { query: typeof pool.query },
  agentId: string,
): Promise<number> {
  const result = await client.query(
    `SELECT COALESCE(SUM(amount), 0)::text AS total
     FROM treasury_refills
     WHERE agent_id = $1
       AND status = 'completed'
       AND created_at >= date_trunc('day', now())`,
    [agentId],
  );

  return numeric(result.rows[0]?.total ?? 0);
}

async function getActiveHalts(
  client: { query: typeof pool.query },
  walletAddress: string,
  namespace: string | null,
): Promise<Array<{ scope_type: string; scope_key: string | null; reason: string | null }>> {
  const result = await client.query(
    `SELECT scope_type, scope_key, reason
     FROM treasury_halts
     WHERE active = true
       AND (
         scope_type = 'global'
         OR (scope_type = 'agent' AND scope_key = $1)
         OR (scope_type = 'namespace' AND scope_key = $2)
       )
     ORDER BY created_at DESC`,
    [walletAddress, namespace],
  );

  return result.rows as Array<{ scope_type: string; scope_key: string | null; reason: string | null }>;
}

export async function registerAgent(input: RegisterAgentInput): Promise<TreasuryAgentRow> {
  if (!input.wallet_address) {
    throw new Error("wallet_address is required");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await getOrCreateCreditAccount(client, input);

    await client.query(
      `INSERT INTO treasury_agents (
         wallet_address,
         namespace,
         status,
         target_balance,
         min_balance,
         max_single_refill,
         max_daily_refill,
         metadata
       )
       VALUES ($1, $2, 'active', $3, $4, $5, $6, $7)
       ON CONFLICT (wallet_address)
       DO UPDATE SET
         namespace = EXCLUDED.namespace,
         status = 'active',
         target_balance = EXCLUDED.target_balance,
         min_balance = EXCLUDED.min_balance,
         max_single_refill = EXCLUDED.max_single_refill,
         max_daily_refill = EXCLUDED.max_daily_refill,
         metadata = COALESCE(EXCLUDED.metadata, treasury_agents.metadata),
         updated_at = now()`,
      [
        input.wallet_address,
        input.namespace ?? null,
        amountToString(input.target_balance, DEFAULT_TARGET_BALANCE),
        amountToString(input.min_balance, DEFAULT_MIN_BALANCE),
        amountToString(input.max_single_refill, DEFAULT_MAX_SINGLE_REFILL),
        amountToString(input.max_daily_refill, DEFAULT_MAX_DAILY_REFILL),
        input.metadata ?? null,
      ],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const agent = await getAgentByWallet(input.wallet_address);
  if (!agent) {
    throw new Error("Failed to load treasury agent after registration");
  }
  return agent;
}

export async function listAgents(filters: {
  status?: string;
  namespace?: string;
  limit?: number;
  offset?: number;
}): Promise<{ agents: TreasuryAgentRow[]; total: number; limit: number; offset: number }> {
  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = filters.offset ?? 0;
  const params: unknown[] = [];
  const conditions: string[] = [];
  let idx = 1;

  if (filters.status) {
    conditions.push(`ta.status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters.namespace) {
    conditions.push(`ta.namespace = $${idx++}`);
    params.push(filters.namespace);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM treasury_agents ta ${where}`,
    params,
  );

  const dataResult = await pool.query(
    `SELECT ta.agent_id, ta.wallet_address, ta.namespace, ca.rail, ta.status,
            ta.target_balance, ta.min_balance,
            ta.max_single_refill, ta.max_daily_refill,
            ca.balance, ca.frozen, ta.last_refill_at,
            ta.metadata, ta.created_at, ta.updated_at
     FROM treasury_agents ta
     JOIN credit_accounts ca ON ca.wallet_address = ta.wallet_address
     ${where}
     ORDER BY ta.created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset],
  );

  return {
    agents: dataResult.rows.map((row) => mapAgentRow(row as Record<string, unknown>)),
    total: countResult.rows[0]?.total ?? 0,
    limit,
    offset,
  };
}

export async function getAgentById(agentId: string): Promise<TreasuryAgentRow | null> {
  return getAgentRowByWhere("WHERE ta.agent_id = $1", [agentId]);
}

export async function getAgentByWallet(walletAddress: string): Promise<TreasuryAgentRow | null> {
  return getAgentRowByWhere("WHERE ta.wallet_address = $1", [walletAddress]);
}

export async function evaluateAgent(agentId: string): Promise<TreasuryEvaluation> {
  const agent = await getAgentById(agentId);
  if (!agent) {
    throw new Error("Treasury agent not found");
  }

  const halts = await getActiveHalts(pool, agent.wallet_address, agent.namespace);
  const currentBalance = numeric(agent.balance);
  const minBalance = numeric(agent.min_balance);
  const targetBalance = numeric(agent.target_balance);
  const dailyRefilled = await getDailyRefilledAmount(pool, agent.agent_id);
  const maxSingle = numeric(agent.max_single_refill);
  const maxDaily = numeric(agent.max_daily_refill);

  let blocked = false;
  let reason: string | null = null;

  if (agent.status !== "active") {
    blocked = true;
    reason = `agent_status_${agent.status}`;
  } else if (agent.frozen) {
    blocked = true;
    reason = "credit_account_frozen";
  } else if (halts.length > 0) {
    blocked = true;
    reason = halts[0].reason ?? `${halts[0].scope_type}_halt_active`;
  }

  const deficit = Math.max(targetBalance - currentBalance, 0);
  const remainingDaily = Math.max(maxDaily - dailyRefilled, 0);
  const recommended = currentBalance < minBalance
    ? Math.max(Math.min(deficit, maxSingle, remainingDaily), 0)
    : 0;

  if (!blocked && currentBalance < minBalance && remainingDaily <= 0) {
    blocked = true;
    reason = "daily_refill_limit_reached";
  }

  return {
    agent_id: agent.agent_id,
    wallet_address: agent.wallet_address,
    namespace: agent.namespace,
    asset: agent.asset ?? "UNY",
    status: agent.status,
    current_balance: amountToString(currentBalance, 0),
    min_balance: amountToString(minBalance, 0),
    target_balance: amountToString(targetBalance, 0),
    recommended_refill: amountToString(recommended, 0),
    max_single_refill: amountToString(maxSingle, 0),
    max_daily_refill: amountToString(maxDaily, 0),
    daily_refilled: amountToString(dailyRefilled, 0),
    refill_needed: currentBalance < minBalance,
    blocked,
    reason,
  };
}

export async function fundAgent(agentId: string, input: FundAgentInput) {
  const client = await pool.connect();
  let walletAddress: string | null = null;
  let namespace: string | null = null;
  try {
    await client.query("BEGIN");

    const agentResult = await client.query(
      `SELECT ta.agent_id, ta.wallet_address, ta.namespace, ta.status,
              ta.max_single_refill, ta.max_daily_refill,
              ca.id AS account_id, ca.balance, ca.frozen
       FROM treasury_agents ta
       JOIN credit_accounts ca ON ca.wallet_address = ta.wallet_address
       WHERE ta.agent_id = $1
       FOR UPDATE`,
      [agentId],
    );

    if (!agentResult.rows[0]) {
      throw new Error("Treasury agent not found");
    }

    const agent = agentResult.rows[0] as Record<string, unknown>;
    walletAddress = String(agent.wallet_address);
    namespace = agent.namespace ? String(agent.namespace) : null;
    const halts = await getActiveHalts(client, String(agent.wallet_address), agent.namespace ? String(agent.namespace) : null);
    if (halts.length > 0) {
      throw new Error(halts[0].reason ?? "Treasury halt active");
    }

    if (String(agent.status) !== "active") {
      throw new Error(`Treasury agent is ${String(agent.status)}`);
    }

    if (Boolean(agent.frozen)) {
      throw new Error("Credit account is frozen");
    }

    const amount = amountToString(input.amount, 0);
    const amountNumeric = numeric(amount);
    const maxSingle = numeric(agent.max_single_refill);
    if (amountNumeric <= 0) {
      throw new Error("amount must be greater than zero");
    }
    if (amountNumeric > maxSingle) {
      throw new Error("Requested amount exceeds max_single_refill");
    }

    const dailyRefilled = await getDailyRefilledAmount(client, String(agent.agent_id));
    const maxDaily = numeric(agent.max_daily_refill);
    if (dailyRefilled + amountNumeric > maxDaily) {
      throw new Error("Requested amount exceeds max_daily_refill");
    }

    const updatedAccount = await client.query(
      `UPDATE credit_accounts
       SET balance = balance + $2,
           updated_at = now()
       WHERE id = $1
       RETURNING id, balance`,
      [agent.account_id, amount],
    );

    const balanceAfter = String(updatedAccount.rows[0].balance);

    await client.query(
      `INSERT INTO credit_transactions
         (account_id, type, amount, balance_after, reference, rail, tx_hash, metadata)
       VALUES ($1, 'deposit', $2, $3, $4, $5, $6, $7)`,
      [
        agent.account_id,
        amount,
        balanceAfter,
        input.reference ?? "treasury_refill",
        "unykorn-l1",
        input.anchor_tx_hash ?? null,
        input.metadata ?? null,
      ],
    );

    const refillResult = await client.query(
      `INSERT INTO treasury_refills
         (agent_id, account_id, wallet_address, amount, funding_mode, reference, anchor_tx_hash, status, metadata, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', $8, now())
       RETURNING *`,
      [
        agent.agent_id,
        agent.account_id,
        agent.wallet_address,
        amount,
        input.funding_mode ?? DEFAULT_FUNDING_MODE,
        input.reference ?? "treasury_refill",
        input.anchor_tx_hash ?? null,
        input.metadata ?? null,
      ],
    );

    await client.query(
      `UPDATE treasury_agents
       SET last_refill_at = now(), updated_at = now()
       WHERE agent_id = $1`,
      [agentId],
    );

    await client.query("COMMIT");

    dispatchTreasuryEvent(walletAddress, "treasury.refill.completed", {
      agent_id: String(agent.agent_id),
      wallet_address: walletAddress,
      namespace,
      amount: amount,
      balance_after: balanceAfter,
      funding_mode: input.funding_mode ?? DEFAULT_FUNDING_MODE,
      reference: input.reference ?? "treasury_refill",
      anchor_tx_hash: input.anchor_tx_hash ?? null,
      status: "completed",
      metadata: input.metadata ?? null,
    }).catch(() => {});

    return {
      refill: refillResult.rows[0],
      balance_after: balanceAfter,
    };
  } catch (error) {
    await client.query("ROLLBACK");

    if (walletAddress) {
      dispatchTreasuryEvent(walletAddress, "treasury.refill.failed", {
        agent_id: agentId,
        wallet_address: walletAddress,
        namespace,
        requested_amount: input.amount,
        funding_mode: input.funding_mode ?? DEFAULT_FUNDING_MODE,
        reference: input.reference ?? "treasury_refill",
        error: error instanceof Error ? error.message : String(error),
        metadata: input.metadata ?? null,
      }).catch(() => {});
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function triggerRecommendedRefill(
  agentId: string,
  options?: { dry_run?: boolean; reference?: string; metadata?: JsonRecord },
) {
  const evaluation = await evaluateAgent(agentId);
  if (!evaluation.refill_needed || numeric(evaluation.recommended_refill) <= 0) {
    return {
      evaluation,
      executed: false,
      reason: evaluation.reason ?? "no_refill_required",
    };
  }

  if (evaluation.blocked || options?.dry_run) {
    if (evaluation.blocked && !options?.dry_run) {
      dispatchTreasuryEvent(evaluation.wallet_address, "treasury.refill.blocked", {
        agent_id: evaluation.agent_id,
        wallet_address: evaluation.wallet_address,
        namespace: evaluation.namespace,
        current_balance: evaluation.current_balance,
        min_balance: evaluation.min_balance,
        target_balance: evaluation.target_balance,
        recommended_refill: evaluation.recommended_refill,
        reason: evaluation.reason,
        reference: options?.reference ?? "treasury_policy_refill",
        metadata: options?.metadata ?? null,
      }).catch(() => {});
    }

    return {
      evaluation,
      executed: false,
      reason: evaluation.reason ?? (options?.dry_run ? "dry_run" : "refill_blocked"),
    };
  }

  const result = await fundAgent(agentId, {
    amount: evaluation.recommended_refill,
    funding_mode: DEFAULT_FUNDING_MODE,
    reference: options?.reference ?? "treasury_policy_refill",
    metadata: options?.metadata,
  });

  return {
    evaluation,
    executed: true,
    result,
  };
}

export async function listRefills(filters: {
  status?: string;
  agent_id?: string;
  limit?: number;
  offset?: number;
}) {
  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = filters.offset ?? 0;
  const params: unknown[] = [];
  const conditions: string[] = [];
  let idx = 1;

  if (filters.status) {
    conditions.push(`status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters.agent_id) {
    conditions.push(`agent_id = $${idx++}`);
    params.push(filters.agent_id);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM treasury_refills ${where}`,
    params,
  );

  const dataResult = await pool.query(
    `SELECT refill_id, agent_id, wallet_address, amount, funding_mode,
            reference, anchor_tx_hash, status, metadata,
            created_at, completed_at
     FROM treasury_refills
     ${where}
     ORDER BY created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset],
  );

  return {
    refills: dataResult.rows,
    total: countResult.rows[0]?.total ?? 0,
    limit,
    offset,
  };
}

export async function getExposure() {
  const [summaryResult, refillResult, haltResult] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int AS agents_total,
         COUNT(*) FILTER (WHERE ta.status = 'active')::int AS agents_active,
         COUNT(*) FILTER (WHERE ca.balance < ta.min_balance)::int AS agents_below_min,
         COALESCE(SUM(ca.balance), 0)::text AS total_balance,
         COALESCE(SUM(GREATEST(ta.target_balance - ca.balance, 0)), 0)::text AS total_deficit
       FROM treasury_agents ta
       JOIN credit_accounts ca ON ca.wallet_address = ta.wallet_address`,
    ),
    pool.query(
      `SELECT
         COUNT(*)::int AS refill_count_24h,
         COALESCE(SUM(amount), 0)::text AS refill_volume_24h
       FROM treasury_refills
       WHERE status = 'completed'
         AND created_at >= now() - interval '24 hours'`,
    ),
    pool.query(
      `SELECT halt_id, scope_type, scope_key, reason, created_at
       FROM treasury_halts
       WHERE active = true
       ORDER BY created_at DESC`,
    ),
  ]);

  return {
    summary: summaryResult.rows[0],
    refill_24h: refillResult.rows[0],
    active_halts: haltResult.rows,
  };
}

export async function setTreasuryHalt(input: TreasuryHaltInput) {
  const active = input.active ?? true;
  const scopeKey = input.scope_key ?? null;

  if (!active) {
    const result = await pool.query(
      `UPDATE treasury_halts
       SET active = false,
           cleared_at = now(),
           metadata = COALESCE($3, metadata)
       WHERE active = true
         AND scope_type = $1
         AND COALESCE(scope_key, '') = COALESCE($2, '')
       RETURNING *`,
      [input.scope_type, scopeKey, input.metadata ?? null],
    );

    return {
      action: "cleared",
      affected: result.rowCount ?? 0,
      halts: result.rows,
    };
  }

  const result = await pool.query(
    `INSERT INTO treasury_halts (scope_type, scope_key, active, reason, metadata)
     VALUES ($1, $2, true, $3, $4)
     RETURNING *`,
    [input.scope_type, scopeKey, input.reason ?? null, input.metadata ?? null],
  );

  return {
    action: "created",
    affected: 1,
    halts: result.rows,
  };
}

export async function getTreasuryStatus() {
  const [exposure, recentRefills] = await Promise.all([
    getExposure(),
    listRefills({ limit: 10, offset: 0 }),
  ]);

  return {
    service: "fth-x402-treasury",
    refill_enabled: String(process.env.TREASURY_REFILL_ENABLED ?? "false") === "true",
    funding_mode: DEFAULT_FUNDING_MODE,
    exposure,
    recent_refills: recentRefills.refills,
  };
}

export function startTreasuryWorker(logger?: LoggerLike) {
  if (String(process.env.TREASURY_REFILL_ENABLED ?? "false") !== "true") {
    return;
  }

  if (refillTimer) {
    return;
  }

  refillTimer = setInterval(async () => {
    try {
      const agents = await listAgents({ status: "active", limit: 200, offset: 0 });
      for (const agent of agents.agents) {
        const evaluation = await evaluateAgent(agent.agent_id);
        if (!evaluation.blocked && numeric(evaluation.recommended_refill) > 0) {
          const result = await triggerRecommendedRefill(agent.agent_id, {
            reference: "auto_refill_worker",
          });
          logger?.info?.({
            agent_id: agent.agent_id,
            wallet_address: agent.wallet_address,
            recommended_refill: evaluation.recommended_refill,
            executed: result.executed,
          }, "Treasury refill evaluation complete");
        }
      }
    } catch (error) {
      logger?.error?.({ error: error instanceof Error ? error.message : String(error) }, "Treasury refill worker error");
    }
  }, AUTO_REFILL_INTERVAL_MS);
}

export function stopTreasuryWorker() {
  if (refillTimer) {
    clearInterval(refillTimer);
    refillTimer = null;
  }
}