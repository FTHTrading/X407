# Sovereign Design System — Master Spec v1.1

> **Codename:** SOVEREIGN
> **Version:** 1.1.0
> **Date:** 2026-03-15
> **Scope:** All FTH / UnyKorn / xxxiii / Helios / NIL33 / Y3K interfaces

**Companion documents:**
- [DOCTRINE.md](DOCTRINE.md) — The constitution. Laws, tests, intelligence rules.
- [BRAND-FOCUS.md](BRAND-FOCUS.md) — 6-field focus cards. One offer per brand.
- [ADAPTIVE.md](ADAPTIVE.md) — Device behavior ruleset. Self-adjusting layout.

---

## 0. The North Star

> **One self-adjusting liquid system for every brand, every device, every chain, and every user need.**

Not separate sites. Not separate UX philosophies. Not separate design languages.
Every property is the same living system. Each brand is only: **theme + module map + voice profile + proof surface**.

**Product discipline:** one problem per system, one main offer per brand, one clean revenue path, bench the extras. See [BRAND-FOCUS.md](BRAND-FOCUS.md).

---

## 1. Purpose

One universal interface language that generates interfaces, flows, behaviors, hierarchy, motion, tone, and modularity across every surface:

- Desktop web
- Mobile web / native
- Dashboard / operations
- Watch
- Smart glasses
- XR / VR
- AI agent console
- Capital / RWA / treasury flows
- Proof and automation systems

Not one perfect homepage. One perfect scalable system.

---

## 2. Design DNA — The 10 Laws

| # | Law | Meaning |
|---|-----|---------|
| 1 | **One focal object** | One living core per view. Never five heroes wrestling in public. |
| 2 | **One active panel** | One information surface at a time. |
| 3 | **Progressive reveal** | Don't dump all the power at once. |
| 4 | **Motion is guidance** | Movement should explain, not perform. |
| 5 | **Glass is selective** | Transparency is a tool, not wallpaper. |
| 6 | **Readability beats spectacle** | Always. |
| 7 | **Proof is visible** | Trust must be seen. |
| 8 | **AI is behavior** | Not labels that say "AI." |
| 9 | **Every screen must convert** | The user should always know the next action. |
| 10 | **Every system should feel alive** | But never frantic. |

---

## 3. The Three-Second Test

Every interface must answer in under 3 seconds:

1. **What is this?**
2. **What can I do here?**
3. **What is live right now?**
4. **Where do I go next?**

If it cannot, it is too dense.

---

## 4. The Five Jobs

Every system helps users do one or more of:

| Job | Description |
|-----|-------------|
| **Understand** | What is happening, what the system does, what matters. |
| **Decide** | Choose an action, path, asset, flow, or automation. |
| **Execute** | Move money, create an asset, launch a product, issue an instrument, verify proof, run a workflow. |
| **Monitor** | See status, risk, proof, telemetry, and next steps. |
| **Trust** | Feel that the system is real, credible, secure, and operational. |

---

## 5. Product Architecture Layers

Every platform maps to the same engine:

```
┌─────────────────────────────────────────┐
│  Layer 5: EXPAND                        │
│  API, enterprise, partners, AI agents,  │
│  device integrations, XR views          │
├─────────────────────────────────────────┤
│  Layer 4: MONITOR                       │
│  Metrics, proof, telemetry, workflows,  │
│  alerts, governance                     │
├─────────────────────────────────────────┤
│  Layer 3: ACT                           │
│  Launch, mint, deploy, verify, pay,     │
│  issue, analyze, automate               │
├─────────────────────────────────────────┤
│  Layer 2: ORIENT                        │
│  Modules, system map, what it does,     │
│  what is live                           │
├─────────────────────────────────────────┤
│  Layer 1: ATTRACT                       │
│  Landing page, story, trust,            │
│  simple entry                           │
└─────────────────────────────────────────┘
```

Every platform is not content. It is a **use machine**.

