# SOVEREIGN — Watch Surface Prompt

> Append after `master.prompt.md`. Add brand skin last.

---

```text
## Surface: Watch (Apple Watch / Wear OS)

Glanceable. One metric, one status, one action per screen.

### Layout Principles

- Circular or rounded-rect safe area
- Maximum 3 tappable elements per screen
- No scrolling text blocks
- Large text: minimum 16pt for values, 11pt for labels
- High contrast: text on pure dark background

### Screen Templates

#### Complication (Watch Face)
Single data point visible at all times:
- Portfolio value, or
- System status pill (● Live / ◐ Syncing / ✕ Down), or
- Last block number

#### Glance Screen
```
┌─────────────────┐
│   PORTFOLIO      │
│   $4,291,033     │
│   ▲ 12.4%        │
│                   │
│   ● 5/5 nodes    │
│                   │
│   [Open App]      │
└─────────────────┘
```

#### Alert Screen
```
┌─────────────────┐
│   ⚠ ALERT        │
│                   │
│   Node delta      │
│   offline         │
│                   │
│  [Dismiss] [View] │
└─────────────────┘
```

#### Approve/Reject Screen
```
┌─────────────────┐
│   TRANSACTION     │
│                   │
│   Send 1,000 UNY  │
│   → 0xa3f2...     │
│                   │
│   [✓]       [✕]   │
└─────────────────┘
```

#### Proof Snapshot
```
┌─────────────────┐
│   LAST PROOF      │
│                   │
│   #4,291,033      │
│   0xa3...8c1b     │
│   2s ago          │
│                   │
│   ✓ Verified      │
└─────────────────┘
```

### Interaction

- Crown/dial: scroll between screens
- Tap: primary action
- Double tap: secondary action
- Force press / long press: context menu
- Haptic feedback on all actions

### Color Usage

- Background: pure black (#000000) for OLED battery
- Text: white (#ffffff)
- Accent: brand accent-1 for indicators and active states
- Success/danger for approve/reject only

### Notifications

- Short look: icon + one-line summary
- Long look: icon + title + body + action buttons
- Priority filtering:
  - Critical: alerts, failures, approvals → always deliver
  - Normal: transactions, status changes → deliver silently
  - Low: informational → batch

### Complications

Support these complication families:
- **Graphic circular**: progress ring (node health %)
- **Modular small**: single metric value
- **Utilitarian small**: status text
- **Graphic corner**: trend sparkline
```
