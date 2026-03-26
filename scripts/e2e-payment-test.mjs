#!/usr/bin/env node
/**
 * FTH x402 — End-to-End Payment Test
 *
 * Tests the full payment flow:
 *   1. Generate client wallet (Ed25519)
 *   2. Register wallet + pubkey with facilitator
 *   3. Deposit prepaid credits
 *   4. Hit paid route on gateway → get 402 + invoice
 *   5. Sign payment proof
 *   6. Resend with proof → get 200 + receipt
 *
 * Usage: node scripts/e2e-payment-test.mjs [gateway-url]
 */

import https from "https";
import http from "http";
import crypto from "crypto";

// --- tweetnacl (CommonJS, so dynamic import) ---
const nacl = (await import("tweetnacl")).default;

// Base64 / UTF8 helpers (no tweetnacl-util dependency)
function encodeBase64(uint8arr) {
  return Buffer.from(uint8arr).toString("base64");
}
function decodeUTF8(str) {
  return new TextEncoder().encode(str);
}

// --- Configuration ---
const GATEWAY_URL = process.argv[2] || "https://fth-x402-gateway.kevanbtc.workers.dev";
const FACILITATOR_URL = "https://facilitator.l1.unykorn.org";
const PAID_ROUTE = "/api/v1/agent/pay-api/demo";

