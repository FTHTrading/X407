# SOVEREIGN — Smart Glasses Surface Prompt

> Append after `master.prompt.md`. Add brand skin last.

---

```text
## Surface: Smart Glasses (AR Overlay)

Ambient, contextual, hands-light. Information in peripheral vision.

### Layout Principles

- Overlay on real-world view: max 30% screen opacity
- Content positioned in comfortable gaze zones (center-right, bottom-right)
- No full-screen takeover except critical alerts
- Horizontal cards anchored to fixed gaze positions
- Text: minimum 14pt, high contrast outlines

### Display Zones

```
┌─────────────────────────────────────────┐
│                                         │
│                        ┌─────────────┐  │
│                        │ Status HUD  │  │
│                        │ ● 5/5 Live  │  │
│                        │ $4.29M      │  │
│                        └─────────────┘  │
│                                         │
│                                         │
│                                         │
│  ┌──────────────────────────────┐       │
│  │  ⚠ Node delta: CPU 92%      │       │
│  └──────────────────────────────┘       │
│                                         │
└─────────────────────────────────────────┘
```

- **Top-right**: persistent status HUD (node count, portfolio, system state)
- **Bottom-left**: alerts and notifications (auto-dismiss 5s)
- **Center**: activated on voice command or gesture only

### Screen Templates

#### Persistent HUD
- Status pill: ● Live / ✕ Down
- Key metric: portfolio value or block height
- Node count: X/Y healthy
- Compact: 3 lines max, semi-transparent background

#### Alert Overlay
- Slides in from bottom-left
- One-line summary
- Color-coded left border (danger/warning/info)
- Auto-dismiss or voice-dismiss ("OK" / "Dismiss")

#### Navigation Guidance
- Arrow or path overlay for physical navigation
- "Walk to server room B" with directional indicator
- Contextual: only appears when relevant

#### Live Data Overlay
- Activated by voice: "Show treasury" / "Show node status"
- Displays 2-4 metric cards in floating panel
- Dismiss: "Close" or look-away timeout (10s)

### Interaction Model

Primary: **Voice**
- "Show status"
- "Approve transaction"
- "What's the latest block?"
- "Alert me if CPU exceeds 90%"

Secondary: **Gesture**
- Air tap: select highlighted item
- Swipe right: dismiss
- Pinch: zoom data view
- Head nod: confirm

### Visual Rules

- Semi-transparent glass backgrounds (0.3–0.5 opacity)
- No gradients (reduces readability on real-world backgrounds)
- Solid accent color for indicators
- High-contrast text with subtle drop shadow
- Minimal iconography: status dots, directional arrows only
- No particles, no ambient motion, no decorative elements

### Priority Filtering

- **Level 1 (Always show)**: system down, critical alerts, approval requests
- **Level 2 (On request)**: metrics, portfolio, status
- **Level 3 (Batch)**: informational, non-urgent updates

### Power Management

- HUD refresh: every 30s (not real-time)
- Alerts: push-triggered, instant
- Data overlays: on-demand only, dismiss after 10s idle
- Minimize rendering: static text preferred over animated
```
