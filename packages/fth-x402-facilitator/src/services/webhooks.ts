/**
 * FTH x402 Facilitator — Webhook Service
 *
 * Manages webhook subscriptions and delivers event notifications.
 * Events are signed with HMAC-SHA256 so merchants can verify authenticity.
 *
 * Supported events:
 *   - payment.received   — a payment was verified and settled
 *   - payment.batched    — a receipt was included in a merkle batch
 *   - channel.opened     — a payment channel was created
 *   - channel.closed     — a payment channel was closed
 *   - credit.deposited   — credit was added to account
 *   - anchor.confirmed   — a batch was anchored on-chain
 *   - treasury.refill.completed — treasury successfully funded an agent
 *   - treasury.refill.blocked   — treasury refill was blocked by policy/halts
 *   - treasury.refill.failed    — treasury refill attempt failed
 */

import { createHmac, randomBytes } from "crypto";
import pool from "../db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WebhookEvent =
  | "payment.received"
  | "payment.batched"
  | "channel.opened"
  | "channel.closed"
  | "credit.deposited"
  | "anchor.confirmed"
  | "treasury.refill.completed"
  | "treasury.refill.blocked"
  | "treasury.refill.failed"
  | "trade_finance.escrow_locked"
  | "trade_finance.escrow_released";

export const ALL_EVENTS: WebhookEvent[] = [
  "payment.received",
  "payment.batched",
  "channel.opened",
  "channel.closed",
  "credit.deposited",
  "anchor.confirmed",
  "treasury.refill.completed",
  "treasury.refill.blocked",
  "treasury.refill.failed",
  "trade_finance.escrow_locked",
  "trade_finance.escrow_released",
];

export interface WebhookSubscription {
  id: string;
  wallet_address: string;
  url: string;
  secret: string;
  events: WebhookEvent[];
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface WebhookDelivery {
  id: string;
  subscription_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  last_attempt_at: Date | null;
  response_code: number | null;
  response_body: string | null;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function genId(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString("base64url")}`;
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

// ---------------------------------------------------------------------------
// Subscription CRUD
// ---------------------------------------------------------------------------

export async function createSubscription(
  walletAddress: string,
  url: string,
  events?: WebhookEvent[],
): Promise<WebhookSubscription> {
  const id = genId("whk");
  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  const eventList = events ?? ["payment.received", "channel.closed"];

  const { rows } = await pool.query(
    `INSERT INTO webhook_subscriptions (id, wallet_address, url, secret, events)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [id, walletAddress, url, secret, eventList],
  );
  return rows[0];
}

export async function listSubscriptions(walletAddress: string): Promise<WebhookSubscription[]> {
  const { rows } = await pool.query(
    "SELECT * FROM webhook_subscriptions WHERE wallet_address = $1 ORDER BY created_at DESC",
    [walletAddress],
  );
  return rows;
}

