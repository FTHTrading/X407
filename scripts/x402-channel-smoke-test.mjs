#!/usr/bin/env node
/**
 * FTH x402 — Channel Spend E2E Smoke Test
 *
 * Tests the full channel lifecycle:
 *   1. Generate wallet + register pubkey
 *   2. Deposit credit
 *   3. Open a payment channel
 *   4. Create invoice
 *   5. Sign channel_spend proof (Ed25519)
 *   6. Verify+settle via channel
 *   7. Second spend (sequence monotonicity)
 *   8. Query channel state
 *   9. Close channel
 *  10. Verify channel closed
 *
 * Requires: facilitator running on localhost:3100
 */

import { webcrypto } from "crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;

import pkg_nacl from "tweetnacl";
const { sign: { keyPair, detached }, } = pkg_nacl;
import pkg_util from "tweetnacl-util";
const { encodeBase64, decodeUTF8 } = pkg_util;

const BASE = process.env.FACILITATOR_URL ?? "http://localhost:3100";
let passed = 0;
let failed = 0;

function ok(name, data) {
  passed++;
  console.log(`  ✓ ${name}`);
  if (data) console.log(`    ${JSON.stringify(data).slice(0, 120)}`);
}
function fail(name, err) {
  failed++;
  console.error(`  ✗ ${name}: ${err}`);
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, data: await res.json() };
}

