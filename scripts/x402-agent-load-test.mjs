#!/usr/bin/env node
/**
 * x402-agent-load-test.mjs
 *
 * High-volume challenge-path benchmark for the UnyKorn-first x402 stack.
 * It hammers named agent routes on the gateway, records latency and status
 * distributions, then snapshots facilitator explorer surfaces.
 *
 * Usage:
 *   node scripts/x402-agent-load-test.mjs
 *   node scripts/x402-agent-load-test.mjs --duration 60 --concurrency 24
 *   node scripts/x402-agent-load-test.mjs --gateway http://127.0.0.1:8787 --facilitator http://127.0.0.1:3100 --json
 */

import process from "node:process";

const args = parseArgs(process.argv.slice(2));
const gatewayBase = trimSlash(args.gateway || process.env.GATEWAY_URL || "http://127.0.0.1:8787");
const facilitatorBase = trimSlash(args.facilitator || process.env.FACILITATOR_URL || "http://127.0.0.1:3100");
const durationSeconds = Math.max(1, Number(args.duration || process.env.DURATION_SECONDS || 15));
const concurrency = Math.max(1, Number(args.concurrency || process.env.CONCURRENCY || 8));
const timeoutMs = Math.max(250, Number(args.timeout || process.env.REQUEST_TIMEOUT_MS || 8000));
const jsonMode = Boolean(args.json);

const scenarios = [
  {
    id: "atlas-broker",
    label: "Atlas Broker",
    path: "/api/v1/agent/pay-api/atlas",
    kind: "agent-pay-api",
  },
  {
    id: "sentinel-audit",
    label: "Sentinel Audit",
    path: "/api/v1/agent/pay-api/sentinel",
    kind: "agent-pay-api",
  },
  {
    id: "genesis-trader",
    label: "Genesis Trader",
    path: "/api/v1/trade/verify/trade-0001",
    kind: "trade-verify",
  },
  {
    id: "aurora-studio",
    label: "Aurora Studio",
    path: "/api/v1/agent/pay-api/aurora",
    kind: "agent-pay-api",
  },
  {
    id: "vector-swarm",
    label: "Vector Swarm",
    path: "/api/v1/genesis/repro-pack/vector-swarm",
    kind: "genesis-repro",
  },
  {
    id: "moltmesh",
    label: "MoltMesh",
    path: "/api/v1/agent/pay-api/moltmesh",
    kind: "agent-pay-api",
  },
  {
    id: "ledger-clerk",
    label: "Ledger Clerk",
    path: "/api/v1/invoices/export/csv",
    kind: "invoice-export",
  },
  {
    id: "forge-coder",
    label: "Forge Coder",
    path: "/api/v1/agent/pay-api/forge",
    kind: "agent-pay-api",
  },
];

const state = {
  totalRequests: 0,
  ok200: 0,
  challenge402: 0,
  otherStatus: 0,
  failures: 0,
  invoiceIds: new Set(),
  latencies: [],
  scenarioStats: new Map(),
  sampleErrors: [],
};

for (const scenario of scenarios) {
  state.scenarioStats.set(scenario.id, {
    label: scenario.label,
    path: scenario.path,
    count: 0,
    ok200: 0,
    challenge402: 0,
    otherStatus: 0,
    failures: 0,
    latencies: [],
  });
}

