/**
 * FTH x402 Pricing — Route Price Catalog
 *
 * Defines prices per route/namespace. The facilitator uses this to
 * create invoices with the correct amount. The gateway uses this as
 * the source of truth for 402 responses.
 *
 * Phase 1: static catalog. Phase 2: DB-backed with admin console.
 */

export interface RoutePrice {
  namespace: string;
  path_pattern: string;
  asset: "UNY";
  amount: string;
  description: string;
  version: string; // bumped when price changes
}

/**
 * Route price catalog — static for MVP.
 */
export const ROUTE_PRICES: RoutePrice[] = [
  {
    namespace: "fth.x402.route.genesis-repro",
    path_pattern: "/api/v1/genesis/repro-pack/:suite",
    asset: "UNY",
    amount: "0.50",
    description: "Genesis reproducibility pack (per suite download)",
    version: "1.0.0",
  },
  {
    namespace: "fth.x402.route.trade-verify",
    path_pattern: "/api/v1/trade/verify/:trade_id",
    asset: "UNY",
    amount: "0.25",
    description: "Trade verification report",
    version: "1.0.0",
  },
  {
    namespace: "fth.x402.route.invoice-export",
    path_pattern: "/api/v1/invoices/export/:format",
    asset: "UNY",
    amount: "1.00",
    description: "Invoice export (PDF/CSV)",
    version: "1.0.0",
  },
];

/**
 * Look up the price for a namespace.
 */
export function getRoutePrice(namespace: string): RoutePrice | null {
  return ROUTE_PRICES.find((r) => r.namespace === namespace) ?? null;
}

/**
 * Get all route prices.
 */
export function getAllPrices(): RoutePrice[] {
  return [...ROUTE_PRICES];
}
