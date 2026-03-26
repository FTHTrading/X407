# x402 + UnyKorn — Best-Case Always-On Production Sequence

Date: 2026-03-21
Status: Recommended execution order

## Goal

Move from a working live demo into an always-on agent-commerce network that:

1. runs continuously,
2. settles on UnyKorn,
3. has stable pricing for AI agents,
4. can fund agent activity automatically,
5. can evolve into tokenized or stable-value production economics.

---

## Recommended Monetary Model

Best-case path:

- **UnyKorn (`UNY`) = settlement and treasury asset**
- **x402 credit ledger = stable-value pricing layer**
- **optional stablecoin later = externalized redemption / regulated expansion**

Why this is best:

- keeps UnyKorn as the native chain rail,
- avoids making production credibility depend on immediate public stablecoin issuance,
- gives agents predictable prices,
- allows automated funding and treasury controls now,
- preserves a clean upgrade path to real tokenized money later.

---

## Sequence 1 — Make the system always-on first

### Objective

Turn the current live demo into a persistent public service.

### Actions

1. Replace quick tunnels with permanent hosts:
   - gateway: fixed HTTPS hostname
   - facilitator: fixed HTTPS hostname
   - explorer already public
2. Run facilitator under process supervision
3. Move PostgreSQL to a persistent managed or hardened service
4. Add uptime checks and alerts
5. Add log retention and request tracing
6. Add restart-safe secrets management

### Success criteria

- public gateway stays reachable 24/7
- facilitator stays reachable 24/7
- explorer can probe both without manual URL updates
- receipts and anchors continue through restarts

---

## Sequence 2 — Make agent funding automatic

### Objective

Ensure agents can be funded and continue transacting without manual intervention.

### Actions

1. Create a treasury service with:
   - per-agent balance floor
   - refill policy
   - max daily allocation
   - emergency halt
2. Fund agents using treasury-issued `UNY` or treasury-backed credits
3. Add policy rules:
   - max spend per namespace
   - max spend per hour
   - KYC / allowlist for privileged lanes
4. Add operator views for:
   - treasury outflows
   - agent balances
   - refill events
   - failed refill attempts

### Success criteria

- agents can transact continuously without manual wallet top-ups
- treasury exposure is bounded by policy
- all refill events are auditable

---

## Sequence 3 — Stabilize pricing

### Objective

Make AI-to-AI commerce feel economically normal.

### Actions

1. Price API routes in stable-value credits, not floating raw `UNY`
2. Keep settlement on UnyKorn underneath
3. Add treasury conversion logic:
   - treasury targets stable route prices
   - treasury periodically reprices `UNY` credit equivalents
4. Keep receipts showing both:
   - route price
   - settlement rail

### Success criteria

- route prices stay predictable
- operators can quote usage cleanly
- agents can budget over time

---

## Sequence 4 — Introduce controlled issuance

### Objective

Allow the system to mint or issue value in a way that looks real and remains defensible.

### Best immediate form of issuance

Use **treasury-backed x402 credits** first.

### Why not jump directly to public stablecoin issuance

Because direct stablecoin issuance immediately adds:

- reserve management requirements,
- redemption design,
- legal/compliance complexity,
- public trust expectations.

### Safer issue-first model

- mint `UNY` to treasury under governance rules,
- treasury allocates agent operating balances,
- facilitator tracks stable-value x402 credits,
- anchors all receipts and treasury actions on UnyKorn.

### Success criteria

- issuance is governed,
- balances are observable,
- agents can spend continuously,
- operators can explain the model simply.

---

## Sequence 5 — Upgrade to full production money later

### Objective

If desired, evolve from treasury-backed credits to full token money.

### Options

#### Option A — Native UnyKorn operating economy
- `UNY` is the sole medium
- route prices float or are oracle-adjusted
- best for closed ecosystem / internal network

#### Option B — Treasury-backed stable credit
- x402 credit ledger is the pricing layer
- `UNY` is settlement asset
- best near-term production path

#### Option C — Real stablecoin issuance
- on-chain minted stable token
- treasury / reserve / redemption model
- best only after operations and governance are mature

### Recommended order

B → A or C later

---

## Immediate Best-Case Execution Order

### Next 72 hours

1. permanent gateway host
2. permanent facilitator host
3. persistent database hardening
4. explorer defaults pointed at stable public endpoints
5. treasury refill service for agent wallets
6. route pricing normalized in stable-value terms

### Next 2 weeks

1. automated funding rules
2. operator treasury dashboard
3. alerting and SLOs
4. issuance and treasury audit logs
5. governance limits for minting / allocation

### Next 30 days

1. formal `UNY` treasury policy
2. stable-value credit issuance model
3. partner-facing production onboarding
4. optional redemption / external settlement design

---

## Best-Case End State

At steady state, the system looks like this:

1. agent requests premium capability,
2. gateway issues x402 payment challenge,
3. agent spends treasury-backed stable-value credit,
4. facilitator verifies and issues receipt,
5. receipt batch anchors on UnyKorn,
6. treasury automatically replenishes qualified agents,
7. operator dashboard shows invoice, receipt, anchor, and treasury state in real time.

That is the best-case version of a real always-on AI commerce system.

---

## Recommendation

Proceed with this order:

1. **always-on infra**
2. **automatic treasury funding**
3. **stable-value x402 credits**
4. **governed `UNY` issuance**
5. **stablecoin only after the above is stable**

This is the fastest route to something that feels real, works continuously, and does not overextend the monetary layer too early.
