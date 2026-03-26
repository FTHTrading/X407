# Adaptive Behavior Ruleset

> The system is not static. It is a living resolver.

---

## Core Principle

The interface reshapes itself automatically based on 8 signals:

| # | Signal | Detection | Effect |
|---|--------|-----------|--------|
| 1 | **Who** the user is | Wallet address, session, role | Module visibility, permission gates, narration depth |
| 2 | **What** they are trying to do | Route, URL, interaction history | Primary action emphasis, suggested next steps |
| 3 | **Which device** they are on | Viewport, UA, input mode | Layout mode, interaction model, animation level |
| 4 | **Which module** matters most | Frequency, urgency, state | Module priority ordering, dock default |
| 5 | **Which chain rails** are relevant | Connected wallet chain, available routes | Chain-specific actions, relevant pool/contract surfaces |
| 6 | **What proof** is available | On-chain state, attestation cache | Proof strip content, verification badges |
| 7 | **Whether the AI should speak** | Complexity level, first visit, error state | Agent orb visibility, narration activation |
| 8 | **What to hide** | Empty states, locked features, irrelevant modules | Progressive reveal, module suppression |

---

## Device Modes

### Desktop (`viewport >= 1024px`)

```
Layout:         full spatial field
Navigation:     top header + optional sidebar
Dock:           side panel (right, 360px)
Columns:        2–4 grid
Animation:      full suite
Proof panels:   inline, expanded
AI surface:     dock panel or overlay
Max width:      1440px (--sov-max-width-wide)
Input model:    pointer + keyboard
```

**Behavior:**
- Show all relevant module tiles
- Enable command palette (Cmd/Ctrl+K)
- Side dock opens on card click
- Multi-surface context (proof + telemetry visible simultaneously)
- Full animation suite active

### Tablet (`768px <= viewport < 1024px`)

```
Layout:         compressed spatial
Navigation:     top header, collapsible sidebar
Dock:           bottom sheet (full width)
Columns:        2 grid
Animation:      reduced cycle count
Proof panels:   collapsed by default
AI surface:     bottom sheet
Max width:      100vw, padding 24px
Input model:    touch + pointer
```

**Behavior:**
- Sidebar collapses to icon rail
- Cards stack to 2 columns
- Dock converts to bottom sheet
- Long-press for context actions
- Animations run but with fewer particles

### Mobile (`viewport < 768px`)

```
Layout:         single column vertical flow
Navigation:     bottom tab bar (5 items max) or hamburger
Dock:           full-screen sheet (swipe down to dismiss)
Columns:        1
Animation:      minimal — float and fade only
Proof panels:   inline pill, expandable
AI surface:     floating action button → full sheet
Max width:      100vw, padding 16px
Input model:    touch only
```

**Behavior:**
- Fewer bubbles, larger touch targets (min 44px)
- Tighter text, reduced whitespace
- Narration-first: AI can summarize screens
- Bottom dock for primary navigation
- Single primary CTA per visible screen
- Progressive reveal via accordion and sheets
- Swipe gestures for navigation between modules
- Respect `prefers-reduced-motion`

### Watch (`viewport < 200px` or WatchOS/WearOS)

```
Layout:         single card per screen
Navigation:     swipe or crown scroll
Dock:           none
Columns:        1
Animation:      pulse only
Proof panels:   hash + timestamp badge
AI surface:     voice prompt
Max width:      device screen
Input model:    tap + crown + voice
```

**Behavior:**
- Maximum 3 tappable elements per screen
- Glanceable: one metric, one status, one action
- Approve/reject/verify binary actions only
- Pulse states for live indicators
- Short AI summaries (< 20 words)
- Radial/circular UI where native
- No text blocks, no scrollable lists

### Smart Glasses (AR overlay)

```
Layout:         HUD overlay zones
Navigation:     voice + gaze + head tilt
Dock:           none (context follows gaze)
Columns:        n/a
Animation:      fade only, 0.3s max
Proof panels:   floating badge
AI surface:     voice-first + floating whisper text
Max opacity:    30% screen coverage
Input model:    voice + gesture + gaze
```

**Behavior:**
- Almost no text (icons + numbers only)
- Strong contrast (white on transparent dark)
- One task at a time — never multiple panels
- Alert priority filtering: critical only by default
- Floating assistive guide (AI whisper)
- Hands-light operational cues
- Status in peripheral vision (top-right)
- Navigation cues in lower-left

**Priority levels:**
| Level | Shows | Example |
|-------|-------|---------|
| Critical | Always | Failed transaction, security alert |
| Active | On request | Current position, pending approval |
| Background | Never auto | Historical data, analytics |

