#!/usr/bin/env node
// ===========================================================================
// FTH x402 — Deployment Smoke Test
// ===========================================================================
// Validates a deployed (or local) gateway is responding correctly.
//
// Usage:
//   node scripts/x402-deploy-smoke-test.mjs                     # default: http://localhost:8787
//   node scripts/x402-deploy-smoke-test.mjs https://api.fth.trading
//   node scripts/x402-deploy-smoke-test.mjs https://staging-api.fth.trading
//
// Exit codes:
//   0 = all checks passed
//   1 = one or more checks failed

const GATEWAY_URL = process.argv[2] || "http://localhost:8787";
const FACILITATOR_URL = process.argv[3] || "http://localhost:3100";

let passed = 0;
let failed = 0;

function ok(label) {
  passed++;
  console.log(`  ✓ ${label}`);
}

function fail(label, detail) {
  failed++;
  console.error(`  ✗ ${label} — ${detail}`);
}

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(10000) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, headers: res.headers, text, json };
}

// ===========================================================================
console.log("╔═══════════════════════════════════════════════╗");
console.log("║  FTH x402 — Deployment Smoke Test            ║");
console.log("╚═══════════════════════════════════════════════╝");
console.log(`  Gateway:     ${GATEWAY_URL}`);
console.log(`  Facilitator: ${FACILITATOR_URL}`);
console.log("");

// ---- 1. Gateway health ----
console.log("1 — Gateway health");
try {
  const r = await fetchJSON(`${GATEWAY_URL}/health`);
  if (r.status === 200) ok("GET /health → 200");
  else fail("GET /health", `expected 200, got ${r.status}`);

  if (r.json?.status === "ok") ok("response.status === 'ok'");
  else fail("response.status", `expected 'ok', got ${r.json?.status}`);

  if (r.json?.version) ok(`version: ${r.json.version}`);
  else fail("version missing", JSON.stringify(r.json));
} catch (e) {
  fail("GET /health", `unreachable: ${e.message}`);
}
console.log("");

// ---- 2. Unknown path → 404 ----
console.log("2 — Unknown path returns 404");
try {
  const r = await fetchJSON(`${GATEWAY_URL}/api/v1/nonexistent`);
  if (r.status === 404) ok("GET /api/v1/nonexistent → 404");
  else fail("expected 404", `got ${r.status}`);
} catch (e) {
  fail("GET /api/v1/nonexistent", e.message);
}
console.log("");

// ---- 3. Paid route without proof → 402 ----
console.log("3 — Paid route without proof → 402");
try {
  const r = await fetchJSON(`${GATEWAY_URL}/api/v1/genesis/repro-pack/alpha`);

  if (r.status === 402) ok("GET /api/v1/genesis/repro-pack/alpha → 402");
  else fail("expected 402", `got ${r.status}`);

  // Check X-PAYMENT-REQUIRED header
  const hdr = r.headers.get("X-PAYMENT-REQUIRED") || r.headers.get("x-payment-required");
  if (hdr) ok("X-PAYMENT-REQUIRED header present");
  else fail("X-PAYMENT-REQUIRED header missing", "");

  // Validate PaymentRequirement body
  if (r.json) {
    if (r.json.version) ok(`version: ${r.json.version}`);
    else fail("body.version missing", "");

    if (r.json.payment?.asset === "USDF") ok("payment.asset === USDF");
    else fail("payment.asset", `expected USDF, got ${r.json.payment?.asset}`);

    if (r.json.payment?.amount === "0.50") ok("payment.amount === 0.50");
    else fail("payment.amount", `expected 0.50, got ${r.json.payment?.amount}`);

    if (r.json.payment?.invoice_id) ok(`invoice_id: ${r.json.payment.invoice_id}`);
    else fail("payment.invoice_id missing", "");

    if (r.json.payment?.nonce) ok(`nonce present`);
    else fail("payment.nonce missing", "");

    if (r.json.payment?.expires_at) ok(`expires_at: ${r.json.payment.expires_at}`);
    else fail("payment.expires_at missing", "");

    if (r.json.payment?.accepted_rails?.length > 0) ok(`accepted_rails: [${r.json.payment.accepted_rails}]`);
    else fail("accepted_rails missing/empty", "");

    if (r.json.payment?.accepted_proofs?.length > 0) ok(`accepted_proofs: [${r.json.payment.accepted_proofs}]`);
    else fail("accepted_proofs missing/empty", "");

    if (r.json.namespace) ok(`namespace: ${r.json.namespace}`);
    else fail("namespace missing", "");
  } else {
    fail("402 body is not valid JSON", r.text?.substring(0, 200));
  }
} catch (e) {
  fail("GET /genesis/repro-pack/alpha", e.message);
}
console.log("");