---

## 6. Universal Module Families

Not every site shows every family. They all pull from the same cabinet.

### Core
`Home` · `Platform` · `Modules` · `Docs` · `Contact`

### Intelligence
`Signals` · `GMIIE` · `Analytics` · `Forecasting` · `Recommendations`

### Execution
`Launch` · `Deploy` · `Create` · `Issue` · `Automate`

### Capital
`Treasury` · `Wallet` · `Payments` · `Liquidity` · `Settlement`

### RWA
`Assets` · `Certificates` · `Registry` · `Verification` · `Issuance`

### Trust
`Proof` · `Compliance` · `Audit` · `Telemetry` · `Governance`

### Agentic
`Agent Mesh` · `Workflows` · `MCP Fabric` · `Memory` · `Routing` · `Observability`

---

## 7. Token Architecture

See `tokens/` directory for machine-readable definitions.

### 7.1 Theme Tokens

| Token | Purpose | Example (UnyKorn) |
|-------|---------|-------------------|
| `--sov-bg` | Primary background | `#0a0a0f` |
| `--sov-bg-alt` | Alternate/elevated surface | `#0f0f18` |
| `--sov-surface` | Glass card fill | `rgba(22,22,30,0.65)` |
| `--sov-surface-solid` | Opaque surface | `#16161e` |
| `--sov-border` | Default border | `rgba(255,255,255,0.06)` |
| `--sov-border-glow` | Active/hover border | brand-dependent |
| `--sov-accent-1` | Primary accent | brand-dependent |
| `--sov-accent-2` | Secondary accent | brand-dependent |
| `--sov-accent-3` | Tertiary accent | brand-dependent |
| `--sov-text` | Primary text | `#f0f0f5` |
| `--sov-text-muted` | Secondary text | `#707080` |
| `--sov-text-inverse` | Text on accent | `#ffffff` |
| `--sov-success` | Positive state | `#22c55e` |
| `--sov-warning` | Warning state | `#f5a623` |
| `--sov-danger` | Error/destructive | `#e84142` |
| `--sov-glow` | Ambient glow color | brand-dependent |
| `--sov-glass-blur` | Backdrop blur radius | `20px` |
| `--sov-glass-fill` | Glass background alpha | `0.65` |
| `--sov-gradient` | Primary gradient | brand-dependent |

### 7.2 Motion Tokens

| Token | Purpose | Value |
|-------|---------|-------|
| `--sov-speed-instant` | Micro-interactions | `100ms` |
| `--sov-speed-fast` | Hover, toggles | `150ms` |
| `--sov-speed-normal` | Panels, reveals | `300ms` |
| `--sov-speed-slow` | Full transitions | `500ms` |
| `--sov-speed-dramatic` | Hero, cinematic | `800ms` |
| `--sov-ease-default` | Standard easing | `cubic-bezier(0.4, 0, 0.2, 1)` |
| `--sov-ease-spring` | Bounce-in | `cubic-bezier(0.34, 1.56, 0.64, 1)` |
| `--sov-ease-exit` | Exit transitions | `cubic-bezier(0.4, 0, 1, 1)` |
| `--sov-pulse-rhythm` | Living pulse rate | `3s` |
| `--sov-orbit-drift` | Ambient orbit speed | `30s` |
| `--sov-float-period` | Float animation cycle | `6s` |
| `--sov-signal-sweep` | Signal line animation | `2s` |

### 7.3 Layout Tokens

