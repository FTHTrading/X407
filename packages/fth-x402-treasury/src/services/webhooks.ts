import { createHmac, randomBytes } from "crypto";
import pool from "../db";

export type TreasuryWebhookEvent =
  | "treasury.refill.completed"
  | "treasury.refill.blocked"
  | "treasury.refill.failed";

function genId(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString("base64url")}`;
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export async function dispatchTreasuryEvent(
  walletAddress: string,
  eventType: TreasuryWebhookEvent,
  payload: Record<string, unknown>,
): Promise<number> {
  const { rows: subscriptions } = await pool.query<{ id: string; url: string; secret: string }>(
    `SELECT id, url, secret
     FROM webhook_subscriptions
     WHERE wallet_address = $1
       AND active = TRUE
       AND $2 = ANY(events)`,
    [walletAddress, eventType],
  );

  if (subscriptions.length === 0) {
    return 0;
  }

  let dispatched = 0;
  for (const subscription of subscriptions) {
    const deliveryId = genId("dlv");

    await pool.query(
      `INSERT INTO webhook_deliveries (id, subscription_id, event_type, payload)
       VALUES ($1, $2, $3, $4)`,
      [deliveryId, subscription.id, eventType, JSON.stringify(payload)],
    );

    deliverWebhook(deliveryId, subscription.url, subscription.secret, eventType, payload).catch(() => {
      // Delivery errors are recorded in the webhook_deliveries table.
    });

    dispatched++;
  }

  return dispatched;
}

async function deliverWebhook(
  deliveryId: string,
  url: string,
  secret: string,
  eventType: TreasuryWebhookEvent,
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
         SET status = $1,
             attempts = $2,
             last_attempt_at = NOW(),
             response_code = $3,
             response_body = $4
         WHERE id = $5`,
        [
          res.ok ? "delivered" : (attempt >= maxAttempts ? "failed" : "pending"),
          attempt,
          res.status,
          responseBody.slice(0, 1000),
          deliveryId,
        ],
      );

      if (res.ok) {
        return;
      }

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await pool.query(
        `UPDATE webhook_deliveries
         SET status = $1,
             attempts = $2,
             last_attempt_at = NOW(),
             response_body = $3
         WHERE id = $4`,
        [attempt >= maxAttempts ? "failed" : "pending", attempt, message.slice(0, 1000), deliveryId],
      );

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
      }
    }
  }
}