/**
 * FTH x402 Facilitator — Channel Routes
 *
 * POST /channels/open    — open a payment channel
 * POST /channels/:id/close — close a channel
 * GET  /channels/:id     — get channel state
 */

import type { FastifyInstance } from "fastify";
import { openChannel, closeChannel, getChannel } from "../services/channels";

export default async function channelRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Body: {
      wallet_address: string;
      deposited_amount: string;
      opened_tx_hash?: string;
      namespace?: string;
    };
  }>("/channels/open", async (req, reply) => {
    const { wallet_address, deposited_amount, opened_tx_hash, namespace } = req.body;

    if (!wallet_address || !deposited_amount) {
      return reply.status(400).send({ error: "Missing wallet_address or deposited_amount" });
    }

    const channel = await openChannel(wallet_address, deposited_amount, opened_tx_hash, namespace);
    return reply.status(201).send(channel);
  });

  app.post<{ Params: { id: string }; Body: { closed_tx_hash?: string } }>(
    "/channels/:id/close",
    async (req, reply) => {
      try {
        const channel = await closeChannel(req.params.id, req.body.closed_tx_hash);
        return reply.send(channel);
      } catch (err: any) {
        return reply.status(404).send({ error: err.message });
      }
    },
  );

  app.get<{ Params: { id: string } }>("/channels/:id", async (req, reply) => {
    const channel = await getChannel(req.params.id);
    if (!channel) {
      return reply.status(404).send({ error: "Channel not found" });
    }
    return reply.send(channel);
  });
}