| Token | Purpose | Value |
|-------|---------|-------|
| `--sov-max-width` | Content max width | `1100px` |
| `--sov-max-width-narrow` | Narrow content | `720px` |
| `--sov-max-width-wide` | Wide dashboard | `1440px` |
| `--sov-gap-xs` | Tight spacing | `4px` |
| `--sov-gap-sm` | Small spacing | `8px` |
| `--sov-gap-md` | Standard spacing | `16px` |
| `--sov-gap-lg` | Section spacing | `24px` |
| `--sov-gap-xl` | Major breaks | `48px` |
| `--sov-gap-2xl` | Section padding | `80px` |
| `--sov-radius-xs` | Tight corners | `6px` |
| `--sov-radius-sm` | Button/input radius | `10px` |
| `--sov-radius-md` | Card radius | `16px` |
| `--sov-radius-lg` | Panel radius | `24px` |
| `--sov-radius-full` | Pill/circle | `9999px` |
| `--sov-header-height` | Fixed header | `64px` |
| `--sov-dock-width` | Side dock panel | `360px` |
| `--sov-nav-density` | Nav item spacing | `28px` |

### 7.4 Typography Tokens

| Token | Purpose | Value |
|-------|---------|-------|
| `--sov-font-sans` | Primary typeface | `"Inter", "SF Pro Display", system-ui, sans-serif` |
| `--sov-font-mono` | Code/data typeface | `"JetBrains Mono", "Fira Code", monospace` |
| `--sov-text-xs` | Micro labels | `11px` |
| `--sov-text-sm` | Secondary text | `13px` |
| `--sov-text-md` | Body text | `15px` |
| `--sov-text-lg` | Emphasis text | `18px` |
| `--sov-text-xl` | Section headings | `clamp(1.5rem, 3vw, 2rem)` |
| `--sov-text-2xl` | Page headings | `clamp(2rem, 5vw, 3.5rem)` |
| `--sov-text-display` | Hero headlines | `clamp(2.5rem, 7vw, 5rem)` |
| `--sov-leading-tight` | Heading line height | `1.2` |
| `--sov-leading-normal` | Body line height | `1.6` |
| `--sov-tracking-tight` | Heading tracking | `-0.02em` |
| `--sov-tracking-wide` | Label tracking | `0.1em` |

---

## 8. Component Families

### 8.1 Navigation

| Component | Purpose | Surfaces |
|-----------|---------|----------|
| `sov-header` | Fixed top bar with glass blur | web, dashboard |
| `sov-bubble-nav` | Floating icon navigation | web, mobile |
| `sov-dock` | Slide-in side panel | dashboard, XR |
| `sov-command-bar` | Searchable command palette | all |
| `sov-breadcrumb` | Hierarchical wayfinding | dashboard |
| `sov-tab-rail` | Horizontal tab switching | all |

### 8.2 Content

| Component | Purpose | Surfaces |
|-----------|---------|----------|
| `sov-hero-core` | Single animated focal object | web landing |
| `sov-card` | Glass surface container | all |
| `sov-metric-card` | Single KPI display | dashboard, watch |
| `sov-signal-card` | Live data feed item | dashboard, glasses |
| `sov-proof-strip` | Trust/verification banner | all |
| `sov-module-tile` | Navigation entry to deeper module | web, dashboard |

### 8.3 Action

| Component | Purpose | Surfaces |
|-----------|---------|----------|
| `sov-btn-primary` | Brand gradient CTA | all |
| `sov-btn-secondary` | Glass-bordered secondary action | all |
| `sov-btn-ghost` | Text-only action | all |
| `sov-command-cta` | Large primary action with context | web, dashboard |
| `sov-approve-reject` | Binary decision pair | watch, mobile |
| `sov-status-pill` | Live state indicator | all |

### 8.4 Data

| Component | Purpose | Surfaces |
|-----------|---------|----------|
| `sov-table` | Data grid with sort/filter | dashboard |
| `sov-chart` | Time-series visualization | dashboard |
| `sov-spark` | Inline micro-chart | all |
| `sov-telemetry` | Real-time system health | dashboard, glasses |
| `sov-automation-rail` | Workflow pipeline display | dashboard, XR |

### 8.5 Feedback