async function run() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║   FTH x402 — Channel Spend E2E Smoke Test              ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // --- 1. Generate keypair ---
  const kp = keyPair();
  const pubkeyB64 = encodeBase64(kp.publicKey);
  const address = `uny1_chan_${pubkeyB64.slice(0, 16)}`;
  ok("1. Generated keypair", { address, pubkey: pubkeyB64.slice(0, 20) + "..." });

  // --- 2. Register wallet ---
  try {
    const { status, data } = await post("/credits/register", {
      wallet_address: address,
      pubkey: pubkeyB64,
      rail: "unykorn-l1",
    });
    if (status === 200 && data.pubkey_registered) ok("2. Registered wallet", data);
    else fail("2. Register", JSON.stringify(data));
  } catch (e) { fail("2. Register", e.message); }

  // --- 3. Deposit 5.00 USDF ---
  try {
    const { status, data } = await post("/credits/deposit", {
      wallet_address: address,
      amount: "5.00",
      reference: "channel-test-deposit",
    });
    if (status === 200) ok("3. Deposited 5.00 USDF", { balance: data.balance });
    else fail("3. Deposit", JSON.stringify(data));
  } catch (e) { fail("3. Deposit", e.message); }

  // --- 4. Open channel with 3.00 USDF ---
  let channelId;
  try {
    const { status, data } = await post("/channels/open", {
      wallet_address: address,
      deposited_amount: "3.00",
      namespace: "fth.x402.route.genesis-repro",
    });
    if ((status === 200 || status === 201) && data.channel_id) {
      channelId = data.channel_id;
      ok("4. Opened channel", { channel_id: channelId, deposited: data.deposited_amount });
    } else {
      fail("4. Open channel", JSON.stringify(data));
    }
  } catch (e) { fail("4. Open channel", e.message); }

  if (!channelId) {
    console.error("\n  ABORT: Channel not created, cannot proceed\n");
    process.exit(1);
  }

  // --- 5. Create invoice for first spend ---
  let invoice1;
  try {
    const { status, data } = await post("/invoices", {
      resource: "/api/v1/genesis/repro-pack/alpha",
      namespace: "fth.x402.route.genesis-repro",
      asset: "USDF",
      amount: "0.50",
      receiver: "uny1_FTH_TREASURY",
      memo: "fth:genesis:alpha",
      policy: { kyc_required: false, min_pass_level: "basic", rate_limit: "100/hour" },
      ttl_seconds: 300,
    });
    if ((status === 200 || status === 201) && data.invoice_id) {
      invoice1 = data;
      ok("5. Created invoice #1", { invoice_id: data.invoice_id });
    } else {
      fail("5. Create invoice #1", `status=${status} ` + JSON.stringify(data));
    }
  } catch (e) { fail("5. Create invoice #1", e.message); }

  if (!invoice1) { console.error("\n  ABORT: Invoice not created\n"); process.exit(1); }

  // --- 6. Sign & verify channel_spend #1 (seq=1) ---
  try {
    const seq = 1;
    const message = `${channelId}|${seq}|${invoice1.invoice_id}`;
    const sig = detached(decodeUTF8(message), kp.secretKey);
    const sigB64 = encodeBase64(sig);

    const { status, data } = await post("/verify", {
      invoice_id: invoice1.invoice_id,
      nonce: invoice1.nonce,
      proof: {
        proof_type: "channel_spend",
        channel_id: channelId,
        sequence: seq,
        payer: address,
        signature: sigB64,
        invoice_id: invoice1.invoice_id,
        nonce: invoice1.nonce,
      },
      resource: "/api/v1/genesis/repro-pack/alpha",
      namespace: "fth.x402.route.genesis-repro",
    });
    if (status === 200 && data.verified) {
      ok("6. Channel spend #1 verified", { receipt_id: data.receipt_id });
    } else {
      fail("6. Channel spend #1", JSON.stringify(data));
    }
  } catch (e) { fail("6. Channel spend #1", e.message); }

  // --- 7. Second spend (seq=2) ---
  let invoice2;
  try {
    const { status, data } = await post("/invoices", {
      resource: "/api/v1/genesis/repro-pack/beta",
      namespace: "fth.x402.route.genesis-repro",
      asset: "USDF",
      amount: "0.50",
      receiver: "uny1_FTH_TREASURY",
      memo: "fth:genesis:beta",
      policy: { kyc_required: false, min_pass_level: "basic", rate_limit: "100/hour" },
      ttl_seconds: 300,
    });
    if (status === 200 || status === 201) invoice2 = data;
    else fail("7a. Create invoice #2", `status=${status}`);
  } catch (e) { fail("7a. Create invoice #2", e.message); }

  if (invoice2) {
    try {
      const seq = 2;
      const message = `${channelId}|${seq}|${invoice2.invoice_id}`;
      const sig = detached(decodeUTF8(message), kp.secretKey);
      const sigB64 = encodeBase64(sig);

      const { status, data } = await post("/verify", {
        invoice_id: invoice2.invoice_id,
        nonce: invoice2.nonce,
        proof: {
          proof_type: "channel_spend",
          channel_id: channelId,
          sequence: seq,
          payer: address,
          signature: sigB64,
          invoice_id: invoice2.invoice_id,
          nonce: invoice2.nonce,
        },
        resource: "/api/v1/genesis/repro-pack/beta",
        namespace: "fth.x402.route.genesis-repro",
      });
      if (status === 200 && data.verified) {
        ok("7. Channel spend #2 (seq=2)", { receipt_id: data.receipt_id });
      } else {
        fail("7. Channel spend #2", JSON.stringify(data));
      }
    } catch (e) { fail("7. Channel spend #2", e.message); }
  }

  // --- 8. Query channel state ---
  try {
    const { status, data } = await get(`/channels/${channelId}`);
    if (status === 200 && data.channel_id === channelId) {
      ok("8. Channel state", {
        available: data.available_amount,
        spent: data.spent_amount,
        seq: data.sequence,
      });
    } else {
      fail("8. Channel state", JSON.stringify(data));
    }
  } catch (e) { fail("8. Channel state", e.message); }

  // --- 9. Close channel ---
  try {
    const { status, data } = await post(`/channels/${channelId}/close`, {});
    if (status === 200 && data.status === "closed") {
      ok("9. Channel closed", { status: data.status, spent: data.spent_amount });
    } else {
      fail("9. Close channel", JSON.stringify(data));
    }
  } catch (e) { fail("9. Close channel", e.message); }

  // --- 10. Verify closed channel rejects spend ---
  try {
    const { data: inv3 } = await post("/invoices", {
      resource: "/api/v1/genesis/repro-pack/gamma",
      namespace: "fth.x402.route.genesis-repro",
      asset: "USDF",
      amount: "0.50",
      receiver: "uny1_FTH_TREASURY",
      memo: "fth:genesis:gamma",
      policy: { kyc_required: false, min_pass_level: "basic", rate_limit: "100/hour" },
      ttl_seconds: 300,
    });

    const seq = 3;
    const message = `${channelId}|${seq}|${inv3.invoice_id}`;
    const sig = detached(decodeUTF8(message), kp.secretKey);
    const sigB64 = encodeBase64(sig);

    const { data } = await post("/verify", {
      invoice_id: inv3.invoice_id,
      nonce: inv3.nonce,
      proof: {
        proof_type: "channel_spend",
        channel_id: channelId,
        sequence: seq,
        payer: address,
        signature: sigB64,
        invoice_id: inv3.invoice_id,
        nonce: inv3.nonce,
      },
      resource: "/api/v1/genesis/repro-pack/gamma",
      namespace: "fth.x402.route.genesis-repro",
    });

    if (!data.verified && data.error_code) {
      ok("10. Closed channel rejects spend", { error: data.error });
    } else {
      fail("10. Should reject closed channel spend", JSON.stringify(data));
    }
  } catch (e) { fail("10. Closed channel rejection", e.message); }

  // --- Summary ---
  console.log(`\n  ── Results: ${passed} passed, ${failed} failed ──\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
