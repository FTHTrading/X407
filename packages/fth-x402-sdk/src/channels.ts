/**
 * FTH x402 SDK — Channel Spend Helper
 *
 * Manages local channel state and signing for channel_spend proofs.
 */

import { signChannelSpend } from "./wallet";

export interface ChannelState {
  channel_id: string;
  sequence: number;
  available: number;
}

/**
 * Create a channel spend proof and increment local sequence.
 */
export function createChannelSpendProof(
  channel: ChannelState,
  invoiceId: string,
  nonce: string,
  payer: string,
  secretKey: Uint8Array,
): {
  proof: Record<string, unknown>;
  newSequence: number;
} {
  const nextSeq = channel.sequence + 1;
  const signature = signChannelSpend(channel.channel_id, nextSeq, invoiceId, secretKey);

  return {
    proof: {
      proof_type: "channel_spend",
      channel_id: channel.channel_id,
      sequence: nextSeq,
      payer,
      signature,
      invoice_id: invoiceId,
      nonce,
    },
    newSequence: nextSeq,
  };
}
