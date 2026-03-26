/**
 * FTH x402 Facilitator — PostgreSQL Connection
 *
 * Single pool instance shared across services.
 * Connection params from env vars (or defaults for local dev).
 */

import { Pool } from "pg";

const pool = new Pool({
  host: process.env.PGHOST ?? "localhost",
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE ?? "fth_x402",
  user: process.env.PGUSER ?? "fth",
  password: process.env.PGPASSWORD ?? "fth_dev",
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export default pool;
