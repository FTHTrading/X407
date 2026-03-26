#!/usr/bin/env node
/**
 * FTH x402 — Gateway ↔ Facilitator Integration Test
 *
 * Tests the full HTTP 402 protocol flow through the gateway:
 *   1. Hit gateway paid route → get 402 with X-PAYMENT-REQUIRED
 *   2. Parse payment requirement
 *   3. Register wallet with facilitator
 *   4. Deposit credit
 *   5. Sign payment proof
 *   6. Retry with X-PAYMENT-SIGNATURE → get 200 + X-PAYMENT-RESPONSE
 *
 * Requires:
 *   - Facilitator running on localhost:3100
 *   - Gateway running on localhost:8788 or localhost:8790
 *
 * Run: node scripts/x402-gateway-integration-test.mjs
 */

import { webcrypto } from "crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;

import pkg_nacl from "tweetnacl";
const { sign: { keyPair, detached } } = pkg_nacl;
import pkg_util from "tweetnacl-util";
const { encodeBase64, decodeUTF8 } = pkg_util;

const GATEWAY = process.env.GATEWAY_URL ?? "http://localhost:8788";
const FACILITATOR = process.env.FACILITATOR_URL ?? "http://localhost:3100";
let passed = 0;
let failed = 0;

async function resolveGatewayBase() {
  if (process.env.GATEWAY_URL) {
    return process.env.GATEWAY_URL;
  }

  const candidates = [
    "http://localhost:8788",
    "http://127.0.0.1:8788",
    "http://localhost:8790",
    "http://127.0.0.1:8790",
    "http://localhost:8787",
    "http://127.0.0.1:8787",
  ];

  for (const candidate of candidates) {
    try {
      const res = await fetch(`${candidate}/health`);
      if (res.ok) return candidate;
    } catch {
      // Try next candidate.
    }
  }

  return GATEWAY;
}

function ok(name, data) {
  passed++;
  console.log(`  ✓ ${name}`);
  if (data) console.log(`    ${JSON.stringify(data).slice(0, 140)}`);
}
function fail(name, err) {
  failed++;
  console.error(`  ✗ ${name}: ${err}`);
}

