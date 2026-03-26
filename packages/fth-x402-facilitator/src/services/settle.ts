/**
 * FTH x402 Facilitator — Credit Settlement Service
 *
 * Manages prepaid credit accounts: deposits, charges, refunds.
 * This is the primary settlement path for MVP (before on-chain channels).
 */

import pool from "../db";
import type { CreditAccount, CreditTransaction } from "../types";
import { dispatchEvent } from "./webhooks";

/**
 * Get or create a credit account for a wallet address.
 */
export async function getOrCreateAccount(
  wallet_address: string,
  rail: string = "unykorn-l1",
  pubkey?: string,
): Promise<CreditAccount> {
  // Try to find existing
  const { rows } = await pool.query(
    `SELECT * FROM credit_accounts WHERE wallet_address = $1`,
    [wallet_address],
  );

  if (rows[0]) return rows[0] as CreditAccount;

  // Create new
  const { rows: created } = await pool.query(
    `INSERT INTO credit_accounts (wallet_address, rail, balance, pubkey)
     VALUES ($1, $2, 0, $3)
     ON CONFLICT (wallet_address) DO UPDATE SET updated_at = now()
     RETURNING *`,
    [wallet_address, rail, pubkey ?? null],
  );

  return created[0] as CreditAccount;
}

/**
 * Register or update a public key for Ed25519 proof verification.
 */
export async function registerPubkey(
  wallet_address: string,
  pubkey: string,
): Promise<void> {
  await pool.query(
    `UPDATE credit_accounts SET pubkey = $2, updated_at = now() WHERE wallet_address = $1`,
    [wallet_address, pubkey],
  );
}

/**
 * Deposit credit into an account.
 */
export async function deposit(
  wallet_address: string,
  amount: string,
  reference?: string,
  tx_hash?: string,
): Promise<CreditTransaction> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Update balance
    const { rows: updated } = await client.query(
      `UPDATE credit_accounts
       SET balance = balance + $2, updated_at = now()
       WHERE wallet_address = $1
       RETURNING *`,
      [wallet_address, amount],
    );

    if (!updated[0]) {
      // Account doesn't exist — create and deposit
      await client.query(
        `INSERT INTO credit_accounts (wallet_address, rail, balance)
         VALUES ($1, 'unykorn-l1', $2)`,
        [wallet_address, amount],
      );
    }

    const balance_after = updated[0]
      ? updated[0].balance
      : amount;

    // Record transaction
    const { rows: txRows } = await client.query(
      `INSERT INTO credit_transactions
         (account_id, type, amount, balance_after, reference, tx_hash)
       VALUES (
         (SELECT id FROM credit_accounts WHERE wallet_address = $1),
         'deposit', $2, $3, $4, $5
       )
       RETURNING *`,
      [wallet_address, amount, balance_after, reference, tx_hash],
    );

    await client.query("COMMIT");

    // Dispatch webhook (fire-and-forget)
    dispatchEvent(wallet_address, "credit.deposited", {
      amount,
      balance_after,
      reference: reference ?? null,
    }).catch(() => {});

    return txRows[0] as CreditTransaction;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Charge a credit account. Returns the transaction or throws if insufficient balance.
 */
