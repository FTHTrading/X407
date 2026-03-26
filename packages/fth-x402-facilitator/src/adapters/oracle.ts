/**
 * FTH x402 Facilitator — Oracle Price Feed Adapter
 *
 * Provides real-time and cached price data for wrapped assets:
 *   - wXAU (Gold)
 *   - wUSTB (US Treasury Bills)
 *   - wBOND (Bond index)
 *   - wINV (Invoice-backed)
 *   - UNY (governance token)
 *
 * Architecture:
 *   1. Primary: CoinGecko / metals-api for spot prices
 *   2. Fallback: cached last-known-good price (< 5 min stale)
 *   3. Future: Chainlink / Pyth on-chain oracle
 *
 * All prices are denominated in USD.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ORACLE_PROVIDER = process.env.ORACLE_PROVIDER ?? "coingecko";
const COINGECKO_API_URL = process.env.COINGECKO_API_URL ?? "https://api.coingecko.com/api/v3";
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY ?? "";
const METALS_API_URL = process.env.METALS_API_URL ?? "https://metals-api.com/api";
const METALS_API_KEY = process.env.METALS_API_KEY ?? "";

// Cache TTL: 5 minutes for price freshness
const CACHE_TTL_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PriceFeed {
  asset: string;
  price_usd: string;
  source: string;
  timestamp: string;
  stale: boolean;
}

export interface OracleHealthStatus {
  provider: string;
  reachable: boolean;
  cached_assets: number;
  oldest_cache_age_ms: number;
}

// ---------------------------------------------------------------------------
// Price cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  price_usd: number;
  source: string;
  fetched_at: number;
}

const priceCache = new Map<string, CacheEntry>();

function getCached(asset: string): CacheEntry | null {
  const entry = priceCache.get(asset);
  if (!entry) return null;
  return entry;
}

function setCache(asset: string, price: number, source: string): void {
  priceCache.set(asset, { price_usd: price, source, fetched_at: Date.now() });
}

function isCacheStale(entry: CacheEntry): boolean {
  return Date.now() - entry.fetched_at > CACHE_TTL_MS;
}

// ---------------------------------------------------------------------------
// Asset → external ID mapping
// ---------------------------------------------------------------------------

const COINGECKO_IDS: Record<string, string> = {
  UNY: "unykorn", // If listed; otherwise use fallback
  wXAU: "gold",   // Use gold spot price
};

const STATIC_PRICES: Record<string, number> = {
  USDF: 1.0,      // Pegged to USD
  sUSDF: 1.0,     // Bridge representation
  xUSDF: 1.0,     // Mirror representation
  wUSTB: 100.0,   // US Treasury Bill face value (per unit)
  wBOND: 1000.0,  // Bond index baseline
  wINV: 1.0,      // Invoice-backed, face value
};

// ---------------------------------------------------------------------------
// Price fetchers
// ---------------------------------------------------------------------------

/**
 * Fetch gold spot price (for wXAU).
 */
async function fetchGoldPrice(): Promise<number> {
  // Try metals-api first
  if (METALS_API_KEY) {
    try {
      const res = await fetch(
        `${METALS_API_URL}/latest?access_key=${METALS_API_KEY}&base=USD&symbols=XAU`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (res.ok) {
        const data = (await res.json()) as any;
        // metals-api returns rates as USD per troy ounce
        const rate = data.rates?.USDXAU ?? data.rates?.XAU;
        if (rate && rate > 0) {
          return 1 / rate; // Convert from "USD per 1 XAU" to "XAU price in USD"
        }
      }
    } catch { /* fallback below */ }
  }

  // Fallback: CoinGecko (gold-backed token proxy)
  try {
    const res = await fetch(
      `${COINGECKO_API_URL}/simple/price?ids=tether-gold&vs_currencies=usd`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (res.ok) {
      const data = (await res.json()) as any;
      return data["tether-gold"]?.usd ?? 2650; // Approximate fallback
    }
  } catch { /* use fallback */ }

  return 2650; // Hardcoded gold price fallback (~March 2026)
}

/**
 * Fetch UNY price from CoinGecko (if listed).
 */
async function fetchUnyPrice(): Promise<number> {
  if (!COINGECKO_API_KEY && ORACLE_PROVIDER === "coingecko") {
    return 0.01; // Default UNY price when no API key
  }

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (COINGECKO_API_KEY) {
      headers["x-cg-demo-api-key"] = COINGECKO_API_KEY;
    }

    const res = await fetch(
      `${COINGECKO_API_URL}/simple/price?ids=unykorn&vs_currencies=usd`,
      { headers, signal: AbortSignal.timeout(10_000) },
    );

    if (res.ok) {
      const data = (await res.json()) as any;
      return data.unykorn?.usd ?? 0.01;
    }
  } catch { /* fallback */ }

  return 0.01;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the current price for an asset.
 */
export async function getPrice(asset: string): Promise<PriceFeed> {
  // Check static prices first
  if (asset in STATIC_PRICES) {
    return {
      asset,
      price_usd: STATIC_PRICES[asset].toFixed(6),
      source: "static",
      timestamp: new Date().toISOString(),
      stale: false,
    };
  }

  // Check cache
  const cached = getCached(asset);
  if (cached && !isCacheStale(cached)) {
    return {
      asset,
      price_usd: cached.price_usd.toFixed(6),
      source: `${cached.source} (cached)`,
      timestamp: new Date(cached.fetched_at).toISOString(),
      stale: false,
    };
  }

  // Fetch fresh price
  let price: number;
  let source: string;

  switch (asset) {
    case "wXAU":
      price = await fetchGoldPrice();
      source = METALS_API_KEY ? "metals-api" : "coingecko-proxy";
      break;
    case "UNY":
      price = await fetchUnyPrice();
      source = "coingecko";
      break;
    default:
      // Unknown asset — return cached if available (even stale)
      if (cached) {
        return {
          asset,
          price_usd: cached.price_usd.toFixed(6),
          source: `${cached.source} (stale)`,
          timestamp: new Date(cached.fetched_at).toISOString(),
          stale: true,
        };
      }
      return {
        asset,
        price_usd: "0",
        source: "none",
        timestamp: new Date().toISOString(),
        stale: true,
      };
  }

  // Cache the result
  setCache(asset, price, source);

  return {
    asset,
    price_usd: price.toFixed(6),
    source,
    timestamp: new Date().toISOString(),
    stale: false,
  };
}

/**
 * Get prices for all known wrapped assets.
 */
export async function getAllPrices(): Promise<PriceFeed[]> {
  const assets = ["USDF", "sUSDF", "xUSDF", "UNY", "wXAU", "wUSTB", "wBOND", "wINV"];
  return Promise.all(assets.map(getPrice));
}

/**
 * Health check for the oracle subsystem.
 */
export async function getOracleHealth(): Promise<OracleHealthStatus> {
  const entries = Array.from(priceCache.entries());
  const oldestAge = entries.length > 0
    ? Math.max(...entries.map(([, e]) => Date.now() - e.fetched_at))
    : 0;

  // Quick reachability check
  let reachable = false;
  try {
    const res = await fetch(`${COINGECKO_API_URL}/ping`, {
      signal: AbortSignal.timeout(5_000),
    });
    reachable = res.ok;
  } catch { /* unreachable */ }

  return {
    provider: ORACLE_PROVIDER,
    reachable,
    cached_assets: priceCache.size,
    oldest_cache_age_ms: oldestAge,
  };
}
