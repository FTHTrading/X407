# Sovereign Design System — Component Implementation Guide

> **Version:** 1.0.0
> **Updated:** 2026-03-15

---

## Architecture

Every component uses SOVEREIGN tokens from `tokens/sovereign.css` and inherits brand overrides from `tokens/brands/*.css`. Components never hardcode colors, spacing, or motion values — they reference tokens exclusively.

### Naming Convention

All components are prefixed `sov-` to avoid collisions:

```
sov-{family}-{component}[-{variant}]

Examples:
  sov-nav-header
  sov-content-card--elevated
  sov-action-btn--primary
  sov-data-metric
  sov-feedback-toast--success
  sov-agent-orb
```

---

## Component Families

### 1. Navigation (`sov-nav-*`)

#### `sov-nav-header`
Fixed top bar. Glass blur background. Logo left, nav center, primary action right.

```
┌─────────────────────────────────────────────────────────────┐
│  [Logo]     Home  Platform  Modules  Docs     [Connect]    │
└─────────────────────────────────────────────────────────────┘
```

**Tokens used:** `--sov-header-height`, `--sov-glass-blur`, `--sov-surface`, `--sov-border`, `--sov-z-header`
**States:** default, scrolled (elevated shadow), mobile (hamburger)
**Breakpoint:** < 768px → hamburger menu

#### `sov-nav-bubble`
Floating circular icon navigation. 5–7 items max. Positioned fixed bottom-center (mobile) or right-center (desktop).

**Tokens used:** `--sov-radius-full`, `--sov-shadow-glow`, `--sov-z-dock`
**States:** default, active (glow ring), expanded (labels visible)

#### `sov-nav-dock`
Slide-in side panel from right. Contains contextual detail, settings, or sub-navigation.

**Tokens used:** `--sov-dock-width`, `--sov-z-dock`, `--sov-speed-normal`, `--sov-ease-default`
**States:** closed, open, minimized (icon-only strip)

#### `sov-nav-command`
Full-screen command palette. Search → filter → execute. Keyboard shortcut: `Cmd+K` / `Ctrl+K`.

**Tokens used:** `--sov-z-command`, `--sov-max-width-narrow`, `--sov-speed-fast`
**States:** closed, open (focused search), results visible

#### `sov-nav-sidebar`
Persistent left sidebar for dashboard/operations views.

**Tokens used:** `--sov-sidebar-width`, `--sov-z-dock`
**States:** expanded (labels), collapsed (icons only), mobile (overlay)

---

### 2. Content (`sov-content-*`)

#### `sov-content-hero`
Full-viewport hero section. One focal object, one headline, one value prop, one CTA.

```
┌─────────────────────────────────────────┐
│                                         │
│          [Animated Hero Object]         │
│                                         │
│    ● Live on [Network]                  │
│                                         │
│    Brand Name                           │
│    One sentence value proposition.      │
│                                         │
│    [Primary CTA]  [Secondary CTA]       │
│                                         │
└─────────────────────────────────────────┘
```

**Tokens used:** `--sov-text-display`, `--sov-gradient`, `--sov-glow`, `--sov-float-period`
**Required elements:** hero-object, badge, headline, subtitle, action-pair
**Background:** subtle radial gradients (brand accent at 10–15% opacity) + particle field

#### `sov-content-card`
Glass surface container for any content block.

**Variants:**
- `--default`: standard glass card
- `--elevated`: solid background + larger shadow
- `--interactive`: hover lift + glow border
- `--compact`: reduced padding (16px)

**Tokens used:** `--sov-radius-md`, `--sov-surface`, `--sov-glass-blur`, `--sov-border`, `--sov-border-glow`

#### `sov-content-metric`
Single KPI display card.

```
┌──────────────────┐
│  LABEL           │
│  $4,291,033      │
│  ▲ 12.4%         │
└──────────────────┘
```

**Tokens used:** `--sov-text-xs` (label), `--sov-text-xl` (value), `--sov-success`/`--sov-danger` (delta)
**Variants:** `--compact` (horizontal), `--spark` (with inline chart)

#### `sov-content-signal`
Live data feed item. Shows event, timestamp, status.

```
┌──────────────────────────────────────┐
│  ● Block #4,291,033    2s ago        │
│    validator: alpha    gas: 21,000   │
└──────────────────────────────────────┘
```

**Tokens used:** `--sov-font-mono`, `--sov-text-sm`, `--sov-success`
**Behavior:** New items fade in from top, stack scrolls

#### `sov-content-proof`
Trust/verification strip or inline block.

```
┌──────────────────────────────────────────────────┐
│  ✓ Verified  │  0xa3f2...8c1b  │  Block 4.29M   │
└──────────────────────────────────────────────────┘
```

**Tokens used:** `--sov-font-mono`, `--sov-text-xs`, `--sov-success`, `--sov-border`
**Variants:** `--strip` (full-width bar), `--inline` (within card), `--badge` (small pill)

#### `sov-content-module-tile`
Navigation entry to a deeper module. Icon + name + one-line description.

**Tokens used:** `--sov-radius-md`, `--sov-gap-md`, `--sov-text-lg`
**States:** default, hover (lift + glow), active (accent border-left)

---

### 3. Action (`sov-action-*`)

#### `sov-action-btn`
**Variants:**
- `--primary`: brand gradient background, white text, glow shadow
- `--secondary`: glass background, accent border, muted text
- `--ghost`: no background, text only
- `--danger`: danger color background
- `--sm` / `--lg`: size modifiers