// --- Helpers ---
function fetchJSON(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const transport = parsedUrl.protocol === "https:" ? https : http;
    const body = options.body ? JSON.stringify(options.body) : undefined;

    const req = transport.request(
      url,
      {
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "fth-x402-e2e-test/1.0",
          ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
          ...(options.headers || {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, headers: res.headers, body: data });
          }
        });
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function log(step, msg, data) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  STEP ${step}: ${msg}`);
  console.log(`${"═".repeat(60)}`);
  if (data) console.log(JSON.stringify(data, null, 2));
}

// ═══════════════════════════════════════════════════════════
//  STEP 0: Generate client wallet
// ═══════════════════════════════════════════════════════════
const keypair = nacl.sign.keyPair();
const pubHash = crypto.createHash("sha256").update(Buffer.from(keypair.publicKey)).digest();
const walletAddress = "uny1_" + pubHash.subarray(0, 20).toString("hex");
const pubkeyB64 = encodeBase64(keypair.publicKey);

log(0, "GENERATE CLIENT WALLET", {
  wallet_address: walletAddress,
  pubkey: pubkeyB64,
});

// ═══════════════════════════════════════════════════════════
//  STEP 1: Register wallet + pubkey with facilitator
// ═══════════════════════════════════════════════════════════
log(1, "REGISTER WALLET WITH FACILITATOR");
const regResult = await fetchJSON(`${FACILITATOR_URL}/credits/register`, {
  method: "POST",
  body: {
    wallet_address: walletAddress,
    pubkey: pubkeyB64,
    rail: "unykorn-l1",
  },
});
console.log(`  Status: ${regResult.status}`);
console.log(JSON.stringify(regResult.body, null, 2));

if (regResult.status !== 200) {
  console.error("FAILED: Could not register wallet");
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════
//  STEP 2: Deposit prepaid credits
// ═══════════════════════════════════════════════════════════
log(2, "DEPOSIT PREPAID CREDITS");
const depositResult = await fetchJSON(`${FACILITATOR_URL}/credits/deposit`, {
  method: "POST",
  body: {
    wallet_address: walletAddress,
    amount: "10.0",
    reference: "e2e-test-initial-deposit",
    tx_hash: `tx_e2e_${Date.now()}`,
  },
});
console.log(`  Status: ${depositResult.status}`);
console.log(JSON.stringify(depositResult.body, null, 2));

if (depositResult.status !== 200) {
  console.error("FAILED: Could not deposit credits");
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════
//  STEP 3: Hit paid route → get 402 + invoice
// ═══════════════════════════════════════════════════════════
log(3, "HIT PAID ROUTE → EXPECT 402");
const gateResult = await fetchJSON(`${GATEWAY_URL}${PAID_ROUTE}`);
console.log(`  Status: ${gateResult.status}`);

if (gateResult.status !== 402) {
  console.error(`FAILED: Expected 402, got ${gateResult.status}`);
  console.log(JSON.stringify(gateResult.body, null, 2));
  process.exit(1);
}

const invoice = gateResult.body.payment;
console.log(JSON.stringify({
  invoice_id: invoice.invoice_id,
  nonce: invoice.nonce,
  amount: invoice.amount,
  asset: invoice.asset,
  receiver: invoice.receiver,
  expires_at: invoice.expires_at,
}, null, 2));

// ═══════════════════════════════════════════════════════════
//  STEP 4: Sign payment proof (prepaid_credit)
// ═══════════════════════════════════════════════════════════
log(4, "SIGN PREPAID CREDIT PROOF");
const message = `${invoice.invoice_id}|${invoice.nonce}`;
const messageBytes = decodeUTF8(message);
const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
const signatureB64 = encodeBase64(signature);

const proof = {
  proof_type: "prepaid_credit",
  credit_id: walletAddress,       // credit_id IS the wallet address
  payer: walletAddress,
  invoice_id: invoice.invoice_id,
  nonce: invoice.nonce,
  signature: signatureB64,
  rail: "unykorn-l1",
};

console.log(JSON.stringify({
  proof_type: proof.proof_type,
  payer: proof.payer,
  invoice_id: proof.invoice_id,
  signature: signatureB64.substring(0, 32) + "...",
}, null, 2));

// ═══════════════════════════════════════════════════════════
//  STEP 5: Resend with proof → expect 200 + receipt
// ═══════════════════════════════════════════════════════════
log(5, "RESEND WITH PAYMENT PROOF → EXPECT 200");
const payResult = await fetchJSON(`${GATEWAY_URL}${PAID_ROUTE}`, {
  method: "GET",
  headers: {
    "X-PAYMENT-SIGNATURE": Buffer.from(JSON.stringify(proof)).toString("base64"),
  },
});
console.log(`  Status: ${payResult.status}`);
console.log(JSON.stringify(payResult.body, null, 2));

// Check for X-PAYMENT-RESPONSE header
const paymentResponse = payResult.headers["x-payment-response"];
if (paymentResponse) {
  const decoded = JSON.parse(Buffer.from(paymentResponse, "base64").toString());
  console.log("\n  X-PAYMENT-RESPONSE header:");
  console.log(JSON.stringify(decoded, null, 2));
}

// ═══════════════════════════════════════════════════════════
//  STEP 6: Check remaining balance
// ═══════════════════════════════════════════════════════════
log(6, "CHECK REMAINING BALANCE");
const balanceResult = await fetchJSON(`${FACILITATOR_URL}/credits/${walletAddress}`);
console.log(`  Status: ${balanceResult.status}`);
console.log(JSON.stringify(balanceResult.body, null, 2));

// ═══════════════════════════════════════════════════════════
//  SUMMARY
// ═══════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(60)}`);
console.log("  E2E PAYMENT TEST SUMMARY");
console.log(`${"═".repeat(60)}`);
console.log(`  Wallet:         ${walletAddress}`);
console.log(`  Deposited:      10.0 UNY`);
console.log(`  Invoice:        ${invoice.invoice_id}`);
console.log(`  Price:          ${invoice.amount} ${invoice.asset}`);
console.log(`  Payment Status: ${payResult.status === 200 ? "✅ PAID" : `❌ ${payResult.status}`}`);
console.log(`  Balance After:  ${balanceResult.body?.balance ?? "unknown"}`);
if (paymentResponse) {
  const decoded = JSON.parse(Buffer.from(paymentResponse, "base64").toString());
  console.log(`  Receipt ID:     ${decoded.receipt_id ?? "none"}`);
  console.log(`  Rail:           ${decoded.rail ?? "none"}`);
}
console.log(`${"═".repeat(60)}\n`);

process.exit(payResult.status === 200 ? 0 : 1);
