/**
 * StateStore — Persistent state for all daemons
 *
 * Stores daemon state, metrics, configurations, and upgrade history
 * in PostgreSQL. Used for coordination between daemons and persistence
 * across restarts.
 */

import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30_000,
});

export interface DaemonState {
  daemon_name: string;
  status: string;
  last_run_at: string;
  next_run_at: string;
  error_count: number;
  success_count: number;
  config: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export class StateStore {
  async initialize(): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS guardian_daemon_state (
        daemon_name    TEXT PRIMARY KEY,
        status         TEXT DEFAULT 'stopped',
        last_run_at    TIMESTAMPTZ,
        next_run_at    TIMESTAMPTZ,
        error_count    INTEGER DEFAULT 0,
        success_count  INTEGER DEFAULT 0,
        config         JSONB DEFAULT '{}',
        metadata       JSONB DEFAULT '{}',
        updated_at     TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS guardian_metrics (
        id             BIGSERIAL PRIMARY KEY,
        metric_name    TEXT NOT NULL,
        metric_value   DOUBLE PRECISION NOT NULL,
        labels         JSONB DEFAULT '{}',
        recorded_at    TIMESTAMPTZ DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_guardian_metrics_name_time
        ON guardian_metrics (metric_name, recorded_at DESC);

      CREATE TABLE IF NOT EXISTS guardian_audit_log (
        id             BIGSERIAL PRIMARY KEY,
        event_type     TEXT NOT NULL,
        source         TEXT NOT NULL,
        severity       TEXT DEFAULT 'info',
        message        TEXT,
        details        JSONB DEFAULT '{}',
        created_at     TIMESTAMPTZ DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_guardian_audit_severity
        ON guardian_audit_log (severity, created_at DESC);

      CREATE TABLE IF NOT EXISTS guardian_upgrades (
        id             BIGSERIAL PRIMARY KEY,
        component      TEXT NOT NULL,
        from_version   TEXT,
        to_version     TEXT NOT NULL,
        status         TEXT DEFAULT 'pending',
        initiated_by   TEXT DEFAULT 'auto',
        started_at     TIMESTAMPTZ DEFAULT now(),
        completed_at   TIMESTAMPTZ,
        rollback_at    TIMESTAMPTZ,
        details        JSONB DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS guardian_security_events (
        id             BIGSERIAL PRIMARY KEY,
        event_type     TEXT NOT NULL,
        source_ip      TEXT,
        target         TEXT,
        severity       TEXT DEFAULT 'medium',
        action_taken   TEXT,
        blocked        BOOLEAN DEFAULT false,
        details        JSONB DEFAULT '{}',
        created_at     TIMESTAMPTZ DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_guardian_security_severity
        ON guardian_security_events (severity, created_at DESC);

      CREATE TABLE IF NOT EXISTS guardian_revenue (
        id             BIGSERIAL PRIMARY KEY,
        source         TEXT NOT NULL,
        amount_uny     TEXT NOT NULL DEFAULT '0',
        amount_alt     TEXT NOT NULL DEFAULT '0',
        tx_hash        TEXT,
        block_height   BIGINT,
        category       TEXT DEFAULT 'fee',
        details        JSONB DEFAULT '{}',
        created_at     TIMESTAMPTZ DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_guardian_revenue_time
        ON guardian_revenue (created_at DESC);
    `);
  }

  async getDaemonState(name: string): Promise<DaemonState | null> {
    const { rows } = await pool.query(
      "SELECT * FROM guardian_daemon_state WHERE daemon_name = $1",
      [name],
    );
    return rows[0] as DaemonState | null;
  }

  async setDaemonState(name: string, state: Partial<DaemonState>): Promise<void> {
    await pool.query(
      `INSERT INTO guardian_daemon_state (daemon_name, status, last_run_at, error_count, success_count, config, metadata, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (daemon_name) DO UPDATE SET
         status = COALESCE(EXCLUDED.status, guardian_daemon_state.status),
         last_run_at = COALESCE(EXCLUDED.last_run_at, guardian_daemon_state.last_run_at),
         error_count = COALESCE(EXCLUDED.error_count, guardian_daemon_state.error_count),
         success_count = COALESCE(EXCLUDED.success_count, guardian_daemon_state.success_count),
         config = COALESCE(EXCLUDED.config, guardian_daemon_state.config),
         metadata = COALESCE(EXCLUDED.metadata, guardian_daemon_state.metadata),
         updated_at = now()`,
      [
        name,
        state.status ?? "running",
        state.last_run_at ?? new Date().toISOString(),
        state.error_count ?? 0,
        state.success_count ?? 0,
        JSON.stringify(state.config ?? {}),
        JSON.stringify(state.metadata ?? {}),
      ],
    );
  }

  async recordMetric(name: string, value: number, labels: Record<string, string> = {}): Promise<void> {
    await pool.query(
      "INSERT INTO guardian_metrics (metric_name, metric_value, labels) VALUES ($1, $2, $3)",
      [name, value, JSON.stringify(labels)],
    );
  }

  async getMetrics(name: string, limit = 100): Promise<Array<{ value: number; labels: Record<string, string>; recorded_at: string }>> {
    const { rows } = await pool.query(
      "SELECT metric_value AS value, labels, recorded_at FROM guardian_metrics WHERE metric_name = $1 ORDER BY recorded_at DESC LIMIT $2",
      [name, limit],
    );
    return rows as Array<{ value: number; labels: Record<string, string>; recorded_at: string }>;
  }

  async recordRevenue(source: string, amountUny: string, amountAlt: string, category: string, details: Record<string, unknown> = {}): Promise<void> {
    await pool.query(
      "INSERT INTO guardian_revenue (source, amount_uny, amount_alt, category, details) VALUES ($1, $2, $3, $4, $5)",
      [source, amountUny, amountAlt, category, JSON.stringify(details)],
    );
  }

  async getRevenueTotal(since?: string): Promise<{ total_uny: string; total_alt: string; count: number }> {
    const condition = since ? "WHERE created_at >= $1" : "";
    const params = since ? [since] : [];
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(amount_uny::numeric), 0)::text AS total_uny,
              COALESCE(SUM(amount_alt::numeric), 0)::text AS total_alt,
              COUNT(*)::integer AS count
       FROM guardian_revenue ${condition}`,
      params,
    );
    return rows[0] as { total_uny: string; total_alt: string; count: number };
  }

  async recordSecurityEvent(event: {
    event_type: string;
    source_ip?: string;
    target?: string;
    severity?: string;
    action_taken?: string;
    blocked?: boolean;
    details?: Record<string, unknown>;
  }): Promise<void> {
    await pool.query(
      `INSERT INTO guardian_security_events (event_type, source_ip, target, severity, action_taken, blocked, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [event.event_type, event.source_ip, event.target, event.severity ?? "medium", event.action_taken, event.blocked ?? false, JSON.stringify(event.details ?? {})],
    );
  }

  async getPool() { return pool; }
}