async function run() {
  const gatewayBase = await resolveGatewayBase();

  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║   FTH x402 — Gateway ↔ Facilitator Integration Test          ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");
  console.log(`  Gateway: ${gatewayBase}`);
  console.log(`  Facilitator: ${FACILITATOR}`);

  // --- 0. Check both services are up ---
  try {
    const [gw, fac] = await Promise.all([
      fetch(`${gatewayBase}/health`).then(r => r.json()),
      fetch(`${FACILITATOR}/health`).then(r => r.json()),
    ]);
    ok("0. Services healthy", { gateway: gw.status, facilitator: fac.status });
  } catch (e) {
    fail("0. Service check", e.message);
    console.error("\n  Make sure both gateway (8787) and facilitator (3100) are running.\n");
    process.exit(1);
  }

  // --- 1. Hit paid route without payment → expect 402 ---
  let requirement;
  try {
    const res = await fetch(`${gatewayBase}/api/v1/genesis/repro-pack/alpha`);
    if (res.status !== 402) {
      fail("1. Expected 402", `Got ${res.status}`);
    } else {
      // Parse X-PAYMENT-REQUIRED header
      const header = res.headers.get("X-PAYMENT-REQUIRED");
      if (header) {
        requirement = JSON.parse(atob(header));
        ok("1. Got 402 + X-PAYMENT-REQUIRED", {
          invoice_id: requirement.payment?.invoice_id,
          amount: requirement.payment?.amount,
        });
      } else {
        // Try body fallback
        const body = await res.json();
        if (body.version === "fth-x402/2.0") {
          requirement = body;
          ok("1. Got 402 (body)", { invoice_id: requirement.payment?.invoice_id });
        } else {
          fail("1. No payment requirement in 402", JSON.stringify(body).slice(0, 100));
        }
      }
    }
  } catch (e) { fail("1. Gateway 402", e.message); }

  if (!requirement?.payment?.invoice_id) {
    console.error("\n  ABORT: Could not get payment requirement from gateway\n");
    process.exit(1);
  }

  // --- 2. Generate wallet + register ---
  const kp = keyPair();
  const pubkeyB64 = encodeBase64(kp.publicKey);
  const address = `uny1_gwtest_${pubkeyB64.slice(0, 12)}`;

  try {
    const res = await fetch(`${FACILITATOR}/credits/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet_address: address, pubkey: pubkeyB64 }),
    });
    const data = await res.json();
    if (data.pubkey_registered) ok("2. Wallet registered", { address });
    else fail("2. Register", JSON.stringify(data));
  } catch (e) { fail("2. Register", e.message); }

  // --- 3. Deposit credit ---
  try {
    const res = await fetch(`${FACILITATOR}/credits/deposit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet_address: address, amount: "5.00" }),
    });
    const data = await res.json();
    ok("3. Deposited 5.00 USDF", { balance: data.balance });
  } catch (e) { fail("3. Deposit", e.message); }

  // --- 4. Build signed proof ---
  const invoice_id = requirement.payment.invoice_id;
  const nonce = requirement.payment.nonce;
  const message = `${invoice_id}|${nonce}`;
  const sig = detached(decodeUTF8(message), kp.secretKey);
  const sigB64 = encodeBase64(sig);

  const proof = {
    proof_type: "prepaid_credit",
    credit_id: address,
    payer: address,
    signature: sigB64,
    invoice_id,
    nonce,
  };
  ok("4. Built prepaid_credit proof", { invoice_id });

  // --- 5. Retry with X-PAYMENT-SIGNATURE ---
  try {
    const encodedProof = btoa(JSON.stringify(proof));
    const res = await fetch(`${gatewayBase}/api/v1/genesis/repro-pack/alpha`, {
      headers: { "X-PAYMENT-SIGNATURE": encodedProof },
    });

    if (res.status === 200) {
      // Parse receipt from X-PAYMENT-RESPONSE
      const receiptHeader = res.headers.get("X-PAYMENT-RESPONSE");
      if (receiptHeader) {
        const receipt = JSON.parse(atob(receiptHeader));
        ok("5. Got 200 + X-PAYMENT-RESPONSE", receipt);
      } else {
        ok("5. Got 200 (no receipt header)", { status: res.status });
      }
    } else {
      const body = await res.text();
      fail("5. Expected 200 after payment", `Got ${res.status}: ${body.slice(0, 100)}`);
    }
  } catch (e) { fail("5. Gateway retry", e.message); }

  // --- 6. Hit trade-verify route → expect 402 ---
  try {
    const res = await fetch(`${gatewayBase}/api/v1/trade/verify/TRD-001`);
    if (res.status === 402) ok("6. Trade-verify route → 402", { amount: "0.00025 UNY" });
    else fail("6. Trade-verify 402", `Got ${res.status}`);
  } catch (e) { fail("6. Trade-verify", e.message); }

  // --- 7. Hit invoice-export route → expect 402 ---
  try {
    const res = await fetch(`${gatewayBase}/api/v1/invoices/export/pdf`);
    if (res.status === 402) ok("7. Invoice-export route → 402", { amount: "0.001 UNY" });
    else fail("7. Invoice-export 402", `Got ${res.status}`);
  } catch (e) { fail("7. Invoice-export", e.message); }

  // --- 8. Non-paid route → 404 ---
  try {
    const res = await fetch(`${gatewayBase}/api/v1/unknown/route`);
    if (res.status === 404) ok("8. Non-paid route → 404");
    else fail("8. Expected 404", `Got ${res.status}`);
  } catch (e) { fail("8. Non-paid route", e.message); }

  // --- Summary ---
  console.log(`\n  ── Results: ${passed} passed, ${failed} failed ──\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
