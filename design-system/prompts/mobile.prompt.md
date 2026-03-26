# SOVEREIGN — Mobile Surface Prompt

> Append after `master.prompt.md`. Add brand skin last.

---

```text
## Surface: Mobile App (iOS / Android)

Action-first execution shell. Simplified vertical flow.

### Layout Principles

- Full device width, safe-area insets respected
- Vertical single-column flow
- Thumb-first interaction: primary actions bottom half of screen
- Card stack architecture: each screen is one primary card

### Navigation

Bottom tab bar (5 items max):
```
  [Home]  [Wallet]  [Execute]  [Monitor]  [More]
```

- Active tab: accent-1 fill + label
- Inactive: muted icon, no label
- Tab bar: glass surface, 56px height

**More** opens full-screen module list grouped by family.

### Screen Templates

#### Home Screen
```
┌──────────────────────┐
│  Brand Logo  ● Live  │
│                      │
│  ┌────────────────┐  │
│  │  Portfolio $    │  │
│  │  ▲ 12.4%       │  │
│  └────────────────┘  │
│                      │
│  ┌──────┐ ┌──────┐  │
│  │ KPI  │ │ KPI  │  │
│  └──────┘ └──────┘  │
│                      │
│  Recent Activity     │
│  ─────────────────   │
│  Signal card         │
│  Signal card         │
│  Signal card         │
│                      │
│  [Primary Action]    │
│                      │
│  ─ ─ ─ Tab Bar ─ ─  │
└──────────────────────┘
```

#### Action Screen
- Single focused task per screen
- Large primary CTA at bottom
- Back arrow top-left
- Progress indicator if multi-step
- Confirmation via bottom sheet, not modal

#### Monitor Screen
- 4 metric cards stacked 2×2
- Scrollable signal feed below
- Pull-to-refresh
- Status pills inline with each item

### Gestures

- Swipe left on signal card → quick action (dismiss, archive)
- Swipe right → detail view
- Pull down → refresh
- Long press → context menu (copy, share, verify)

### Progressive Reveal

- Default view: summary (1 card, 2 KPIs, 3 recent items)
- Tap "See all" → expanded list
- Tap item → detail sheet (slides up from bottom)
- Detail sheet has: metadata, actions, proof, history

### Touch Targets

- Minimum 44×44px for all interactive elements
- 8px gap between adjacent targets minimum
- Primary CTA: full width, 56px height, bottom-docked

### Performance

- 60fps scroll target
- Images: thumbnails only, lazy load detail
- Data: paginate lists (20 items per load)
- Offline: cache last-known state, show stale indicator
- Skeleton loading for all data-dependent views

### Haptics

- Success: light impact
- Error: notification feedback
- Approve/reject: medium impact
- Navigation: selection tick
```