### XR / VR (Spatial computing)

```
Layout:         3D spatial clusters at 1–3m distance
Navigation:     constellation nodes (point + select)
Dock:           floating anchored panel
Columns:        spatial arrangement (depth = hierarchy)
Animation:      orbit, float, scale — smooth, slow
Proof panels:   floating verification cubes
AI surface:     agent orb at peripheral + voice
Max coverage:   comfortable field of view (60°)
Input model:    hand tracking + gaze + voice
```

**Behavior:**
- True orbiting modules around user
- Layered depth: closer = more important
- Gesture-safe spacing (min 0.3m between elements)
- Anchored AI presence (agent orb follows at shoulder)
- Spatial proof surfaces (verification as 3D objects)
- Natural gestures: grab, point, dismiss, pinch-zoom
- Portfolio as landscape (positions are terrain)
- Workflow pipeline as physical path through space
- Comfort zone: content at 1–3m virtual distance
- 90fps minimum, never drop frames

---

## Interaction Model by Device

| Action | Desktop | Mobile | Watch | Glasses | XR |
|--------|---------|--------|-------|---------|-----|
| Navigate | Click nav | Tap tab | Swipe | Voice | Point |
| Open detail | Click card | Tap → sheet | Tap → card | Gaze + dwell | Grab |
| Primary action | Click CTA | Tap CTA | Tap button | Voice command | Pinch |
| Dismiss | Click × / Esc | Swipe down | Swipe away | Head shake | Flick |
| Search | Cmd+K | Tap search | Voice | Voice | Voice |
| AI assist | Click orb | Tap FAB | Voice | Voice | Voice |
| Approve | Click confirm | Tap confirm | Tap ✓ | Voice "yes" | Thumbs up |
| Proof check | Hover badge | Tap badge | Tap hash | Gaze badge | Grab cube |

---

## Animation Budget by Device

| Device | Max simultaneous animations | Particle count | Ambient cycles |
|--------|----------------------------|----------------|----------------|
| Desktop | 8 | 20–30 | float, pulse, orbit, signal |
| Tablet | 5 | 10–15 | float, pulse |
| Mobile | 3 | 0–5 | float, pulse |
| Watch | 1 | 0 | pulse only |
| Glasses | 1 | 0 | fade only |
| XR | 6 | 10–20 | float, orbit, scale |

---

## Progressive Reveal Rules

### Layer 0: Skeleton (instant)
Show structure immediately. Glass cards with skeleton shimmer. Header and nav visible.

### Layer 1: Hero (< 0.5s)
Primary content loads. Hero headline, main metric, primary CTA.

### Layer 2: Context (< 1s)
Supporting cards, status pills, proof strip, live indicators.

### Layer 3: Depth (on interaction)
Detail panels, secondary modules, automation rail, agent surfaces.

### Layer 4: Power (on demand)
Full data tables, chart zoom, workflow graphs, raw proof data, API surfaces.

Never show Layer 4 by default. Never skip Layer 1.

---

## Module Visibility Rules

Not every module appears on every device or for every user:

| Module Family | Desktop | Mobile | Watch | Glasses | XR |
|---------------|---------|--------|-------|---------|-----|
| Core | ● all | ● all | ● home only | ○ none | ● all |
| Intelligence | ● all | ● summary | ○ alerts | ● signals | ● full |
| Execution | ● all | ● primary only | ○ approve | ○ confirm | ● full |
| Capital | ● all | ● wallet focus | ● balance | ○ none | ● full |
| RWA | ● all | ● registry | ○ none | ○ none | ● spatial |
| Trust | ● all | ● proof pill | ● hash | ● badge | ● cubes |
| Agentic | ● full | ● orb + summary | ○ voice | ● voice | ● orb + graph |

● = full surface · ○ = minimal or hidden

---

## State-Aware Layout Decisions

The system adjusts layout based on state, not just device:

| State | Effect |
|-------|--------|
| **First visit** | Show narration, reduce module count, emphasize onboarding |
| **Returning user** | Skip intro, surface last-used module, show recent activity |
| **Active transaction** | Elevate execution panel, show confirmation flow, suppress unrelated modules |
| **Error state** | Surface AI guidance, highlight affected module, show proof of failure |
| **Empty state** | Show setup wizard, reduce to single CTA, narrate next step |
| **System healthy** | Subtle green pulse, proof strip active, all modules available |
| **System degraded** | Warning banner, affected module highlighted, AI explains |

---

## The Rule

> The interface is not a fixed page. It is a living membrane that reshapes itself around intent, device, state, and trust.

---

_This ruleset governs all SOVEREIGN implementations. Violations are bugs._