export async function getSubscription(id: string): Promise<WebhookSubscription | null> {
  const { rows } = await pool.query(
    "SELECT * FROM webhook_subscriptions WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

export async function updateSubscription(
  id: string,
  updates: { url?: string; events?: WebhookEvent[]; active?: boolean },
): Promise<WebhookSubscription | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;

  if (updates.url !== undefined) {
    sets.push(`url = $${idx++}`);
    vals.push(updates.url);
  }
  if (updates.events !== undefined) {
    sets.push(`events = $${idx++}`);
    vals.push(updates.events);
  }
  if (updates.active !== undefined) {
    sets.push(`active = $${idx++}`);
    vals.push(updates.active);
  }
  if (sets.length === 0) return getSubscription(id);

  sets.push(`updated_at = NOW()`);
  vals.push(id);

  const { rows } = await pool.query(
    `UPDATE webhook_subscriptions SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
    vals,
  );
  return rows[0] ?? null;
}

export async function deleteSubscription(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    "DELETE FROM webhook_subscriptions WHERE id = $1",
    [id],
  );
  return (rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

/** Queue an event for all matching subscriptions */
export async function dispatchEvent(
  walletAddress: string,
  eventType: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<number> {
  // Find active subscriptions listening for this event
  const { rows: subs } = await pool.query<{ id: string; url: string; secret: string }>(
    `SELECT id, url, secret FROM webhook_subscriptions
     WHERE wallet_address = $1 AND active = TRUE AND $2 = ANY(events)`,
    [walletAddress, eventType],
  );

  if (subs.length === 0) return 0;

  let dispatched = 0;
  for (const sub of subs) {
    const deliveryId = genId("dlv");
    await pool.query(
      `INSERT INTO webhook_deliveries (id, subscription_id, event_type, payload)
       VALUES ($1, $2, $3, $4)`,
      [deliveryId, sub.id, eventType, JSON.stringify(payload)],
    );

    // Fire-and-forget delivery (non-blocking)
    deliverWebhook(deliveryId, sub.url, sub.secret, eventType, payload).catch(() => {
      /* logged inside deliverWebhook */
    });
    dispatched++;
  }

  return dispatched;
}

/** Attempt delivery with retry */
async function deliverWebhook(
  deliveryId: string,
  url: string,
  secret: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const body = JSON.stringify({
    event: eventType,
    timestamp: new Date().toISOString(),
    data: payload,
  });

  const signature = signPayload(body, secret);

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-FTH-Signature": `sha256=${signature}`,
          "X-FTH-Event": eventType,
          "X-FTH-Delivery": deliveryId,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const responseBody = await res.text().catch(() => "");

      await pool.query(
        `UPDATE webhook_deliveries
         SET status = $1, attempts = $2, last_attempt_at = NOW(),
             response_code = $3, response_body = $4
         WHERE id = $5`,
        [
          res.ok ? "delivered" : (attempt >= maxAttempts ? "failed" : "pending"),
          attempt,
          res.status,
          responseBody.slice(0, 1000),
          deliveryId,
        ],
      );

      if (res.ok) return;

      // Wait before retry (exponential backoff)
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    } catch (err: any) {
      await pool.query(
        `UPDATE webhook_deliveries
         SET status = $1, attempts = $2, last_attempt_at = NOW(),
             response_body = $3
         WHERE id = $4`,
        [
          attempt >= maxAttempts ? "failed" : "pending",
          attempt,
          (err.message ?? "unknown error").slice(0, 1000),
          deliveryId,
        ],
      );

      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }
  }
}

/** Retry failed deliveries (called periodically) */
export async function retryFailedDeliveries(): Promise<number> {
  const { rows } = await pool.query<{
    id: string;
    subscription_id: string;
    event_type: string;
    payload: Record<string, unknown>;
  }>(
    `SELECT d.id, d.subscription_id, d.event_type, d.payload
     FROM webhook_deliveries d
     JOIN webhook_subscriptions s ON s.id = d.subscription_id
     WHERE d.status = 'failed'
       AND d.attempts < 5
       AND s.active = TRUE
       AND d.created_at > NOW() - INTERVAL '24 hours'
     ORDER BY d.created_at ASC
     LIMIT 20`,
  );

  if (rows.length === 0) return 0;

  let retried = 0;
  for (const delivery of rows) {
    const { rows: subs } = await pool.query<{ url: string; secret: string }>(
      "SELECT url, secret FROM webhook_subscriptions WHERE id = $1",
      [delivery.subscription_id],
    );
    if (subs.length === 0) continue;

    deliverWebhook(
      delivery.id,
      subs[0].url,
      subs[0].secret,
      delivery.event_type,
      delivery.payload,
    ).catch(() => {});
    retried++;
  }

  return retried;
}

/** Get delivery history for a subscription */
export async function getDeliveries(
  subscriptionId: string,
  limit = 20,
): Promise<WebhookDelivery[]> {
  const { rows } = await pool.query(
    `SELECT * FROM webhook_deliveries
     WHERE subscription_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [subscriptionId, limit],
  );
  return rows;
}

/** Cleanup old deliveries (> 7 days) */
export async function cleanupDeliveries(): Promise<number> {
  const { rowCount } = await pool.query(
    "DELETE FROM webhook_deliveries WHERE created_at < NOW() - INTERVAL '7 days'",
  );
  return rowCount ?? 0;
}
