/**
 * FTH x402 Facilitator — Webhook Routes
 *
 * POST   /webhooks                     — create subscription
 * GET    /webhooks?wallet=<addr>       — list subscriptions
 * GET    /webhooks/:id                 — get subscription
 * PATCH  /webhooks/:id                 — update subscription
 * DELETE /webhooks/:id                 — delete subscription
 * GET    /webhooks/:id/deliveries      — delivery history
 * POST   /webhooks/:id/test            — send test event
 */

import type { FastifyInstance } from "fastify";
import {
  createSubscription,
  listSubscriptions,
  getSubscription,
  updateSubscription,
  deleteSubscription,
  getDeliveries,
  dispatchEvent,
  ALL_EVENTS,
  type WebhookEvent,
} from "../services/webhooks";

export default async function webhookRoutes(app: FastifyInstance): Promise<void> {
  // Create subscription
  app.post<{
    Body: { wallet_address: string; url: string; events?: WebhookEvent[] };
  }>("/webhooks", async (req, reply) => {
    const { wallet_address, url, events } = req.body;

    if (!wallet_address || !url) {
      return reply.status(400).send({ error: "Missing wallet_address or url" });
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return reply.status(400).send({ error: "Invalid webhook URL" });
    }

    // Validate events if provided
    if (events) {
      const invalid = events.filter((e) => !ALL_EVENTS.includes(e));
      if (invalid.length > 0) {
        return reply
          .status(400)
          .send({ error: `Invalid events: ${invalid.join(", ")}`, valid_events: ALL_EVENTS });
      }
    }

    const sub = await createSubscription(wallet_address, url, events);
    return reply.status(201).send({
      id: sub.id,
      wallet_address: sub.wallet_address,
      url: sub.url,
      secret: sub.secret, // Only shown once at creation
      events: sub.events,
      active: sub.active,
      created_at: sub.created_at,
    });
  });

  // List subscriptions for a wallet
  app.get<{
    Querystring: { wallet: string };
  }>("/webhooks", async (req, reply) => {
    const wallet = req.query.wallet;
    if (!wallet) {
      return reply.status(400).send({ error: "Missing ?wallet= query parameter" });
    }

    const subs = await listSubscriptions(wallet);
    return reply.send({
      subscriptions: subs.map((s) => ({
        id: s.id,
        url: s.url,
        events: s.events,
        active: s.active,
        created_at: s.created_at,
      })),
      total: subs.length,
    });
  });

  // Get subscription
  app.get<{ Params: { id: string } }>("/webhooks/:id", async (req, reply) => {
    const sub = await getSubscription(req.params.id);
    if (!sub) {
      return reply.status(404).send({ error: "Subscription not found" });
    }
    return reply.send({
      id: sub.id,
      wallet_address: sub.wallet_address,
      url: sub.url,
      events: sub.events,
      active: sub.active,
      created_at: sub.created_at,
      updated_at: sub.updated_at,
    });
  });

  // Update subscription
  app.patch<{
    Params: { id: string };
    Body: { url?: string; events?: WebhookEvent[]; active?: boolean };
  }>("/webhooks/:id", async (req, reply) => {
    const sub = await getSubscription(req.params.id);
    if (!sub) {
      return reply.status(404).send({ error: "Subscription not found" });
    }

    if (req.body.events) {
      const invalid = req.body.events.filter((e) => !ALL_EVENTS.includes(e));
      if (invalid.length > 0) {
        return reply
          .status(400)
          .send({ error: `Invalid events: ${invalid.join(", ")}`, valid_events: ALL_EVENTS });
      }
    }

    const updated = await updateSubscription(req.params.id, req.body);
    return reply.send(updated);
  });

  // Delete subscription
  app.delete<{ Params: { id: string } }>("/webhooks/:id", async (req, reply) => {
    const deleted = await deleteSubscription(req.params.id);
    if (!deleted) {
      return reply.status(404).send({ error: "Subscription not found" });
    }
    return reply.send({ deleted: true });
  });

  // Delivery history
  app.get<{
    Params: { id: string };
    Querystring: { limit?: string };
  }>("/webhooks/:id/deliveries", async (req, reply) => {
    const sub = await getSubscription(req.params.id);
    if (!sub) {
      return reply.status(404).send({ error: "Subscription not found" });
    }

    const limit = Math.min(Number(req.query.limit ?? 20), 100);
    const deliveries = await getDeliveries(req.params.id, limit);
    return reply.send({ deliveries, total: deliveries.length });
  });

  // Send test event
  app.post<{ Params: { id: string } }>("/webhooks/:id/test", async (req, reply) => {
    const sub = await getSubscription(req.params.id);
    if (!sub) {
      return reply.status(404).send({ error: "Subscription not found" });
    }

    const dispatched = await dispatchEvent(sub.wallet_address, "payment.received", {
      test: true,
      receipt_id: "rcpt_TEST_000000",
      amount: "0.00",
      asset: "UNY",
      message: "This is a test webhook delivery",
    });

    return reply.send({ dispatched, message: "Test event queued" });
  });
}
