/**
 * FTH x402 SDK — 402 Interceptor
 *
 * Automatic payment handler for HTTP 402 responses. When a fetch returns 402,
 * the interceptor:
 *   1. Parses the X-PAYMENT-REQUIRED header
 *   2. Builds a payment proof (prepaid_credit or channel_spend)
 *   3. Retries the request with X-PAYMENT-SIGNATURE header
 *
 * Usage:
 *   const client = new FTHClient({ wallet: { ... } });
 *   const response = await client.fetch("https://api.fth.trading/v1/resource");
 */

import type {
  FTHClientConfig,
  PaymentRequirement,
  PaymentResponse,
  WalletConfig,
} from "./types";
import { signCreditProof } from "./wallet";
import { createChannelSpendProof, type ChannelState } from "./channels";

export class X402Interceptor {
  private config: FTHClientConfig;
  private channelState: ChannelState | null;

  constructor(config: FTHClientConfig) {
    this.config = config;
    this.channelState = config.wallet.channel_id
      ? {
          channel_id: config.wallet.channel_id,
          sequence: config.wallet.channel_sequence ?? 0,
          available: Infinity, // Will be updated from server
        }
      : null;
  }

  /**
   * Fetch with automatic 402 payment handling.
   */
  async fetch(
    url: string,
    init?: RequestInit,
  ): Promise<Response> {
    // First request
    const response = await fetch(url, init);

    // Not 402 or auto-retry disabled → return as-is
    if (response.status !== 402 || this.config.autoRetry === false) {
      return response;
    }

    // Parse 402 payment requirement
    const requirement = await this.parseRequirement(response);
    if (!requirement) {
      return response; // Can't parse — return original 402
    }

    // Build proof
    const proof = this.buildProof(requirement);
    if (!proof) {
      return response; // Can't build proof — return original 402
    }

    // Retry with proof
    const encoded = btoa(JSON.stringify(proof));
    const retryInit: RequestInit = {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        "X-PAYMENT-SIGNATURE": encoded,
      },
    };

    return fetch(url, retryInit);
  }

  /**
   * Parse X-PAYMENT-REQUIRED from 402 response.
   */
  private async parseRequirement(
    response: Response,
  ): Promise<PaymentRequirement | null> {
    // Try header first
    const header = response.headers.get("X-PAYMENT-REQUIRED");
    if (header) {
      try {
        return JSON.parse(atob(header)) as PaymentRequirement;
      } catch {
        // Fall through to body
      }
    }

    // Try body
    try {
      const body = await response.clone().json() as Record<string, unknown>;
      if (body.version === "fth-x402/2.0") {
        return body as unknown as PaymentRequirement;
      }
    } catch {
      // Neither header nor body parseable
    }

    return null;
  }

  /**
   * Build a payment proof based on wallet config and accepted proof types.
   */
  private buildProof(
    requirement: PaymentRequirement,
  ): Record<string, unknown> | null {
    const wallet = this.config.wallet;
    const preferred = this.config.preferredProof ?? "prepaid_credit";
    const accepted = requirement.payment.accepted_proofs;

    // Try preferred proof first, then fallback
    if (preferred === "channel_spend" && accepted.includes("channel_spend") && this.channelState && wallet.secretKey) {
      const { proof, newSequence } = createChannelSpendProof(
        this.channelState,
        requirement.payment.invoice_id,
        requirement.payment.nonce,
        wallet.address,
        wallet.secretKey,
      );
      this.channelState.sequence = newSequence;
      return proof;
    }

    if (accepted.includes("prepaid_credit") && wallet.credit_id) {
      const signature = wallet.secretKey
        ? signCreditProof(
            requirement.payment.invoice_id,
            requirement.payment.nonce,
            wallet.secretKey,
          )
        : "unsigned";

      return {
        proof_type: "prepaid_credit",
        credit_id: wallet.credit_id,
        payer: wallet.address,
        signature,
        invoice_id: requirement.payment.invoice_id,
        nonce: requirement.payment.nonce,
      };
    }

    // No viable proof available
    return null;
  }

  /**
   * Parse X-PAYMENT-RESPONSE from successful response.
   */
  static parsePaymentResponse(response: Response): PaymentResponse | null {
    const header = response.headers.get("X-PAYMENT-RESPONSE");
    if (!header) return null;
    try {
      return JSON.parse(atob(header)) as PaymentResponse;
    } catch {
      return null;
    }
  }
}
