#!/usr/bin/env node
/**
 * x402-db-setup.mjs
 *
 * Creates the fth_x402 database (if it doesn't exist) and runs all
 * migrations in order. Idempotent — safe to re-run.
 *
 * Usage: node scripts/x402-db-setup.mjs
 *
 * Env vars:
 *   PGHOST, PGPORT, PGUSER, PGPASSWORD — standard Postgres vars
 *   FTH_X402_DB — database name (default: fth_x402)
 */

import { readdirSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, "..", "db", "migrations-x402");
const dbName = process.env.FTH_X402_DB || "fth_x402";

async function ensureDatabase() {
  // Connect to default 'postgres' database to create target DB
  const adminPool = new pg.Pool({
    database: "postgres",
    max: 1,
  });

  try {
    const { rows } = await adminPool.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName],
    );
    if (rows.length === 0) {
      await adminPool.query(`CREATE DATABASE ${dbName}`);
      console.log(`✓ Created database '${dbName}'`);
    } else {
      console.log(`✓ Database '${dbName}' already exists`);
    }
  } finally {
    await adminPool.end();
  }
}

async function runMigrations() {
  const pool = new pg.Pool({
    database: dbName,
    max: 1,
  });

  try {
    // Ensure a migrations tracking table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _x402_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const { rows: applied } = await pool.query(
      `SELECT filename FROM _x402_migrations`,
    );
    const appliedSet = new Set(applied.map((r) => r.filename));

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`  — ${file} (already applied)`);
        continue;
      }
      const sql = readFileSync(resolve(migrationsDir, file), "utf-8");
      await pool.query(sql);
      await pool.query(
        `INSERT INTO _x402_migrations (filename) VALUES ($1)`,
        [file],
      );
      console.log(`  ✓ ${file}`);
    }

    console.log("All migrations applied.");
  } finally {
    await pool.end();
  }
}

async function main() {
  console.log("=== FTH x402 Database Setup ===\n");

  await ensureDatabase();
  console.log("\nRunning migrations...");
  await runMigrations();

  console.log("\n✓ Database ready. Run 'npm run x402:db:seed' to load namespaces.");
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
