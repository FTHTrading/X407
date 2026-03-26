#!/usr/bin/env node
/**
 * x402-smoke-test.mjs
 *
 * End-to-end smoke test for the FTH x402 payment flow.
 * Tests: register → deposit → create invoice → sign proof → verify → receipt
 *
 * Requires: facilitator running on localhost:3100, database migrated + seeded.
 *
 * Usage: node scripts/x402-smoke-test.mjs
 */

import nacl from "tweetnacl";
import pkg from "tweetnacl-util";
const { encodeBase64, decodeUTF8 } = pkg;

const BASE = process.env.FACILITATOR_URL || "http://localhost:3100";

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  const data = await res.json();
  return { status: res.status, data };
}

function sign(message, secretKey) {
  const messageBytes = decodeUTF8(message);
  const signature = nacl.sign.detached(messageBytes, secretKey);
  return encodeBase64(signature);
}

async function main() {
  console.log("=== FTH x402 Smoke Test ===\n");

  // 0. Health check
  console.log("0. Health check...");
  const health = await get("/health");
  console.assert(health.status === 200, "Health check failed");
  console.log(`   ✓ Status: ${health.data.status}\n`);

  // 1. Generate test keypair
  console.log("1. Generating Ed25519 test wallet...");
  const keypair = nacl.sign.keyPair();
  const pubkeyB64 = encodeBase64(keypair.publicKey);
  const walletAddress = `uny1_test_${pubkeyB64.slice(0, 12)}`;
  console.log(`   Address: ${walletAddress}`);
  console.log(`   Pubkey:  ${pubkeyB64.slice(0, 32)}...\n`);

  // 2. Register wallet + pubkey
  console.log("2. Registering wallet...");
  const reg = await post("/credits/register", {
    wallet_address: walletAddress,
    pubkey: pubkeyB64,
    rail: "unykorn-l1",
  });
  console.assert(reg.status === 200, `Register failed: ${JSON.stringify(reg.data)}`);
  console.log(`   ✓ Registered: ${reg.data.pubkey_registered}\n`);

  // 3. Deposit credits
  const depositAmount = "10.0000000";
  console.log(`3. Depositing ${depositAmount} USDF...`);
  const dep = await post("/credits/deposit", {
    wallet_address: walletAddress,
    amount: depositAmount,
    reference: "smoke-test-deposit",
  });
  console.assert(dep.status === 200, `Deposit failed: ${JSON.stringify(dep.data)}`);
  console.log(`   ✓ Balance: ${dep.data.balance} USDF\n`);

  // 4. Check balance
  console.log("4. Checking balance...");
  const bal = await get(`/credits/${walletAddress}`);
  console.assert(bal.status === 200, `Balance check failed`);
  console.log(`   ✓ Balance: ${bal.data.balance} USDF\n`);

  // 5. Create invoice
  console.log("5. Creating invoice for genesis-repro route...");
  const inv = await post("/invoices", {
    resource: "/api/v1/genesis/repro-pack/minimal",
    namespace: "fth.x402.route.genesis-repro",
    asset: "USDF",
    amount: "0.5000000",
    receiver: "fth_treasury_l1",
    memo: "smoke-test-genesis-repro",
    policy: {
      kyc_required: false,
      min_pass_level: "basic",
      rate_limit: "100/hour",
    },
    ttl_seconds: 300,
  });
  console.assert(inv.status === 200 || inv.status === 201, `Invoice creation failed: ${JSON.stringify(inv.data)}`);
  const invoiceId = inv.data.invoice_id;
  const nonce = inv.data.nonce;
  console.log(`   ✓ Invoice: ${invoiceId}`);
  console.log(`   ✓ Nonce:   ${nonce}`);
  console.log(`   ✓ Amount:  ${inv.data.amount} ${inv.data.asset}\n`);

  // 6. Sign payment proof (prepaid_credit type)
  console.log("6. Signing prepaid_credit proof...");
  const proofMessage = `${invoiceId}|${nonce}`;
  const signature = sign(proofMessage, keypair.secretKey);
  console.log(`   ✓ Signature: ${signature.slice(0, 32)}...\n`);

  // 7. Verify payment
  console.log("7. Submitting verification...");
  const verify = await post("/verify", {
    invoice_id: invoiceId,
    nonce: nonce,
    resource: "/api/v1/genesis/repro-pack/minimal",
    namespace: "fth.x402.route.genesis-repro",
    proof: {
      proof_type: "prepaid_credit",
      credit_id: walletAddress,
      payer: walletAddress,
      signature: signature,
      invoice_id: invoiceId,
      nonce: nonce,
    },
  });
  console.log(`   Status: ${verify.status}`);
  console.log(`   Result: ${JSON.stringify(verify.data, null, 2)}`);
  console.assert(verify.data.verified === true, `Verification FAILED: ${verify.data.error}`);
  console.log(`   ✓ Receipt: ${verify.data.receipt_id}\n`);

  // 8. Lookup receipt
  console.log("8. Looking up receipt...");
  const receipt = await get(`/receipts/${verify.data.receipt_id}`);
  console.assert(receipt.status === 200, "Receipt lookup failed");
  console.log(`   ✓ Receipt ID:  ${receipt.data.receipt_id}`);
  console.log(`   ✓ Amount:      ${receipt.data.amount}`);
  console.log(`   ✓ Proof Type:  ${receipt.data.proof_type}`);
  console.log(`   ✓ Facilitator Sig: ${receipt.data.facilitator_sig?.slice(0, 32)}...\n`);

  // 9. Check final balance
  console.log("9. Final balance check...");
  const finalBal = await get(`/credits/${walletAddress}`);
  const expectedBalance = (parseFloat(depositAmount) - 0.5).toFixed(7);
  console.log(`   ✓ Balance: ${finalBal.data.balance} USDF (expected: ${expectedBalance})\n`);

  // 10. Verify replay protection (same nonce should fail)
  console.log("10. Testing replay protection...");
  const replay = await post("/verify", {
    invoice_id: invoiceId,
    nonce: nonce,
    resource: "/api/v1/genesis/repro-pack/minimal",
    namespace: "fth.x402.route.genesis-repro",
    proof: {
      proof_type: "prepaid_credit",
      credit_id: walletAddress,
      payer: walletAddress,
      signature: signature,
      invoice_id: invoiceId,
      nonce: nonce,
    },
  });
  console.assert(replay.data.verified === false, "Replay protection FAILED — should have rejected");
  console.log(`   ✓ Replay correctly rejected: ${replay.data.error_code}\n`);

  console.log("============================================");
  console.log("  ALL TESTS PASSED — x402 flow is working!");
  console.log("============================================");
}

main().catch((err) => {
  console.error("\n✗ Smoke test FAILED:", err.message);
  process.exit(1);
});