| Component | Purpose | Surfaces |
|-----------|---------|----------|
| `sov-toast` | Transient notification | all |
| `sov-skeleton` | Loading placeholder | all |
| `sov-modal` | Focused overlay | web, mobile |
| `sov-tooltip` | Hover context | web, dashboard |
| `sov-alert` | Persistent system state | all |

### 8.6 Agentic

| Component | Purpose | Surfaces |
|-----------|---------|----------|
| `sov-agent-orb` | AI presence indicator | all |
| `sov-workflow-graph` | Agent pipeline visualization | dashboard, XR |
| `sov-memory-trace` | Context/reasoning display | dashboard |
| `sov-tool-rail` | Active tool indicators | dashboard |
| `sov-routing-map` | Model/agent routing display | dashboard, XR |

---

## 9. Brand Skins

One machine. Different blood glow.

### 9.1 UnyKorn — Core Sovereign Ecosystem

```
accent-1:    #3b82f6    (royal electric blue)
accent-2:    #a855f7    (purple)
accent-3:    #ffffff    (white)
glow:        rgba(59, 130, 246, 0.25)
gradient:    linear-gradient(135deg, #3b82f6, #a855f7)
hero-object: Unicorn sigil — orb or constellation
tone:        Sovereign, engineered, foundational
```

### 9.2 xxxiii — Sovereign Intelligence OS

```
accent-1:    #60a5fa    (electric blue)
accent-2:    #fbbf24    (gold)
accent-3:    #f0f0f5    (cold white)
glow:        rgba(96, 165, 250, 0.25)
gradient:    linear-gradient(135deg, #60a5fa, #fbbf24)
hero-object: Intelligence mesh — node constellation
tone:        Sovereign, intelligent, commanding
```

### 9.3 Helios — Solar Capital Infrastructure

```
accent-1:    #f59e0b    (amber gold)
accent-2:    #d97706    (molten gold)
accent-3:    #fbbf24    (bright gold)
glow:        rgba(245, 158, 11, 0.3)
gradient:    linear-gradient(135deg, #f59e0b, #d97706)
hero-object: Solar ring — rotating gold torus
tone:        Institutional, warm, secure
```

### 9.4 NIL33 — Athlete Intelligence

```
accent-1:    #e2e8f0    (silver-white)
accent-2:    #3b82f6    (electric blue)
accent-3:    #8b5cf6    (athletic violet)
glow:        rgba(226, 232, 240, 0.2)
gradient:    linear-gradient(135deg, #e2e8f0, #3b82f6)
hero-object: Performance orb — velocity arcs
tone:        Athletic, precise, elite
```

### 9.5 Y3K Markets — Execution & Signals

```
accent-1:    #10b981    (emerald)
accent-2:    #60a5fa    (ice blue)
accent-3:    #fbbf24    (gold)
glow:        rgba(16, 185, 129, 0.25)
gradient:    linear-gradient(135deg, #10b981, #60a5fa)
hero-object: Signal grid — live execution matrix
tone:        Fast, precise, profitable
```

### Shared Across All Skins

```
bg:              #0a0a0f
bg-alt:          #0f0f18
surface:         rgba(22, 22, 30, 0.65)
surface-solid:   #16161e
border:          rgba(255, 255, 255, 0.06)
text:            #f0f0f5
text-muted:      #707080
success:         #22c55e
warning:         #f5a623
danger:          #e84142
font-sans:       Inter, SF Pro Display, system-ui
font-mono:       JetBrains Mono, Fira Code, monospace
```

---

## 10. Device Adaptation Rules

### Desktop Web
- Rich spatial overview with full module depth
- Max width: `--sov-max-width-wide` (1440px)
- Full navigation bar + command palette
- Side dock panel for details
- Multi-column grids (2–4 columns)
- Full animation suite

### Mobile Web / Native
- Simplified vertical flow
- Max width: 100vw, padding: 16px
- Bottom tab navigation or hamburger
- Thumb-first interaction zones
- Single primary CTA per screen
- Progressive reveal via accordion/sheets
- Reduced animation (respect `prefers-reduced-motion`)

