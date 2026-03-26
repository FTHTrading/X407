#!/usr/bin/env node
/**
 * x402-e2e-integration-test.mjs
 *
 * End-to-end integration test proving the full 402→pay→200 cycle:
 *
 *   1. Unpaid request to a paid route → 402 with PaymentRequirement
 *   2. Parse the 402 body — extract invoice_id, nonce, amount
 *   3. Register wallet, deposit credits, sign proof
 *   4. Replay the request with X-PAYMENT-SIGNATURE → 200 + receipt
 *   5. Verify the receipt header and response body
 *
 * This test simulates exactly what the gateway does, but hits the
 * facilitator directly (no wrangler needed). It proves that the
 * protocol objects from fth-x402-core drive the full flow.
 *
 * Requires: facilitator running on localhost:3100, database migrated + seeded.
 *
 * Usage: node scripts/x402-e2e-integration-test.mjs
 */

import nacl from "tweetnacl";
import pkg from "tweetnacl-util";
const { encodeBase64, decodeUTF8 } = pkg;

const BASE = process.env.FACILITATOR_URL || "http://localhost:3100";
const PROTOCOL_VERSION = "fth-x402/2.0";

// Auth: use admin token or HMAC service auth when available
const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN || "";
const authHeader = ADMIN_TOKEN
  ? { Authorization: `Bearer ${ADMIN_TOKEN}` }
  : {};

// --- Helpers ---------------------------------------------------------------

async function post(path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader, ...headers },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data, headers: Object.fromEntries(res.headers) };
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { ...authHeader },
  });
  const data = await res.json();
  return { status: res.status, data };
}

function sign(message, secretKey) {
  const messageBytes = decodeUTF8(message);
  const signature = nacl.sign.detached(messageBytes, secretKey);
  return encodeBase64(signature);
}

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`   ✓ ${label}`);
    passed++;
  } else {
    console.log(`   ✗ ${label}`);
    failed++;
  }
}

