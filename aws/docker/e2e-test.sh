#!/bin/bash
# FTH x402 Full E2E Test Script
# Runs on delta against localhost services
set -euo pipefail

BASE="http://localhost:3100"
TBASE="http://localhost:3200"
WALLET="0xTestWallet_E2E_$(date +%s)"

# Generate Ed25519 keypair using node (from facilitator container which has tweetnacl)
KEYS_JSON=$(docker exec fth-x402-facilitator-1 node -e "
  const nacl = require('tweetnacl');
  const util = require('tweetnacl-util');
  const kp = nacl.sign.keyPair();
  console.log(JSON.stringify({
    pubkey: util.encodeBase64(kp.publicKey),
    secretKey: util.encodeBase64(kp.secretKey)
  }));
")
PUBKEY=$(echo "$KEYS_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['pubkey'])")
SECRET_KEY=$(echo "$KEYS_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['secretKey'])")
echo "Generated Ed25519 keypair. Pubkey: $PUBKEY"

pass=0
fail=0
total=0

run_test() {
  local name="$1"
  local expected_status="$2"
  local method="$3"
  local url="$4"
  local data="${5:-}"
  total=$((total+1))

  if [ -n "$data" ]; then
    HTTP_CODE=$(curl -s -o /tmp/e2e_resp.json -w "%{http_code}" -X "$method" "$url" -H "Content-Type: application/json" -d "$data")
  else
    HTTP_CODE=$(curl -s -o /tmp/e2e_resp.json -w "%{http_code}" -X "$method" "$url")
  fi
  BODY=$(cat /tmp/e2e_resp.json)

  if [ "$HTTP_CODE" = "$expected_status" ]; then
    echo "PASS [$name] -> $HTTP_CODE"
    pass=$((pass+1))
  else
    echo "FAIL [$name] -> expected $expected_status got $HTTP_CODE"
    echo "  BODY: $BODY"
    fail=$((fail+1))
  fi
  # Export body for chaining
  export LAST_BODY="$BODY"
  export LAST_CODE="$HTTP_CODE"
}

echo "============================================"
echo "FTH x402 E2E Test Suite"
echo "Wallet: $WALLET"
echo "============================================"

# --- 1. Health Check ---
run_test "Health Check" "200" "GET" "$BASE/health"
echo "  $LAST_BODY"

# --- 2. Register Wallet ---
run_test "Register Wallet" "200" "POST" "$BASE/credits/register" \
  "{\"wallet_address\":\"$WALLET\",\"namespace\":\"e2e-test\",\"rail\":\"l1\",\"pubkey\":\"$PUBKEY\"}"
echo "  $LAST_BODY"

# --- 3. Deposit Credits ---
run_test "Deposit Credits" "200" "POST" "$BASE/credits/deposit" \
  "{\"wallet_address\":\"$WALLET\",\"amount\":\"50.00\",\"rail\":\"l1\",\"reference\":\"e2e-deposit-001\"}"
echo "  $LAST_BODY"

# --- 4. Check Balance ---
run_test "Check Balance" "200" "GET" "$BASE/credits/$WALLET"
echo "  $LAST_BODY"

# --- 5. Create Invoice ---
run_test "Create Invoice" "201" "POST" "$BASE/invoices" \
  "{\"resource\":\"test://e2e-resource\",\"namespace\":\"e2e-test\",\"asset\":\"UNY\",\"amount\":\"5.00\",\"receiver\":\"0xMerchant001\",\"rail\":\"l1\"}"
echo "  $LAST_BODY"

# Extract invoice_id and nonce
INV_ID=$(echo "$LAST_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('invoice_id',''))" 2>/dev/null || echo "")
NONCE=$(echo "$LAST_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('nonce',''))" 2>/dev/null || echo "")
echo "  Invoice ID: $INV_ID"
echo "  Nonce: $NONCE"

# --- 6. Lookup Invoice ---
if [ -n "$INV_ID" ]; then
  run_test "Lookup Invoice" "200" "GET" "$BASE/invoices/$INV_ID"
  echo "  $LAST_BODY"
fi

# --- 7. Verify Payment (prepaid_credit) ---
if [ -n "$INV_ID" ] && [ -n "$NONCE" ]; then
  # Sign the message invoice_id|nonce with our Ed25519 secret key
  SIGNATURE=$(docker exec fth-x402-facilitator-1 node -e "
    const nacl = require('tweetnacl');
    const util = require('tweetnacl-util');
    const secretKey = util.decodeBase64('$SECRET_KEY');
    const message = '$INV_ID' + '|' + '$NONCE';
    const sig = nacl.sign.detached(util.decodeUTF8(message), secretKey);
    console.log(util.encodeBase64(sig));
  ")
  echo "  Signature: $SIGNATURE"

  VERIFY_PAYLOAD=$(cat <<EOJSON
{
  "invoice_id": "$INV_ID",
  "nonce": "$NONCE",
  "resource": "test://e2e-resource",
  "namespace": "e2e-test",
  "proof": {
    "proof_type": "prepaid_credit",
    "credit_id": "credit_e2e_001",
    "payer": "$WALLET",
    "signature": "$SIGNATURE",
    "invoice_id": "$INV_ID",
    "nonce": "$NONCE"
  }
}
EOJSON
)
  run_test "Verify Payment" "200" "POST" "$BASE/verify" "$VERIFY_PAYLOAD"
  echo "  $LAST_BODY"
else
  echo "SKIP [Verify Payment] - no invoice_id or nonce"
  total=$((total+1))
  fail=$((fail+1))
fi

# --- 8. Check Balance After Payment ---
run_test "Balance After Payment" "200" "GET" "$BASE/credits/$WALLET"
echo "  $LAST_BODY"

# --- 9. L1 Health ---
run_test "L1 Health" "200" "GET" "$BASE/l1/health"
echo "  $LAST_BODY"

# --- 10. Treasury Status ---
run_test "Treasury Status" "200" "GET" "$TBASE/treasury/status"
echo "  $LAST_BODY"

# --- 11. Admin Invoices ---
run_test "Admin Invoices" "200" "GET" "$BASE/admin/invoices"
echo "  $LAST_BODY"

# --- 12. Admin Accounts ---
run_test "Admin Accounts" "200" "GET" "$BASE/admin/accounts"
echo "  $(echo $LAST_BODY | head -c 300)"

# --- 13. Transaction History ---
run_test "Transaction History" "200" "GET" "$BASE/credits/$WALLET/transactions"
echo "  $(echo $LAST_BODY | head -c 300)"

# --- 14. Get facilitator logs for any errors ---
echo ""
echo "=== FACILITATOR LOGS (last 30s) ==="
docker logs fth-x402-facilitator-1 --since 30s --tail 30 2>&1 | grep -i "error\|err\|fail\|500\|level\":50\|level\":40" || echo "(no errors found)"

echo ""
echo "============================================"
echo "RESULTS: $pass passed, $fail failed, $total total"
echo "============================================"