async function main() {
  const preflight = await runPreflight();
  const startedAt = Date.now();
  const deadline = startedAt + durationSeconds * 1000;

  await Promise.all(Array.from({ length: concurrency }, (_, workerIndex) => workerLoop(workerIndex, deadline)));

  const finishedAt = Date.now();
  const elapsedMs = Math.max(1, finishedAt - startedAt);
  const elapsedSeconds = elapsedMs / 1000;
  const explorerSnapshot = await captureExplorerSnapshot();

  const summary = {
    gateway: gatewayBase,
    facilitator: facilitatorBase,
    durationSeconds,
    concurrency,
    preflight,
    totals: {
      requests: state.totalRequests,
      ok200: state.ok200,
      challenge402: state.challenge402,
      otherStatus: state.otherStatus,
      failures: state.failures,
      uniqueInvoiceIds: state.invoiceIds.size,
      requestsPerSecond: round(state.totalRequests / elapsedSeconds),
      requestsPerMinute: round((state.totalRequests / elapsedSeconds) * 60),
      p50Ms: percentile(state.latencies, 50),
      p95Ms: percentile(state.latencies, 95),
      p99Ms: percentile(state.latencies, 99),
    },
    scenarios: Array.from(state.scenarioStats.entries()).map(([, stat]) => ({
      label: stat.label,
      path: stat.path,
      count: stat.count,
      ok200: stat.ok200,
      challenge402: stat.challenge402,
      otherStatus: stat.otherStatus,
      failures: stat.failures,
      requestsPerSecond: round(stat.count / elapsedSeconds),
      p50Ms: percentile(stat.latencies, 50),
      p95Ms: percentile(stat.latencies, 95),
    })),
    explorerSnapshot,
    sampleErrors: state.sampleErrors,
  };

  if (jsonMode) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  printSummary(summary);

  if (state.totalRequests === 0 || (state.challenge402 === 0 && state.ok200 === 0)) {
    process.exitCode = 1;
  }
}

async function runPreflight() {
  const facilitatorHealth = await safeFetchJson(`${facilitatorBase}/health`);
  const l1Health = await safeFetchJson(`${facilitatorBase}/l1/health`);
  const sampleRoute = await safeFetchJson(`${gatewayBase}${scenarios[0].path}`);

  return {
    facilitatorHealth: shrinkPayload(facilitatorHealth),
    l1Health: shrinkPayload(l1Health),
    sampleRoute: shrinkPayload(sampleRoute),
  };
}

async function workerLoop(workerIndex, deadline) {
  let cursor = workerIndex % scenarios.length;
  while (Date.now() < deadline) {
    const scenario = scenarios[cursor % scenarios.length];
    cursor += 1;
    await hitScenario(scenario);
  }
}

