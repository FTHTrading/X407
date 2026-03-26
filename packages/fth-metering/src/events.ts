/**
 * FTH Metering — Convenience Factories
 *
 * Pre-built event constructors so callers don't hand-craft event objects.
 */

import type { ApiRequestEvent, AiTokensEvent, ComputeSecondsEvent } from "./types";

/**
 * Create an api_request meter event.
 */
export function apiRequestEvent(opts: {
  subject: string;
  route: string;
  namespace: string;
  method: string;
  status_code: number;
  amount: string;
  proof_type: string;
  latency_ms: number;
}): ApiRequestEvent {
  return {
    type: "api_request",
    timestamp: new Date().toISOString(),
    subject: opts.subject,
    data: {
      route: opts.route,
      namespace: opts.namespace,
      method: opts.method,
      status_code: opts.status_code,
      amount: opts.amount,
      proof_type: opts.proof_type,
      latency_ms: opts.latency_ms,
    },
  };
}

/**
 * Create an ai_tokens meter event.
 */
export function aiTokensEvent(opts: {
  subject: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost: string;
  namespace: string;
}): AiTokensEvent {
  return {
    type: "ai_tokens",
    timestamp: new Date().toISOString(),
    subject: opts.subject,
    data: {
      model: opts.model,
      prompt_tokens: opts.prompt_tokens,
      completion_tokens: opts.completion_tokens,
      total_tokens: opts.prompt_tokens + opts.completion_tokens,
      cost: opts.cost,
      namespace: opts.namespace,
    },
  };
}

/**
 * Create a compute_seconds meter event.
 */
export function computeSecondsEvent(opts: {
  subject: string;
  task_type: string;
  seconds: number;
  cost: string;
  namespace: string;
}): ComputeSecondsEvent {
  return {
    type: "compute_seconds",
    timestamp: new Date().toISOString(),
    subject: opts.subject,
    data: {
      task_type: opts.task_type,
      seconds: opts.seconds,
      cost: opts.cost,
      namespace: opts.namespace,
    },
  };
}
