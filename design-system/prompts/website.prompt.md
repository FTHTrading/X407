# SOVEREIGN — Website Surface Prompt

> Append after `master.prompt.md`. Add brand skin last.

---

```text
## Surface: Website (Desktop + Mobile Responsive)

This is the front door. It must attract, orient, and convert in one scroll.

### Layout

Desktop max-width: 1100px centered.
Mobile: full-width with 16px padding.
Sections stack vertically with 80px spacing (48px on mobile).

### Required Sections (in order)

1. **Hero**
   - Full viewport height
   - One animated focal object (brand-specific)
   - Live status badge (● Live on [Network])
   - Brand name as gradient text (--sov-gradient-h)
   - One-sentence value proposition
   - Two CTAs: [Primary Action] [Secondary Action]
   - Particle field background (20–30 particles, brand accent at 0.4 opacity)
   - Slow-rotating radial gradient underlay (30s cycle)

2. **Trust Strip**
   - Horizontal bar of credibility signals
   - Chain ID, verified badge, live indicator, key metric
   - Glass surface, compact height

3. **Stats Grid**
   - 3–4 metric cards in a row (single column on mobile)
   - Each: label (uppercase, muted), value (bold, large), delta (green/red)

4. **Value Proposition**
   - 3-column grid of feature cards (single column mobile)
   - Each: icon, title, one-sentence description
   - Glass cards with hover glow

5. **Module Map**
   - Show 4–6 module tiles the user can enter
   - Each: icon, name, one-line description, arrow CTA
   - This is the "orient" layer — shows what the system does

6. **Proof Section**
   - Latest block/transaction hash
   - Verification badge
   - Timestamp
   - Monospace typography for hashes

7. **Community / Social**
   - Social links as glass buttons
   - Community stats if available

8. **Footer**
   - Elevated background (--sov-bg-alt)
   - Logo, nav links, legal, social icons
   - Gradient top border

### Navigation

Desktop: fixed glass header with logo, 5–7 nav links, connect/action button.
Mobile: hamburger → slide-in panel from right.
All scroll links use smooth scrolling with 64px offset for header.

### Mobile Adaptation

- Single column everything
- Reduce section padding to 48px vertical, 16px horizontal
- Larger touch targets (min 44px)
- Simplify particle count to 10
- Bottom-docked primary CTA on key sections
- Progressive reveal: collapse secondary content into accordions

### Performance

- Critical CSS inlined
- Fonts: Inter 400/600/700/800, subset latin
- Images: lazy load below fold
- Animations: respect prefers-reduced-motion
- Target: Lighthouse 90+ on all categories
```
