/**
 * FTH x402 SDK — Client
 *
 * High-level client wrapping the 402 interceptor.
 *
 * Usage:
 *   import { FTHClient } from "fth-x402-sdk";
 *
 *   const client = new FTHClient({
 *     wallet: {
 *       address: "uny1_abc...",
 *       rail: "unykorn-l1",
 *       credit_id: "cred_xyz",
 *       secretKey: mySecretKeyBytes,
 *     },
 *   });
 *
 *   const res = await client.fetch("https://api.fth.trading/v1/genesis/repro-pack/alpha");
 *   // Automatically handles 402 → pay → retry
 */

import type { FTHClientConfig } from "./types";
import { X402Interceptor } from "./x402";

export class FTHClient {
  private interceptor: X402Interceptor;

  constructor(config: FTHClientConfig) {
    this.interceptor = new X402Interceptor({
      autoRetry: true,
      maxRetries: 1,
      ...config,
    });
  }

  /**
   * Fetch a resource with automatic 402 payment handling.
   */
  async fetch(url: string, init?: RequestInit): Promise<Response> {
    return this.interceptor.fetch(url, init);
  }

  /**
   * Parse the payment receipt from a successful paid response.
   */
  static parseReceipt(response: Response) {
    return X402Interceptor.parsePaymentResponse(response);
  }
}