**Shared behavior:** hover lifts 2px, focus-visible shows accent outline
**Tokens used:** `--sov-gradient`, `--sov-radius-sm`, `--sov-speed-fast`

#### `sov-action-command-cta`
Large primary action block with context/description.

```
┌───────────────────────────────────────┐
│  Launch Treasury Dashboard            │
│  Monitor positions and deploy capital │
│                          [Open →]     │
└───────────────────────────────────────┘
```

#### `sov-action-approve-reject`
Binary decision pair. Optimized for watch/mobile.

```
  [✓ Approve]    [✕ Reject]
```

**Tokens used:** `--sov-success`, `--sov-danger`, `--sov-radius-full`

#### `sov-action-status-pill`
Inline state indicator.

```
  ● Live    ○ Pending    ✕ Error    ◐ Syncing
```

**Tokens used:** semantic colors, `--sov-radius-full`, `--sov-text-xs`

---

### 4. Data (`sov-data-*`)

#### `sov-data-table`
Sortable/filterable data grid. Glass header row, clean alternating rows.

**Tokens used:** `--sov-font-mono` (data cells), `--sov-border`, `--sov-surface-hover`
**Features:** sticky header, sort indicators, row hover highlight

#### `sov-data-chart`
Time-series visualization container. Chart library agnostic — wraps any renderer.

**Tokens used:** accent colors for series, `--sov-border` for axes, `--sov-text-muted` for labels

#### `sov-data-spark`
Inline micro-chart. 40–80px wide, no labels, no axes. Pure trend line.

**Tokens used:** `--sov-accent-1` (up trend), `--sov-danger` (down trend)

#### `sov-data-telemetry`
Real-time system health panel.

```
┌──────────────────────────────────────┐
│  CPU   ██████░░░░  62%               │
│  MEM   ████░░░░░░  41%               │
│  NET   ███████░░░  73%               │
│  DISK  ██░░░░░░░░  19%               │
└──────────────────────────────────────┘
```

#### `sov-data-automation-rail`
Horizontal workflow pipeline.

```
  [Trigger] → [Validate] → [Execute] → [Verify] → [Complete]
       ✓           ✓           ●           ○           ○
```

**Tokens used:** `--sov-success` (done), `--sov-accent-1` (active), `--sov-text-faint` (pending)

---

### 5. Feedback (`sov-feedback-*`)

#### `sov-feedback-toast`
Transient notification. Top-right stack. Auto-dismiss 5s.

**Variants:** `--success`, `--warning`, `--danger`, `--info`
**Tokens used:** semantic colors, `--sov-z-toast`, `--sov-speed-normal`

#### `sov-feedback-skeleton`
Loading placeholder. Matches target element dimensions.

**Tokens used:** `--sov-border`, `--sov-radius-xs`

#### `sov-feedback-modal`
Focused overlay. Glass backdrop, centered content.

**Tokens used:** `--sov-z-modal`, `--sov-max-width-narrow`, `--sov-speed-normal`

#### `sov-feedback-alert`
Persistent system state banner. Dismissible or permanent.

**Tokens used:** semantic color left border, `--sov-surface`, `--sov-radius-sm`

---

### 6. Agentic (`sov-agent-*`)

#### `sov-agent-orb`
Floating AI presence indicator. Pulsing orb with brand glow. Tappable to expand agent panel.

**States:** idle (slow pulse), active (rapid pulse + trails), speaking (ripple)
**Tokens used:** `--sov-glow`, `--sov-pulse-rhythm`, `--sov-radius-full`
**Size:** 32px idle, 48px active

#### `sov-agent-workflow`
DAG/pipeline visualization of agent steps.

**Tokens used:** `--sov-accent-1` (edges), semantic colors (node status)
**Features:** zoom, pan, node click for detail

#### `sov-agent-memory`
Context/reasoning trace panel. Shows what the agent knows and why.

**Tokens used:** `--sov-font-mono`, `--sov-text-sm`, `--sov-surface`
**Features:** collapsible sections, search, copy

#### `sov-agent-tool-rail`
Horizontal strip showing active tools.

```
  [Search ✓]  [Code ●]  [Deploy ○]  [Verify ○]
```

#### `sov-agent-routing`
Model/agent routing visualization. Which model, which path, which fallback.

**Tokens used:** `--sov-accent-1` (active route), `--sov-text-faint` (inactive)

---

## Implementation Notes

### React Component Pattern

```tsx
interface SovCardProps {
  variant?: 'default' | 'elevated' | 'interactive' | 'compact';
  children: React.ReactNode;
  className?: string;
}

export function SovCard({ variant = 'default', children, className }: SovCardProps) {
  return (
    <div className={`sov-content-card sov-content-card--${variant} ${className ?? ''}`}>
      {children}
    </div>
  );
}
```

### Brand Application

Apply brand at the root element:

```tsx
// Set brand at app root
<div data-brand="unykorn">
  <App />
</div>

// Or dynamically
document.documentElement.setAttribute('data-brand', 'helios');
```

### Token Usage Rule

**Never hardcode values.** Always reference tokens:

```css
/* ✗ Wrong */
.my-card { border-radius: 16px; background: rgba(22, 22, 30, 0.65); }

/* ✓ Correct */
.my-card { border-radius: var(--sov-radius-md); background: var(--sov-surface); }
```

---

_Components are deliberately pattern-level, not pixel-perfect. Implementation adapts to framework (React, Svelte, native) while preserving the token-driven behavior._