async function hitScenario(scenario) {
  const stat = state.scenarioStats.get(scenario.id);
  const started = performance.now();
  try {
    const response = await fetchWithTimeout(`${gatewayBase}${scenario.path}`, {
      headers: {
        "User-Agent": `x402-agent-load/${scenario.id}`,
        Accept: "application/json",
      },
    }, timeoutMs);
    const elapsed = performance.now() - started;
    state.totalRequests += 1;
    state.latencies.push(elapsed);
    stat.count += 1;
    stat.latencies.push(elapsed);

    const bodyText = await response.text();
    const payload = tryParseJson(bodyText);
    const invoiceId = payload?.payment?.invoice_id || payload?.invoice_id || payload?.invoiceId;
    if (invoiceId) {
      state.invoiceIds.add(invoiceId);
    }

    if (response.status === 402) {
      state.challenge402 += 1;
      stat.challenge402 += 1;
    } else if (response.status === 200) {
      state.ok200 += 1;
      stat.ok200 += 1;
    } else {
      state.otherStatus += 1;
      stat.otherStatus += 1;
      rememberError(`Unexpected status ${response.status} for ${scenario.label}`);
    }
  } catch (error) {
    const elapsed = performance.now() - started;
    state.totalRequests += 1;
    state.failures += 1;
    state.latencies.push(elapsed);
    stat.count += 1;
    stat.failures += 1;
    stat.latencies.push(elapsed);
    rememberError(`${scenario.label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function captureExplorerSnapshot() {
  const [invoiceView, receiptView, anchoringView, l1Health, batches] = await Promise.all([
    safeFetchJson(`${facilitatorBase}/admin/invoices?limit=5`),
    safeFetchJson(`${facilitatorBase}/admin/receipts?limit=5`),
    safeFetchJson(`${facilitatorBase}/admin/anchoring`),
    safeFetchJson(`${facilitatorBase}/l1/health`),
    safeFetchJson(`${facilitatorBase}/l1/batches`),
  ]);

  return {
    invoices: shrinkPayload(invoiceView),
    receipts: shrinkPayload(receiptView),
    anchoring: shrinkPayload(anchoringView),
    l1Health: shrinkPayload(l1Health),
    l1Batches: shrinkPayload(batches),
  };
}

function printSummary(summary) {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║ x402 Agent Load Test                                          ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
  console.log(`Gateway:      ${summary.gateway}`);
  console.log(`Facilitator:  ${summary.facilitator}`);
  console.log(`Duration:     ${summary.durationSeconds}s`);
  console.log(`Concurrency:  ${summary.concurrency}`);
  console.log();
  console.log("Totals");
  console.log(`  Requests:           ${summary.totals.requests}`);
  console.log(`  402 challenges:     ${summary.totals.challenge402}`);
  console.log(`  200 responses:      ${summary.totals.ok200}`);
  console.log(`  Other statuses:     ${summary.totals.otherStatus}`);
  console.log(`  Failures:           ${summary.totals.failures}`);
  console.log(`  Unique invoices:    ${summary.totals.uniqueInvoiceIds}`);
  console.log(`  Throughput/sec:     ${summary.totals.requestsPerSecond}`);
  console.log(`  Throughput/min:     ${summary.totals.requestsPerMinute}`);
  console.log(`  Latency p50/p95/p99 ${summary.totals.p50Ms} / ${summary.totals.p95Ms} / ${summary.totals.p99Ms} ms`);
  console.log();
  console.log("Scenario breakdown");
  for (const scenario of summary.scenarios) {
    console.log(`  ${scenario.label.padEnd(16)} ${String(scenario.count).padStart(5)} req  ${String(scenario.requestsPerSecond).padStart(6)} rps  p95 ${String(scenario.p95Ms).padStart(6)} ms`);
  }
  console.log();
  console.log("Explorer snapshot");
  console.log(`  Invoices view:      ${summary.explorerSnapshot.invoices.ok ? "ok" : "unavailable"}`);
  console.log(`  Receipts view:      ${summary.explorerSnapshot.receipts.ok ? "ok" : "unavailable"}`);
  console.log(`  Anchoring view:     ${summary.explorerSnapshot.anchoring.ok ? "ok" : "unavailable"}`);
  console.log(`  L1 health:          ${summary.explorerSnapshot.l1Health.ok ? "ok" : "unavailable"}`);
  console.log(`  L1 batches:         ${summary.explorerSnapshot.l1Batches.ok ? "ok" : "unavailable"}`);
  if (summary.sampleErrors.length > 0) {
    console.log();
    console.log("Sample errors");
    for (const entry of summary.sampleErrors) {
      console.log(`  - ${entry}`);
    }
  }
}

function rememberError(message) {
  if (state.sampleErrors.length < 12) {
    state.sampleErrors.push(message);
  }
}

async function fetchWithTimeout(url, init, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function safeFetchJson(url) {
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        Accept: "application/json",
      },
    }, timeoutMs);
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      payload: tryParseJson(text) || text,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      payload: error instanceof Error ? error.message : String(error),
    };
  }
}

function shrinkPayload(result) {
  const payload = result?.payload;
  if (!payload || typeof payload !== "object") {
    return result;
  }

  const clone = { ...result };
  if (Array.isArray(payload.invoices)) {
    clone.payload = {
      ...payload,
      invoices: payload.invoices.slice(0, 2),
    };
  }
  if (Array.isArray(payload.receipts)) {
    clone.payload = {
      ...clone.payload,
      receipts: payload.receipts.slice(0, 2),
    };
  }
  if (Array.isArray(payload.batches)) {
    clone.payload = {
      ...clone.payload,
      batches: payload.batches.slice(0, 2),
    };
  }
  return clone;
}

function percentile(values, pct) {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((pct / 100) * sorted.length));
  return round(sorted[index]);
}

function round(value) {
  return Number(value.toFixed(2));
}

function trimSlash(value) {
  return value.replace(/\/$/, "");
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    i += 1;
  }
  return parsed;
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

main().catch((error) => {
  console.error("x402 agent load test failed:", error);
  process.exit(1);
});
