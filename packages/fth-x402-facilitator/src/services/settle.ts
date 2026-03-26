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