export async function charge(
  wallet_address: string,
  amount: string,
  invoice_id: string,
): Promise<CreditTransaction> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check balance and deduct atomically
    const { rows: updated } = await client.query(
      `UPDATE credit_accounts
       SET balance = balance - $2, updated_at = now()
       WHERE wallet_address = $1 AND balance >= $2 AND frozen = false
       RETURNING *`,
      [wallet_address, amount],
    );

    if (!updated[0]) {
      await client.query("ROLLBACK");
      throw new InsufficientBalanceError(wallet_address, amount);
    }

    // Record transaction
    const { rows: txRows } = await client.query(
      `INSERT INTO credit_transactions
         (account_id, type, amount, balance_after, reference)
       VALUES ($1, 'charge', $2, $3, $4)
       RETURNING *`,
      [updated[0].id, amount, updated[0].balance, invoice_id],
    );

    await client.query("COMMIT");
    return txRows[0] as CreditTransaction;
  } catch (err) {
    if (err instanceof InsufficientBalanceError) throw err;
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get account balance for a wallet.
 */
export async function getBalance(wallet_address: string): Promise<string> {
  const { rows } = await pool.query(
    `SELECT balance FROM credit_accounts WHERE wallet_address = $1`,
    [wallet_address],
  );
  return rows[0]?.balance ?? "0";
}

export class InsufficientBalanceError extends Error {
  constructor(wallet: string, amount: string) {
    super(`Insufficient balance for ${wallet}: requested ${amount}`);
    this.name = "InsufficientBalanceError";
  }
}

// ---------------------------------------------------------------------------
// Trade-Finance Settlement Hooks
// ---------------------------------------------------------------------------

/**
 * Trade-finance settlement callback registry.
 * External modules register hooks that fire after settlement events.
 */
export type TradeFinanceHookType = "pre_charge" | "post_charge" | "pre_deposit" | "post_deposit" | "escrow_lock" | "escrow_release";

export interface TradeFinanceHookContext {
  wallet_address: string;
  amount: string;
  invoice_id?: string;
  reference?: string;
  tx_hash?: string;
  metadata?: Record<string, unknown>;
}

type TradeFinanceHook = (ctx: TradeFinanceHookContext) => Promise<void>;

const tradeFinanceHooks = new Map<TradeFinanceHookType, TradeFinanceHook[]>();

/**
 * Register a trade-finance settlement hook.
 */
export function registerTradeFinanceHook(type: TradeFinanceHookType, hook: TradeFinanceHook): void {
  const hooks = tradeFinanceHooks.get(type) ?? [];
  hooks.push(hook);
  tradeFinanceHooks.set(type, hooks);
}

/**
 * Execute all hooks for a given type. Failures are logged but non-fatal.
 */
async function runTradeFinanceHooks(type: TradeFinanceHookType, ctx: TradeFinanceHookContext): Promise<void> {
  const hooks = tradeFinanceHooks.get(type);
  if (!hooks || hooks.length === 0) return;

  for (const hook of hooks) {
    try {
      await hook(ctx);
    } catch (err) {
      console.error(`[trade-finance] Hook ${type} failed:`, (err as Error).message);
    }
  }
}

/**
 * Escrow lock — freeze funds for trade-finance instruments (letters of credit, bills of lading).
 * Puts funds into an escrow state until released or expired.
 */
export async function escrowLock(
  wallet_address: string,
  amount: string,
  reference: string,
  expires_at?: Date,
): Promise<CreditTransaction> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await runTradeFinanceHooks("escrow_lock", { wallet_address, amount, reference });

    // Deduct from available balance and record escrow
    const { rows: updated } = await client.query(
      `UPDATE credit_accounts
       SET balance = balance - $2, updated_at = now()
       WHERE wallet_address = $1 AND balance >= $2 AND frozen = false
       RETURNING *`,
      [wallet_address, amount],
    );

    if (!updated[0]) {
      await client.query("ROLLBACK");
      throw new InsufficientBalanceError(wallet_address, amount);
    }

    const { rows: txRows } = await client.query(
      `INSERT INTO credit_transactions
         (account_id, type, amount, balance_after, reference)
       VALUES ($1, 'escrow_lock', $2, $3, $4)
       RETURNING *`,
      [updated[0].id, amount, updated[0].balance, reference],
    );

    await client.query("COMMIT");

    dispatchEvent(wallet_address, "trade_finance.escrow_locked", {
      amount,
      reference,
      expires_at: expires_at?.toISOString() ?? null,
    }).catch(() => {});

    return txRows[0] as CreditTransaction;
  } catch (err) {
    if (err instanceof InsufficientBalanceError) throw err;
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Escrow release — release escrowed funds to the beneficiary.
 * Used when trade-finance conditions are met (BoL received, inspection passed, etc).
 */
export async function escrowRelease(
  from_wallet: string,
  to_wallet: string,
  amount: string,
  reference: string,
): Promise<CreditTransaction> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await runTradeFinanceHooks("escrow_release", {
      wallet_address: to_wallet,
      amount,
      reference,
      metadata: { from_wallet },
    });

    // Credit the beneficiary
    const { rows: updated } = await client.query(
      `UPDATE credit_accounts
       SET balance = balance + $2, updated_at = now()
       WHERE wallet_address = $1
       RETURNING *`,
      [to_wallet, amount],
    );

    if (!updated[0]) {
      // Create account and deposit
      await client.query(
        `INSERT INTO credit_accounts (wallet_address, rail, balance)
         VALUES ($1, 'unykorn-l1', $2)`,
        [to_wallet, amount],
      );
    }

    const balance_after = updated[0]?.balance ?? amount;

    const { rows: txRows } = await client.query(
      `INSERT INTO credit_transactions
         (account_id, type, amount, balance_after, reference)
       VALUES (
         (SELECT id FROM credit_accounts WHERE wallet_address = $1),
         'escrow_release', $2, $3, $4
       )
       RETURNING *`,
      [to_wallet, amount, balance_after, reference],
    );

    await client.query("COMMIT");

    dispatchEvent(to_wallet, "trade_finance.escrow_released", {
      amount,
      reference,
      from_wallet,
    }).catch(() => {});

    return txRows[0] as CreditTransaction;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
