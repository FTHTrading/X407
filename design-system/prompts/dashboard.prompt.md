# SOVEREIGN — Dashboard Surface Prompt

> Append after `master.prompt.md`. Add brand skin last.

---

```text
## Surface: Dashboard / Operations Console

This is the operational layer. It must orient, inform, and enable action.

### Layout

Wide layout: max-width 1440px.
Three-zone structure:

```
┌──────────┬───────────────────────────────┬──────────┐
│          │                               │          │
│ Sidebar  │       Main Content Area       │   Dock   │
│  240px   │         flex-1                │  360px   │
│          │                               │ (toggle) │
│          │                               │          │
└──────────┴───────────────────────────────┴──────────┘
```

### Sidebar (Left)

- Persistent, collapsible (icons-only at 60px)
- Brand logo at top
- Module navigation grouped by family:
  - Core: Home, Platform
  - Intelligence: Signals, Analytics
  - Execution: Deploy, Automate
  - Capital: Treasury, Wallet
  - Trust: Proof, Audit
  - Agentic: Agents, Workflows
- Active item: accent-1 left border + text color
- Muted icons, highlighted on active
- Bottom: user avatar + settings gear

### Main Content Area

- Header bar: page title, breadcrumb, search, notifications bell
- Content organized as:
  - Top row: 4 metric cards (KPIs)
  - Middle: primary data surface (table, chart, or workflow)
  - Bottom: secondary panels (signals feed, recent activity)
- All content in glass cards
- Spacing: 16px gap between cards, 24px section breaks

### Dock Panel (Right)

- Toggle-able via click or keyboard shortcut
- Shows contextual detail for selected item
- Sections: summary, metadata, actions, history
- Glass surface, slide-in animation (300ms ease-default)
- Close button top-right

### Required Components

- sov-nav-sidebar with module family grouping
- sov-content-metric × 4 across top
- sov-data-table as primary data surface
- sov-content-signal as activity feed
- sov-data-telemetry for system health
- sov-data-automation-rail for active workflows
- sov-agent-orb in bottom-right corner (AI assistant access)
- sov-action-status-pill throughout for live states
- sov-feedback-toast for operation confirmations
- sov-nav-command (Ctrl+K) for rapid navigation

### Real-time Behavior

- Metric cards update live (WebSocket or polling)
- Signal feed auto-scrolls with new items fading in
- Status pills reflect current state without page reload
- Telemetry bars animate value changes smoothly
- Agent orb pulses when AI has recommendations

### Mobile Adaptation

- Sidebar collapses to bottom tab bar (5 items max)
- Dock becomes full-screen overlay sheet
- Metric cards stack 2×2 then 1×4
- Table becomes card list with swipe actions
- Command palette remains full-screen
```