### Dashboard / Operations
- Wide layout: `--sov-max-width-wide`
- Persistent sidebar navigation
- Multi-panel workspace
- Real-time telemetry surfaces
- Table-heavy data views
- Automation rail visible
- Agent/workflow overlays

### Watch
- Glanceable: one metric, one status, one action
- Maximum 3 tappable elements per screen
- Radial/circular UI where native
- Status pills, alert badges
- Approve/reject/verify binary actions
- Proof snapshot (hash + timestamp)
- No text blocks, no scroll

### Smart Glasses
- Ambient overlay: 30% screen opacity max
- Live status in peripheral vision
- Route/navigation guidance
- Alert priority filtering (critical only by default)
- Voice-first interaction model
- Minimal text, maximum iconography
- Hands-light operational cues

### XR / VR
- Spatial 3D module clusters
- Constellation navigation (nodes in space)
- Immersive portfolio/asset landscape
- Workflow pipeline as physical space
- Agent orbs as interactive 3D objects
- Natural gesture controls (grab, point, dismiss)
- Depth as information hierarchy
- Comfort zone: content at 1–3m virtual distance

### AI Agent Console
- Terminal-inspired with glass treatment
- Real-time stream of agent reasoning
- Tool usage rail with live indicators
- Memory/context panel
- Workflow graph overlay
- Human override controls always visible
- Trust indicators for every agent action

---

## 11. Interaction Principles

1. **Every screen has a clear primary action.** One CTA dominates. Supporting actions are secondary.

2. **Show complexity progressively.** Layer 1 is simple. Each tap reveals more.

3. **Surface power through behavior, not clutter.** Don't show 40 buttons. Show 3 that do everything.

4. **Let users enter quickly, understand quickly, act quickly.** Time-to-value under 3 seconds.

5. **Show live states.** Active routes, proof, automation status, system health — always visible.

6. **Transitions are smooth and spatial.** Content slides, fades, docks. Nothing teleports.

7. **No overcrowded navigation.** 5–7 top-level items maximum, ever.

8. **No overwhelming control surfaces.** If it feels like a cockpit, simplify.

9. **No unnecessary chrome.** If an element doesn't help the user decide or act, remove it.

---

## 12. Visual Language

### Backgrounds
- Deep black spatial fields (`#0a0a0f`)
- Subtle radial gradients for depth (brand colors at 10–15% opacity)
- Optional: slow-rotating gradient underlays (30s+ cycle)

### Glass
- Selective application: cards, headers, modals
- Backdrop blur: 20px standard
- Fill opacity: 0.5–0.75
- Border: 1px solid rgba(255,255,255,0.06)
- Hover: border glows to brand accent

### Glow
- Used for: focus states, active elements, status indicators
- Never: backgrounds, large areas, multiple simultaneous
- Box-shadow at 0.15–0.3 opacity of brand accent

### Motion
- Float: 6s ease-in-out infinite (hero objects)
- Pulse: 3s ease-in-out infinite (status indicators)
- Reveal: 0.7s ease-out (scroll-triggered sections)
- Hover: 0.15s translateY(-2px)
- Panel transitions: 0.35s cubic-bezier(0.4, 0, 0.2, 1)
- Ambient: 30s+ linear infinite (orbit, drift)

### Particles / Energy
- Sparse particle fields (20–30 particles max)
- Upward drift, slow fade
- Brand accent color at 0.4–0.6 opacity
- Decorative only — never block content

---

## 13. Narrative Templates

Every site/app uses these content slots:

### Hero Headline
`[Brand] — [One-line identity statement]`
Example: "UnyKorn — The sovereign ecosystem layer"

### Value Proposition
One sentence. What the user gets. No jargon.
Example: "Create, manage, and verify real-world digital assets across chains."

### Trust Strip
Badges + live indicators that establish credibility.
Example: `🟢 Live · 43,114 chain ID · Verified · Audited`

