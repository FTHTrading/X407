/**
 * FTH Metering — Public API
 *
 * Re-exports types, client, and event factories.
 * Import from "fth-metering" in gateway, facilitator, or any service.
 */

// Types
export type {
  MeterEventType,
  MeterEventBase,
  ApiRequestEvent,
  AiTokensEvent,
  ComputeSecondsEvent,
  MeterEvent,
  QuotaStatus,
  MeteringConfig,
} from "./types";

// Client
export { MeteringClient } from "./client";

// Event factories
export {
  apiRequestEvent,
  aiTokensEvent,
  computeSecondsEvent,
} from "./events";
