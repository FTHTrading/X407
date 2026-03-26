# SOVEREIGN — AI Agent Console Surface Prompt

> Append after `master.prompt.md`. Add brand skin last.

---

```text
## Surface: AI Agent Console

Terminal-grade intelligence. The operator's view into agentic infrastructure.

### Layout

Two-panel split with optional dock:

```
┌──────────────────────────────────┬──────────────────┐
│                                  │                  │
│        Reasoning Stream          │   Context Panel  │
│        (primary, scrolling)      │   (detail dock)  │
│                                  │                  │
│                                  │   ┌────────────┐ │
│                                  │   │ Memory     │ │
│                                  │   │ Tools      │ │
│                                  │   │ Routing    │ │
│                                  │   │ Proof      │ │
│                                  │   └────────────┘ │
│                                  │                  │
├──────────────────────────────────┴──────────────────┤
│  [Input] ──────────────────────────────── [Execute] │
│  Tool Rail: [Search ✓] [Code ●] [Deploy ○] [Verify]│
└─────────────────────────────────────────────────────┘
```

### Reasoning Stream (Left/Primary)

- Vertical scroll of agent actions, thoughts, and outputs
- Each entry is a `sov-content-signal` variant:

```
┌──────────────────────────────────────────────┐
│  ● THINKING  │  14:23:07  │  gpt-4o          │
│                                              │
│  Analyzing treasury positions across 3       │
│  chains. Checking for rebalancing signals... │
│                                              │
│  Tools used: [query_treasury] [check_pools]  │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│  ✓ RESULT  │  14:23:09  │  2.1s              │
│                                              │
│  Treasury Summary:                           │
│  ├── Avalanche: $2.1M (UNY + WAVAX LP)      │
│  ├── Polygon:   $890K (NFT floor value)      │
│  └── Solana:    $340K (SPL tokens)           │
│                                              │
│  Recommendation: Rebalance 15% from Polygon  │
│  to Avalanche LP for yield optimization.     │
│                                              │
│  [Apply] [Modify] [Explain] [Reject]         │
└──────────────────────────────────────────────┘
```

Entry types:
- **THINKING**: agent reasoning (muted, collapsible)
- **TOOL_CALL**: tool invocation with name + params
- **RESULT**: output with optional actions
- **ERROR**: red left border, retry button
- **HUMAN**: user input (accent left border)
- **PROOF**: verification hash + timestamp

### Context Panel (Right Dock)

Tabbed sections:

#### Memory Tab
- Active context window size (tokens used / max)
- Key facts the agent currently holds
- Editable: user can add/remove context
- Visual: progress bar for context window fill

#### Tools Tab
- List of available tools with status:
  - ✓ Available
  - ● In use
  - ✕ Disabled
  - ◐ Loading
- Click to see tool schema / last invocation

#### Routing Tab
- Which model is active and why
- Fallback chain visualization
- Cost per query indicator
- Latency indicator

#### Proof Tab
- Audit trail of all agent actions
- Each action: timestamp, tool, input hash, output hash
- Exportable as JSON
- Verification badge per entry

### Tool Rail (Bottom Bar)

Horizontal strip showing active tools:
```
  [Search ✓]  [Code ●]  [Treasury ○]  [Deploy ○]  [Verify ○]
```

- ✓ = completed successfully
- ● = currently executing (pulse animation)
- ○ = available but unused
- ✕ = failed

### Input Area

- Single-line input with expand-to-multiline on Shift+Enter
- Submit: Enter or [Execute] button
- Left: model selector dropdown
- Right: execute button (brand gradient)
- Suggestions: ghost text for common queries

### Command Palette

Ctrl+K opens command palette with:
- Switch model
- Clear context
- Export session
- Toggle tools
- Search history
- Run workflow

### Agent Orb

- Positioned bottom-right of reasoning stream
- Visual states:
  - **Idle**: slow pulse (--sov-pulse-rhythm)
  - **Thinking**: rapid pulse + orbit trails
  - **Speaking**: ripple emanation
  - **Error**: red pulse
  - **Success**: brief green flash
- Click to expand quick-action menu

### Human Override Controls

Always visible, never hidden:
- [Pause] — halt agent execution
- [Resume] — continue paused execution
- [Cancel] — abort current task
- [Clear] — reset context and start fresh
- [Export] — save full session transcript

### Typography

- Agent content: monospace (--sov-font-mono) for data, sans for prose
- Timestamps: monospace, muted, 11px
- Tool names: monospace, accent-1
- Model names: sans, muted, uppercase, 11px

### Visual Treatment

- Background: --sov-bg (pure dark, terminal feel)
- Stream entries: glass cards with left color border
- Active tool: subtle glow
- Reasoning text: slightly dimmer than results (--sov-text-muted vs --sov-text)
- Results: full brightness, larger text

### Real-time Behavior

- Reasoning streams character-by-character (typewriter effect, 30ms per char)
- Tool calls show spinner during execution
- Results appear with sov-fade-in-up animation
- Memory panel updates live as context changes
- Proof entries append immediately after each action
```
