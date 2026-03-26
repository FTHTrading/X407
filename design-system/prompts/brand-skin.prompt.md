# SOVEREIGN — Layer D: Brand Skin

> **The clothing. Loaded per-site to change palette, voice, and emphasis — nothing structural.**
> Skins dress the shell. They never reshape it.

---

```text
You are applying a brand skin to a SOVEREIGN system.
The shell, components, layout, and behavior are already defined by the Builder (Layer C).
A skin changes ONLY the following properties. Nothing else.

## What a skin changes

| Property | How it changes | Source |
|----------|---------------|--------|
| Palette | Override --sov-accent-*, --sov-glow-* via [data-brand] | tokens/brands/{brand}.css |
| Copy tone | Voice shifts (e.g., "sovereign" → "fast, precise") | Brand focus card |
| Hero sentence | One sentence defining the brand's promise | Brand focus card |
| Module labels | Names adapt (e.g., "Treasury" → "Vault" → "Portfolio") | Brand config |
| AI voice personality | Authoritative-calm → Athletic-precise → Fast-tactical | Brand config |
| Proof emphasis | What trust surface leads (chain proof, audit trail, accuracy history) | Brand focus card |
| Module set | Which of the 7 families are active | Brand focus card |

## What a skin NEVER changes

- Shell structure (header → main → dock → proof strip)
- Component architecture (.sov-card, .sov-metric, .sov-dock)
- Glass material system (densities, blur, depth layers)
- Interaction patterns (hover, focus, progressive reveal)
- Motion budget (8 desktop, 3 mobile, 1 watch)
- Responsive breakpoints (1024 / 768)
- CSS import order (sovereign → brand → liquid-glass → components)
- AI behavior rules (contextual activation, proof traces, word budgets)
- Adaptive device behaviors (watch = 1 card, glasses = HUD, etc.)

## Skin Application

1. Set data-brand on the root element:
   <html data-brand="unykorn">

2. Load brand CSS (which only overrides custom properties):
   @import "tokens/brands/unykorn.css";

3. Apply brand config object:
   { "brand": "unykorn", "tone": "sovereign", ... }

4. Done. The system renders identically, wearing different clothes.

---

## Brand Skins

### UnyKorn
- data-brand: "unykorn"
- CSS: tokens/brands/unykorn.css
- Accent: #3b82f6 (royal electric blue)
- Glow: #a855f7 (purple)
- Text: #ffffff
- Tone: Sovereign, engineered, foundational
- Module set: Core · Capital · Trust
- AI voice: Authoritative-calm
- Proof emphasis: On-chain block verification, treasury transparency
- Hero: "Here is the sovereign layer. Here is proof it works. Here is how you build on it."
- Revenue path: Transaction flow through UNY token and protocol fees

### xxxiii
- data-brand: "xxxiii"
- CSS: tokens/brands/xxxiii.css
- Accent: #60a5fa (electric blue)
- Glow: #fbbf24 (gold)
- Text: #f0f0f5 (cold white)
- Tone: Sovereign, intelligent, commanding
- Module set: Core · Intelligence · Agentic · Trust
- AI voice: Authoritative-precise
- Proof emphasis: Agent reasoning traces, tool usage logs, workflow attestations
- Hero: "Here is the intelligence mesh. Here is how it reasons. Here is what it can do for you."
- Revenue path: Platform access and compute routing fees

### Helios
- data-brand: "helios"
- CSS: tokens/brands/helios.css
- Accent: #f59e0b (amber gold)
- Glow: #d97706 (molten gold)
- Text: #fbbf24 (bright gold)
- Tone: Institutional, warm, secure
- Module set: Core · Capital · RWA · Trust
- AI voice: Institutional-reassuring
- Proof emphasis: Vault attestation, reserve proof, custodian verification
- Hero: "Here is the gold. Here is the proof. Here is how you hold it."
- Revenue path: Issuance fees and custody spreads on gold-backed certificates

### NIL33
- data-brand: "nil33"
- CSS: tokens/brands/nil33.css
- Accent: #3b82f6 (electric blue)
- Glow: #8b5cf6 (athletic violet)
- Text: #e2e8f0 (silver)
- Tone: Athletic, precise, elite
- Module set: Core · Intelligence · RWA · Trust
- AI voice: Athletic-precise
- Proof emphasis: Valuation methodology transparency, compliance attestation
- Hero: "Here is the valuation. Here is the data. Here is how you verify it."
- Revenue path: Platform subscription and athlete licensing fees

### Y3K Markets
- data-brand: "y3k"
- CSS: tokens/brands/y3k.css
- Accent: #10b981 (emerald)
- Glow: #60a5fa (ice blue)
- Text: #fbbf24 (gold)
- Tone: Fast, precise, profitable
- Module set: Core · Intelligence · Execution · Capital
- AI voice: Fast-tactical
- Proof emphasis: Signal accuracy history, execution audit trail, PnL verification
- Hero: "Here is the signal. Here is the route. Here is the result."
- Revenue path: Signal subscription and execution routing fees

---

## Creating a New Skin

To add a sixth brand, create:

1. A 6-field focus card (core problem, main offer, secondary offer, revenue path, proof surface, deferred ideas)
2. A CSS file at tokens/brands/{name}.css overriding:
   - --sov-accent, --sov-accent-dim
   - --sov-glow, --sov-glow-soft
   - --sov-text, --sov-text-secondary
   - Any gradient overrides
3. A config object with brand, tone, modules, nav, heroObject, aiVoice, proofSurface
4. An entry in this skin registry

The system renders immediately. No structural changes required.

## Skin Validation

Before shipping a skin, verify:
- [ ] Only custom properties are overridden — no structural CSS added
- [ ] Focus card has all 6 fields filled
- [ ] Module set uses only existing module families
- [ ] AI voice personality is defined
- [ ] Proof surface type exists in the component library
- [ ] Hero sentence follows the "Here is X. Here is Y. Here is Z." pattern
- [ ] Revenue path is clear in one sentence
```
