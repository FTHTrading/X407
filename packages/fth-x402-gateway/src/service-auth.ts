/**
 * FTH x402 Gateway — Service Auth (Web Crypto API)
 *
 * Lightweight HMAC-SHA256 signing for Cloudflare Worker → Facilitator calls.
 * Uses Web Crypto API (no Node.js `crypto` dependency).
 */

const SERVICE_NAME = "fth-x402-gateway";
const ENCODER = new TextEncoder();

async function hmacSha256(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    ENCODER.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, ENCODER.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function bodyHash(body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    ENCODER.encode("fth-body"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, ENCODER.encode(body || ""));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Create HMAC-signed headers for a service-to-service request.
 *
 * @param signingKey - FTH_SERVICE_SECRET from env
 * @param method     - HTTP method
 * @param path       - URL pathname
 * @param body       - Request body (empty string for GET)
 * @returns headers to merge into the fetch call
 */
export async function createServiceHeaders(
  signingKey: string,
  method: string,
  path: string,
  body: string,
): Promise<Record<string, string>> {
  const timestamp = String(Date.now());
  const bh = await bodyHash(body);
  const message = `${method.toUpperCase()}|${path}|${timestamp}|${bh}`;
  const signature = await hmacSha256(signingKey, message);

  return {
    "x-service-name": SERVICE_NAME,
    "x-service-timestamp": timestamp,
    "x-service-signature": signature,
    "content-type": "application/json",
  };
}