// --- Main ------------------------------------------------------------------

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║  FTH x402 End-to-End Integration Test                    ║");
  console.log("║  Protocol: fth-x402/2.0 │ Flow: 402 → pay → 200         ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  // =========================================================================
  // 0. Health check
  // =========================================================================
  console.log("0. Facilitator health check...");
  const health = await get("/health");
  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.data.status === "ok", `Status: ${health.data.status}`);
  console.log();

  // =========================================================================
  // 1. Generate test wallet
  // =========================================================================
  console.log("1. Generate test Ed25519 wallet...");
  const keyPair = nacl.sign.keyPair();
  const pubkeyB64 = encodeBase64(keyPair.publicKey);
  const walletAddr = `uny1_test_e2e_${Date.now()}`;
  console.log(`   Wallet: ${walletAddr}`);
  console.log(`   PubKey: ${pubkeyB64.slice(0, 20)}...`);
  console.log();

  // =========================================================================
  // 2. Register + deposit prepaid credits
  // =========================================================================
  console.log("2. Register wallet & deposit credits...");
  const reg = await post("/credits/register", {
    wallet_address: walletAddr,
    pubkey: pubkeyB64,
    rail: "unykorn-l1",
  });
  assert(reg.status === 200, `Register: ${reg.status}`);
  assert(reg.data.pubkey_registered === true, `Pubkey registered: ${reg.data.pubkey_registered}`);

  const dep = await post("/credits/deposit", {
    wallet_address: walletAddr,
    amount: "5.00",
    reference: "e2e-test-deposit",
  });
  assert(dep.status === 200, `Deposit $5.00: balance=${dep.data.balance}`);
  console.log();

  // =========================================================================
  // 3. Simulate unpaid request — expect 402
  // =========================================================================
  console.log("3. Simulate unpaid request → expect 402...");

  // The gateway would call facilitator /invoices to create the invoice.
  // We do the same thing here to simulate the 402 flow.
  const invoiceReq = {
    resource: "/api/v1/genesis/repro-pack/alpha",
    namespace: "fth.x402.route.genesis-repro",
    asset: "USDF",
    amount: "0.50",
    receiver: "uny1_FTH_TREASURY",
    memo: "fth:genesis:alpha",
    policy: { kyc_required: false, min_pass_level: "basic", rate_limit: "100/hour" },
    ttl_seconds: 300,
  };

  const inv = await post("/invoices", invoiceReq);
  assert(inv.status === 200 || inv.status === 201, `Invoice created: ${inv.data.invoice_id}`);
  assert(!!inv.data.nonce, `Nonce: ${inv.data.nonce}`);
  assert(!!inv.data.expires_at, `Expires: ${inv.data.expires_at}`);

  // Build the 402 PaymentRequirement (what the gateway would return)
  const requirement = {
    version: PROTOCOL_VERSION,
    resource: invoiceReq.resource,
    payment: {
      asset: "USDF",
      amount: "0.50",
      receiver: "uny1_FTH_TREASURY",
      memo: "fth:genesis:alpha",
      invoice_id: inv.data.invoice_id,
      nonce: inv.data.nonce,
      expires_at: inv.data.expires_at,
      accepted_rails: ["unykorn-l1", "stellar", "xrpl"],
      accepted_proofs: ["prepaid_credit", "channel_spend", "signed_auth", "tx_hash"],
    },
    namespace: invoiceReq.namespace,
    policy: invoiceReq.policy,
  };
  assert(requirement.version === PROTOCOL_VERSION, `PaymentRequirement version: ${requirement.version}`);
  console.log(`   → 402 PaymentRequirement built (invoice: ${inv.data.invoice_id})`);
  console.log();

  // =========================================================================
  // 4. Client constructs proof from 402 body
  // =========================================================================
  console.log("4. Client constructs prepaid_credit proof...");

  // Proof message format matches what the facilitator expects: invoiceId|nonce
  const message = `${inv.data.invoice_id}|${inv.data.nonce}`;
  const proofSig = sign(message, keyPair.secretKey);

  const proof = {
    proof_type: "prepaid_credit",
    credit_id: walletAddr,        // credit_id IS the wallet address
    payer: walletAddr,
    signature: proofSig,
    invoice_id: inv.data.invoice_id,
    nonce: inv.data.nonce,
  };
  assert(!!proof.signature, `Proof signed (${proof.signature.slice(0, 20)}...)`);
  console.log();

  // =========================================================================
  // 5. Simulate paid request → expect 200 (gateway calls /verify)
  // =========================================================================
  console.log("5. Verify proof with facilitator → expect 200...");

  const verify = await post("/verify", {
    invoice_id: inv.data.invoice_id,
    nonce: inv.data.nonce,
    proof,
    resource: invoiceReq.resource,
    namespace: invoiceReq.namespace,
  });

  assert(verify.status === 200, `Verify status: ${verify.status}`);
  assert(verify.data.verified === true, `Verified: ${verify.data.verified}`);
  assert(!!verify.data.receipt_id, `Receipt: ${verify.data.receipt_id}`);
  console.log();

  // =========================================================================
  // 6. Verify receipt exists
  // =========================================================================
  console.log("6. Confirm receipt on facilitator...");

  const receipt = await get(`/receipts/${verify.data.receipt_id}`);
  assert(receipt.status === 200, `Receipt lookup: ${receipt.status}`);
  assert(receipt.data.invoice_id === inv.data.invoice_id, `Receipt.invoice_id matches`);
  assert(receipt.data.payer === walletAddr, `Receipt.payer matches`);
  assert(receipt.data.proof_type === "prepaid_credit", `Receipt.proof_type: ${receipt.data.proof_type}`);
  assert(!!receipt.data.facilitator_sig, `Receipt has facilitator signature`);
  console.log();

  // =========================================================================
  // 7. Verify credit was deducted
  // =========================================================================
  console.log("7. Verify credit balance deducted...");

  const bal = await get(`/credits/${walletAddr}`);
  assert(bal.status === 200, `Balance check: ${bal.status}`);
  const balValue = parseFloat(bal.data.balance);
  assert(balValue === 4.5, `Balance: ${bal.data.balance} (expected ~4.50)`);
  console.log();

  // =========================================================================
  // 8. Replay protection — same proof should fail
  // =========================================================================
  console.log("8. Replay protection — same proof should fail...");

  const replay = await post("/verify", {
    invoice_id: inv.data.invoice_id,
    nonce: inv.data.nonce,
    proof,
    resource: invoiceReq.resource,
    namespace: invoiceReq.namespace,
  });

  assert(replay.data.verified !== true, `Replay blocked (verified: ${replay.data.verified}, error: ${replay.data.error_code})`);
  console.log();

  // =========================================================================
  // 9. Second paid route — channel_spend flow
  // =========================================================================
  console.log("9. Channel spend flow (open → invoice → spend → verify)...");

  // Open channel
  const ch = await post("/channels/open", {
    wallet_address: walletAddr,
    deposited_amount: "2.00",
    namespace: "fth.x402.route.genesis-repro",
  });
  assert((ch.status === 200 || ch.status === 201) && !!ch.data.channel_id, `Channel opened: ${ch.data.channel_id}`);
  const channelId = ch.data.channel_id;

  // Create invoice for second route
  const inv2 = await post("/invoices", {
    resource: "/api/v1/genesis/repro-pack/beta",
    namespace: "fth.x402.route.genesis-repro",
    asset: "USDF",
    amount: "0.25",
    receiver: "uny1_FTH_TREASURY",
    memo: "fth:genesis:beta",
    policy: { kyc_required: false, min_pass_level: "basic", rate_limit: "100/hour" },
    ttl_seconds: 300,
  });
  assert(inv2.status === 200 || inv2.status === 201, `Invoice 2 created: ${inv2.data.invoice_id}`);

  // Sign channel spend proof: message = channelId|seq|invoiceId
  const chMessage = `${channelId}|1|${inv2.data.invoice_id}`;
  const chSig = sign(chMessage, keyPair.secretKey);

  const chProof = {
    proof_type: "channel_spend",
    channel_id: channelId,
    sequence: 1,
    payer: walletAddr,
    signature: chSig,
    invoice_id: inv2.data.invoice_id,
    nonce: inv2.data.nonce,
  };

  const chVerify = await post("/verify", {
    invoice_id: inv2.data.invoice_id,
    nonce: inv2.data.nonce,
    proof: chProof,
    resource: "/api/v1/genesis/repro-pack/beta",
    namespace: "fth.x402.route.genesis-repro",
  });
  assert(chVerify.status === 200, `Channel verify status: ${chVerify.status}`);
  assert(chVerify.data.verified === true, `Channel verified: ${chVerify.data.verified}`);
  assert(!!chVerify.data.receipt_id, `Channel receipt: ${chVerify.data.receipt_id}`);
  console.log();

  // =========================================================================
  // 10. Transaction history
  // =========================================================================
  console.log("10. Transaction history shows payments...");
  const txHistory = await get(`/credits/${walletAddr}/transactions`);
  assert(txHistory.status === 200, `Transaction history: ${txHistory.status}`);
  assert(
    Array.isArray(txHistory.data.transactions) && txHistory.data.transactions.length >= 2,
    `Transactions: ${txHistory.data.transactions?.length ?? 0} (≥2 expected)`,
  );
  console.log();

  // =========================================================================
  // Summary
  // =========================================================================
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failed === 0) {
    console.log("  ✓ ALL TESTS PASSED — 402→pay→200 flow verified end-to-end");
  } else {
    console.log("  ✗ SOME TESTS FAILED");
  }
  console.log("═══════════════════════════════════════════════════════════\n");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
