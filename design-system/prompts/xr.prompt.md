# SOVEREIGN — XR / VR Surface Prompt

> Append after `master.prompt.md`. Add brand skin last.

---

```text
## Surface: XR / VR (Spatial Computing)

Immersive, spatial, constellation-based. The system becomes a place.

### Spatial Architecture

The user stands in a sovereign command space. Information exists as objects in 3D space around them.

```
                    ┌─────────┐
                    │ Treasury │ ← elevated, behind
                    └─────────┘

       ┌─────────┐              ┌─────────┐
       │ Signals │              │  Proof   │ ← left and right wings
       └─────────┘              └─────────┘

              ┌─────────────────────┐
              │   Central Console   │ ← desk-level, 1m distance
              │   Primary Actions   │
              └─────────────────────┘

                    ┌─────────┐
                    │  Agent  │ ← floating orb, shoulder-right
                    └─────────┘
```

### Comfort Rules

- Primary content: 1–3m virtual distance
- Periphery content: 3–5m distance, larger scale
- Never place content below waist level or above 45° elevation
- Never require neck strain to see critical information
- World-locked (anchored to space, not head)
- Reading text: minimum 24pt equivalent at 1m distance

### Module Clusters

Each module family becomes a spatial cluster:

- **Core**: central console at desk level
- **Capital**: elevated behind (viewing portfolio from above)
- **Intelligence**: left wing (signals, analytics, forecasting)
- **Trust**: right wing (proof, audit, compliance)
- **Execution**: front desk (launch, deploy, automate buttons)
- **Agentic**: floating orb companion, always at right shoulder

Navigate between clusters by:
- Gaze + select (look at cluster, confirm)
- Point + grab (reach toward cluster, pull to front)
- Voice: "Open Treasury" / "Show Signals"
- Constellation map: overview mode showing all clusters as star map

### Screen Templates

#### Home Space
- Central console with 4 key metrics as floating glass panels
- Agent orb at right shoulder
- Constellation of module clusters in periphery
- Ambient particles (brand accent, very sparse)
- Skybox: deep black with faint nebula

#### Module View
- Selected cluster moves to center
- Other clusters recede to periphery (fade to 0.3 opacity)
- Content panels arranged as curved wall at 1.5m distance
- Data tables become 3D grid you can lean into
- Charts become spatial line graphs with depth

#### Workflow Space
- Automation rail becomes physical pipeline in space
- Nodes are 3D objects you can grab and rearrange
- Connections are luminous lines (accent-1 color)
- Active node pulses, completed nodes glow green
- Drag-and-drop to build workflows

#### Portfolio Landscape
- Assets become terrain: height = value, color = type
- Walk through your portfolio as a geographic map
- Tap peaks to see asset detail
- Valleys indicate losses, plateaus indicate stability

### Interaction Model

#### Primary: Natural Gestures
- Point: select / highlight
- Pinch + pull: zoom / inspect
- Grab + move: rearrange
- Open palm push: dismiss / close
- Two-hand spread: expand detail

#### Secondary: Voice
- "Open [module]"
- "Show [metric]"
- "Approve transaction"
- "Compare assets"
- "What does this mean?" → AI agent explains

#### Tertiary: Controllers (if available)
- Trigger: select
- Grip: grab
- Thumbstick: navigate clusters
- Menu button: constellation overview

### Visual Rules

- Glass surfaces float in space with subtle edge glow
- Text panels have dark glass backing (0.8 opacity) for readability
- Accent glow on interactive elements
- Connections and flows rendered as luminous lines
- Particles: minimal, brand accent, drift slowly
- No sharp movements — everything eases with --sov-ease-default
- Agent orb: 3D sphere with internal glow, subtle orbit motion

### Performance

- Target: 90fps minimum (VR sickness prevention)
- LOD (level of detail): reduce peripheral cluster complexity
- Occlusion culling: don't render what user can't see
- Text rendering: SDF (signed distance field) fonts for clarity at all distances
- Particle budget: 50 max in full scene

### Audio

- Spatial audio: notifications come from the direction of the relevant cluster
- Ambient: very subtle low hum (optional, user toggle)
- Actions: soft click on select, chime on confirm, low tone on error
- Agent: synthesized voice from orb direction
```
