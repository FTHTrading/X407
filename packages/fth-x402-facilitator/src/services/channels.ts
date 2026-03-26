/**
 * FTH x402 Facilitator — Payment Channel Service
 *
 * Manages prepaid payment channels on UnyKorn L1.
 * Channels allow microcharges without per-request chain writes.
 *
 * Flow:
 *   1. Client opens channel with deposit (on-chain tx)
 *   2. Each request spends from channel (offchain, monotonic sequence)
 *   3. Channel closes when exhausted or timeout (on-chain settlement)
 */

import pool from "../db";
import { nanoid } from "nanoid";
import type { PaymentChannel } from "../types";
import { dispatchEvent } from "./webhooks";

/**
 * Open a new payment channel.
 */
export async function openChannel(
  wallet_address: string,
  deposited_amount: string,
  opened_tx_hash?: string,
  namespace?: string,
): Promise<PaymentChannel> {
  const channel_id = `chan_${nanoid(12)}`;

  const { rows } = await pool.query(
    `INSERT INTO payment_channels
       (channel_id, wallet_address, namespace, rail, asset, deposited_amount,
        available_amount, spent_amount, sequence, status, opened_tx_hash)
     VALUES ($1, $2, $3, 'unykorn-l1', 'UNY', $4, $4, 0, 0, 'open', $5)
     RETURNING *`,
    [channel_id, wallet_address, namespace ?? null, deposited_amount, opened_tx_hash ?? null],
  );

  const channel = rows[0] as PaymentChannel;

  // Dispatch webhook (fire-and-forget)
  dispatchEvent(wallet_address, "channel.opened", {
    channel_id,
    deposited_amount,
    namespace: namespace ?? null,
  }).catch(() => {});

  return channel;
}

/**
 * Spend from a channel. Validates:
 *   - Channel exists and is open
 *   - Sequence is strictly monotonic (> current)
 *   - Sufficient available balance
 *
 * Returns updated channel state.
 */
export async function spendChannel(
  channel_id: string,
  sequence: number,
  amount: string,
  reference: string,
): Promise<PaymentChannel> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the channel row
    const { rows } = await client.query(
      `SELECT * FROM payment_channels WHERE channel_id = $1 FOR UPDATE`,
      [channel_id],
    );

    const channel = rows[0] as PaymentChannel | undefined;
    if (!channel) {
      throw new ChannelError(`Channel not found: ${channel_id}`);
    }
    if (channel.status !== "open") {
      throw new ChannelError(`Channel not open: ${channel_id} (status: ${channel.status})`);
    }

    // Monotonic sequence check
    if (sequence <= channel.sequence) {
      throw new ChannelError(
        `Sequence not monotonic: got ${sequence}, expected > ${channel.sequence}`,
      );
    }

    // Balance check
    const available = parseFloat(channel.available_amount);
    const charge = parseFloat(amount);
    if (charge > available) {
      throw new ChannelError(
        `Insufficient channel balance: ${available} available, ${charge} requested`,
      );
    }

    // Update channel
    const { rows: updated } = await client.query(
      `UPDATE payment_channels
       SET sequence = $2,
           spent_amount = spent_amount + $3,
           available_amount = available_amount - $3,
           updated_at = now()
       WHERE channel_id = $1
       RETURNING *`,
      [channel_id, sequence, amount],
    );

    await client.query("COMMIT");
    return updated[0] as PaymentChannel;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Close a channel (triggered by timeout or explicit close).
 */
export async function closeChannel(
  channel_id: string,
  closed_tx_hash?: string,
): Promise<PaymentChannel> {
  const { rows } = await pool.query(
    `UPDATE payment_channels
     SET status = 'closed', closed_tx_hash = $2, updated_at = now()
     WHERE channel_id = $1 AND status = 'open'
     RETURNING *`,
    [channel_id, closed_tx_hash ?? null],
  );

  if (!rows[0]) {
    throw new ChannelError(`Channel not found or not open: ${channel_id}`);
  }

  const channel = rows[0] as PaymentChannel;

  // Dispatch webhook (fire-and-forget)
  dispatchEvent(channel.wallet_address, "channel.closed", {
    channel_id,
    spent_amount: channel.spent_amount,
    available_amount: channel.available_amount,
  }).catch(() => {});

  return channel;
}

/**
 * Get channel by ID.
 */
export async function getChannel(channel_id: string): Promise<PaymentChannel | null> {
  const { rows } = await pool.query(
    `SELECT * FROM payment_channels WHERE channel_id = $1`,
    [channel_id],
  );
  return (rows[0] as PaymentChannel) ?? null;
}

export class ChannelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChannelError";
  }
}