// ---- 4. Malformed proof → 400 ----
console.log("4 — Malformed proof header → 400");
try {
  const r = await fetchJSON(`${GATEWAY_URL}/api/v1/genesis/repro-pack/alpha`, {
    headers: { "X-PAYMENT-SIGNATURE": "not-valid-base64-or-json!!!" },
  });
  if (r.status === 400) ok("malformed proof → 400");
  else fail("expected 400", `got ${r.status}`);

  if (r.json?.code === "invalid_proof") ok("error code: invalid_proof");
  else fail("error code", `expected invalid_proof, got ${r.json?.code}`);
} catch (e) {
  fail("malformed proof test", e.message);
}
console.log("");

// ---- 5. Facilitator health (if reachable) ----
console.log("5 — Facilitator health");
try {
  const r = await fetchJSON(`${FACILITATOR_URL}/health`);
  if (r.status === 200) ok("GET /health → 200");
  else fail("GET /health", `expected 200, got ${r.status}`);

  if (r.json?.status === "ok") ok("facilitator status ok");
  else fail("facilitator status", JSON.stringify(r.json));
} catch (e) {
  fail("Facilitator /health", `unreachable: ${e.message} (non-fatal if testing gateway-only)`);
}
console.log("");

// ---- 6. Operator endpoints (if facilitator reachable) ----
console.log("6 — Operator endpoints");
const operatorPaths = [
  "/admin/receipts?limit=1",
  "/admin/channels?limit=1",
  "/admin/invoices?limit=1",
  "/admin/accounts?limit=1",
  "/admin/verifications/failures",
  "/admin/webhooks/deliveries?limit=1",
  "/admin/anchoring",
];
for (const path of operatorPaths) {
  try {
    const r = await fetchJSON(`${FACILITATOR_URL}${path}`);
    if (r.status === 200) ok(`GET ${path} → 200`);
    else fail(`GET ${path}`, `expected 200, got ${r.status}`);
  } catch (e) {
    fail(`GET ${path}`, `unreachable: ${e.message}`);
  }
}
console.log("");

// ---- 7. Second paid route → 402 ----
console.log("7 — Second paid route (trade-verify)");
try {
  const r = await fetchJSON(`${GATEWAY_URL}/api/v1/trade/verify/test-trade-001`);
  if (r.status === 402) ok("GET /api/v1/trade/verify/test-trade-001 → 402");
  else fail("expected 402", `got ${r.status}`);

  if (r.json?.payment?.amount === "0.25") ok("payment.amount === 0.25");
  else fail("payment.amount", `expected 0.25, got ${r.json?.payment?.amount}`);
} catch (e) {
  fail("trade-verify route", e.message);
}
console.log("");

// ===========================================================================
// Summary
// ===========================================================================
console.log("═══════════════════════════════════════════════");
console.log(`  Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log("═══════════════════════════════════════════════");

if (failed > 0) {
  console.log("\n  ⚠ Some checks failed. See above for details.");
  process.exit(1);
} else {
  console.log("\n  ✅ All deployment smoke checks passed.");
  process.exit(0);
}
