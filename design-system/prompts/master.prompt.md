# SOVEREIGN — Prompt Constitution v2.0

> **The index.** This file composes the 5-layer prompt stack.
> It replaces the monolithic v1.1 master prompt with a clean command chain.

---

## The Stack

```
┌─────────────────────────────────────────────────┐
│  A  CONSTITUTION   What we are. What we never   │
│                    become. The highest law.      │
├─────────────────────────────────────────────────┤
│  B  GOVERNOR       The 8-gate filter. Nothing   │
│                    gets built without passing.   │
├─────────────────────────────────────────────────┤
│  C  BUILDER        The architect. Shell, glass,  │
│                    components, devices, code.    │
├─────────────────────────────────────────────────┤
│  D  BRAND SKIN     The clothing. Palette, voice, │
│                    emphasis. Nothing structural. │
├─────────────────────────────────────────────────┤
│  E  FEATURE REVIEW The drift detector. 7-point  │
│                    check before anything ships.  │
└─────────────────────────────────────────────────┘
```

Each layer has its own file. Load what you need for the task at hand.

## Files

| Layer | File | When to load |
|-------|------|-------------|
| A | [constitution.prompt.md](constitution.prompt.md) | Always — every generation starts here |
| B | [governor.prompt.md](governor.prompt.md) | Before approving any new feature or module |
| C | [builder.prompt.md](builder.prompt.md) | When generating code, layouts, or components |
| D | [brand-skin.prompt.md](brand-skin.prompt.md) | When applying a specific brand identity |
| E | [feature-review.prompt.md](feature-review.prompt.md) | Before shipping any new feature |

## Surface Prompts

After loading the constitution stack, append a surface-specific prompt:

| Surface | File | Target |
|---------|------|--------|
| Website | [website.prompt.md](website.prompt.md) | Marketing / landing pages |
| Dashboard | [dashboard.prompt.md](dashboard.prompt.md) | Data / control surfaces |
| Mobile | [mobile.prompt.md](mobile.prompt.md) | Phone-optimized UI |
| Watch | [watch.prompt.md](watch.prompt.md) | Wrist / glance interface |
| Glasses | [glasses.prompt.md](glasses.prompt.md) | HUD / AR overlay |
| XR | [xr.prompt.md](xr.prompt.md) | Spatial / VR interface |
| Agent Console | [agent-console.prompt.md](agent-console.prompt.md) | AI agent workspace |

## Composition Formulas

**Generate a website:**
```
constitution + builder + brand-skin(unykorn) + website
```

**Generate a dashboard:**
```
constitution + builder + brand-skin(xxxiii) + dashboard
```

**Approve a new feature:**
```
constitution + governor + feature-review
```

**Generate a mobile app:**
```
constitution + builder + brand-skin(y3k) + mobile
```

**Full review cycle:**
```
constitution + governor → approved? → builder + brand-skin + surface → feature-review → ship
```

## Brand Quick-Reference

| Brand | data-brand | Accent | Glow | Core offer |
|-------|-----------|--------|------|------------|
| UnyKorn | unykorn | #3b82f6 | #a855f7 | Sovereign ecosystem layer |
| xxxiii | xxxiii | #60a5fa | #fbbf24 | Intelligence OS |
| Helios | helios | #f59e0b | #d97706 | Gold-backed product |
| NIL33 | nil33 | #3b82f6 | #8b5cf6 | Athlete valuation engine |
| Y3K | y3k | #10b981 | #60a5fa | Signals & routing |

## Companion Documents

| Document | Purpose |
|----------|---------|
| [SPEC.md](../SPEC.md) | Full design system specification |
| [DOCTRINE.md](../DOCTRINE.md) | Laws, tests, intelligence rules |
| [BRAND-FOCUS.md](../BRAND-FOCUS.md) | 6-field focus cards per brand |
| [ADAPTIVE.md](../ADAPTIVE.md) | Device behavior ruleset |

## Token & Component Files

| File | Purpose |
|------|---------|
| [sovereign.css](../tokens/sovereign.css) | Base CSS custom properties |
| [liquid-glass.css](../tokens/liquid-glass.css) | Glass material system |
| [components/liquid-glass.css](../components/liquid-glass.css) | Component classes |
| [tokens/brands/*.css](../tokens/brands/) | Brand skin overrides |
| [tokens.json](../tokens/tokens.json) | Machine-readable token export |

---

## The Rule

> We do not ship one giant blob. We ship a command stack.
> Each layer has one job. Together they build anything.