### Action Strip
1–2 primary CTAs. One gradient, one glass.
Example: `[Launch App]  [View Docs]`

### Proof Strip
Hash, timestamp, block height, verification badge.
Example: `Latest block: #4,291,033 · 2s ago · 0xa3f2...8c1b`

### Module Descriptions
`[Module Name] — [One sentence purpose]`
Example: "Treasury — Monitor positions, deploy capital, verify settlements."

---

## 14. Emotional Outcome

Every interface should feel like:

| Attribute | Meaning |
|-----------|---------|
| **Calm** | Not anxious, not urgent, not screaming |
| **Powerful** | You can feel the capability underneath |
| **Expensive** | Premium craft, not template energy |
| **Credible** | Real, verified, institutional-grade |
| **Clear** | No confusion about what you're looking at |
| **Alive** | Something is happening, the system is awake |
| **Inevitable** | This is the future and it already works |

---

## 15. Liquid Glass Material System

Glass is the core material metaphor. It is a tool, not wallpaper.

See `tokens/liquid-glass.css` for the full implementation.

### Glass Density Scale

| Level | Fill | Blur | Use |
|-------|------|------|-----|
| **Thin** | 0.35 | 8px | Nav overlays, tooltips, peripheral |
| **Standard** | 0.55 | 20px | Cards, panels, modules |
| **Thick** | 0.75 | 40px | Elevated surfaces, active panels |
| **Frosted** | 0.92 | 60px | Full overlays, docks, headers |

### Depth Layers

| Layer | Class | Purpose |
|-------|-------|---------|
| 0 | `.sov-depth-0` | Background void — transparent |
| 1 | `.sov-depth-1` | Far layer — subtle glass |
| 2 | `.sov-depth-2` | Mid layer — standard glass |
| 3 | `.sov-depth-3` | Near layer — thick, prominent |
| Focus | `.sov-depth-focus` | Active surface — glowing border |

### The Visual Law

The UI should feel like a polished black mirror with living depth.

- Not a dashboard. Not a SaaS admin panel. Not a noisy sci-fi toy.
- A premium operating membrane.
- A spatial command surface.
- A calm intelligent object that already knows what matters.
- Bubbles should feel like **portals with gravity**, not decorations.

---

## 16. File Structure

```
design-system/
├── SPEC.md                       ← This file
├── DOCTRINE.md                   ← The constitution — laws, tests, rules
├── BRAND-FOCUS.md                ← 6-field focus cards per brand
├── ADAPTIVE.md                   ← Device behavior & self-adjusting rules
├── tokens/
│   ├── sovereign.css             ← Base design tokens (CSS custom properties)
│   ├── liquid-glass.css          ← Liquid glass material system
│   ├── brands/
│   │   ├── unykorn.css           ← UnyKorn skin overrides
│   │   ├── xxxiii.css            ← xxxiii skin overrides
│   │   ├── helios.css            ← Helios skin overrides
│   │   ├── nil33.css             ← NIL33 skin overrides
│   │   └── y3k.css               ← Y3K Markets skin overrides
│   └── tokens.json              ← Machine-readable token export
├── components/
│   ├── README.md                 ← Component implementation guide
│   └── liquid-glass.css          ← Prebuilt glass component classes
└── prompts/
    ├── master.prompt.md          ← The universal generation prompt
    ├── website.prompt.md         ← Website surface prompt
    ├── dashboard.prompt.md       ← Dashboard surface prompt
    ├── mobile.prompt.md          ← Mobile surface prompt
    ├── watch.prompt.md           ← Watch surface prompt
    ├── glasses.prompt.md         ← Smart glasses surface prompt
    ├── xr.prompt.md              ← XR/VR surface prompt
    └── agent-console.prompt.md   ← AI agent console prompt
```

---

_This is a living document. Update as the system evolves._
_See DOCTRINE.md for the law. Every commit, every component, every pixel obeys it._
