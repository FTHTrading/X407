#!/usr/bin/env bash
set -euo pipefail

# Demo treasury -> demo agent funding helper for UnyKorn L1.
# Supports either:
#   1. eth_sendTransaction against an unlocked demo treasury account on the RPC, or
#   2. eth_sendRawTransaction when UNYKORN_FUNDING_RAW_TX is provided.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "$ROOT_DIR/.env" ]]; then
  # shellcheck disable=SC1090
  source "$ROOT_DIR/.env"
fi

UNYKORN_RPC_URL="${UNYKORN_RPC_URL:-https://rpc.l1.unykorn.org}"
UNYKORN_EXPLORER_URL="${UNYKORN_EXPLORER_URL:-https://explorer.unykorn.org}"
UNYKORN_TREASURY_ADDRESS="${UNYKORN_TREASURY_ADDRESS:-}"
UNYKORN_AGENT_ADDRESS="${UNYKORN_AGENT_ADDRESS:-}"
UNYKORN_FUND_AMOUNT_WEI="${UNYKORN_FUND_AMOUNT_WEI:-100000000000000}"

if [[ -z "$UNYKORN_AGENT_ADDRESS" ]]; then
  echo "ERROR: UNYKORN_AGENT_ADDRESS is required."
  exit 1
fi

echo "→ Funding demo agent on UnyKorn L1..."
echo "  RPC:      $UNYKORN_RPC_URL"
echo "  Agent:    $UNYKORN_AGENT_ADDRESS"
echo "  Treasury: ${UNYKORN_TREASURY_ADDRESS:-<raw-tx mode>}"
echo "  Amount:   $UNYKORN_FUND_AMOUNT_WEI wei"

if [[ -n "${UNYKORN_FUNDING_RAW_TX:-}" ]]; then
  PAYLOAD=$(cat <<JSON
{"jsonrpc":"2.0","id":1,"method":"eth_sendRawTransaction","params":["$UNYKORN_FUNDING_RAW_TX"]}
JSON
)
elif [[ -n "$UNYKORN_TREASURY_ADDRESS" ]]; then
  PAYLOAD=$(cat <<JSON
{"jsonrpc":"2.0","id":1,"method":"eth_sendTransaction","params":[{"from":"$UNYKORN_TREASURY_ADDRESS","to":"$UNYKORN_AGENT_ADDRESS","value":"0x$(printf '%x' "$UNYKORN_FUND_AMOUNT_WEI")"}]}
JSON
)
else
  echo "ERROR: Set UNYKORN_TREASURY_ADDRESS for unlocked-account mode or UNYKORN_FUNDING_RAW_TX for signed mode."
  exit 1
fi

RESPONSE=$(curl -s "$UNYKORN_RPC_URL" -H "Content-Type: application/json" --data "$PAYLOAD")
echo "$RESPONSE"

TX_HASH=$(printf '%s' "$RESPONSE" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);process.stdout.write(j.result||'')}catch{}})")

if [[ -n "$TX_HASH" ]]; then
  echo ""
  echo "✓ Demo funding transaction submitted"
  echo "  Tx: $TX_HASH"
  echo "  Explorer: ${UNYKORN_EXPLORER_URL%/}/tx/$TX_HASH"
else
  echo "⚠ No tx hash returned"
fi