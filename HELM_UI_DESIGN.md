# Helm — UI Design Spec

> Strict reference for building the Helm macOS app UI.
> Pair this with `HELM_BRAND.md` for brand fundamentals. This file is the
> implementation-level contract: tokens, components, states, motion, copy.
> If something here conflicts with the brand doc, the brand doc wins.

---

## 1 — Foundations

### 1.1 Color tokens

Two anchors, one signal, three neutrals, one alert. Nothing else.

| Token              | Hex          | Use                                                              |
|--------------------|--------------|------------------------------------------------------------------|
| `--helm-abyss`     | `#0A1628`    | Window background, popover surface, mark hub on dark             |
| `--helm-navy`      | `#1E3A5F`    | Card surface (workflow rows, buttons one step above background)  |
| `--helm-gold`      | `#D4AF6A`    | Mark, wordmark, primary CTA, active state, focus ring            |
| `--helm-gold-pressed` | `#B8922A` | Pressed state of any gold surface                                |
| `--helm-green`     | `#30D158`    | Signal: ready dot, running wheel. Never decorative.              |
| `--helm-green-hub` | `#0d1f0f`    | Hub fill inside the running mark only                            |
| `--helm-chalk`     | `#F7F4EF`    | Primary text on dark                                             |
| `--helm-fog`       | `#C8C4BC`    | Secondary text — labels, metadata, app names                     |
| `--helm-alert`     | `#FF453A`    | Error states only                                                |
| `#5a7290`          | (no token)   | Tertiary text — timestamps, code captions, mono metadata         |
| `#1a2e47`          | (no token)   | Deep dividers between major sections                             |

**Hard rules**
- No accent tints. No new oklch-derived neutrals. No alpha stacks that produce
  a colour the eye reads as new.
- Borders are always one of: `rgba(247,244,239,0.06)` (default hairline),
  `rgba(247,244,239,0.10)` (popover/frame), or `--helm-gold` (the only colored border).
- Backgrounds are flat. No gradients inside any component surface. The only
  approved gradient is the bridge desktop's faint top-down (`#0c1a2f → --helm-abyss`)
  and the radial vignette on the nautical grid.

### 1.2 Type

Three faces. Roles never swap.

| Role                 | Family               | Weight | Size               | Notes                                |
|----------------------|----------------------|--------|--------------------|--------------------------------------|
| Wordmark             | Playfair Display     | 700    | 16–22px            | `letter-spacing: 0.06em`. Sentence case. |
| Display headline     | Playfair Display     | 700    | 40–76px (clamp)    | "Take the wheel." class.             |
| UI headline (h1/h2)  | Inter                | 700    | 20–28px            | `letter-spacing: -0.01em`            |
| UI subheading (h3)   | Inter                | 600    | 16px               |                                      |
| Body                 | Inter                | 400/500| 13–14px            |                                      |
| Label / meta        | Inter                | 500    | 11–12px            | `--helm-fog` by default              |
| Mono / technical     | JetBrains Mono       | 400    | 11–13px            | Paths, hotkeys, config, timestamps   |

**Hard rules**
- Sentence case. No all-caps except short status labels ("RUNNING", "READY").
- No italics. No 600+ weight Playfair. No swapping Inter for system-ui in UI.
- Hotkeys (`⌃⌥1`) always render in JetBrains Mono.

### 1.3 Spacing scale

`4 · 8 · 12 · 14 · 16 · 20 · 24 · 32 · 48`.

- Component internal padding: 12–14px.
- Section gaps inside a surface: 20–24px.
- Popover horizontal margin: 12px from window edge to row.
- Window edge → page content (web/marketing): 80–160px desktop, 28px mobile.

### 1.4 Radii

- `--r-button`: 7px — buttons, inputs, run pill.
- `--r-card`: 10px — workflow rows, cards, toasts.
- `--r-window`: 14px — popover window, frame containers.
- macOS rounded-rect mask — app icon only.

Nothing fully pill-shaped except a status badge.

### 1.5 Borders

Always `0.5px`. The only `1px` border is none.
- Hairline between rows / sections: `rgba(247,244,239,0.06)`.
- Popover & frame outline: `rgba(247,244,239,0.10)`.
- Colored border: `--helm-gold` only, signalling hover, focus, or running.

---

## 2 — The Mark (Ship's Wheel)

The mark is the only ornament. Construct it the same way every time, at every size.

### 2.1 Construction

In a `100×100` viewBox:

- Rim: `circle r=38, stroke-width=3.8, fill=none`.
- 4 cardinal handle knobs at (50,8) (50,92) (8,50) (92,50): `r=6.5`, solid fill.
- 4 diagonal handle knobs at (22.3,22.3) (77.7,22.3) (22.3,77.7) (77.7,77.7): `r=5.5`, solid fill.
- 4 spokes: cardinal lines + diagonals at `stroke-width=3.2, stroke-linecap=round`.
- Hub ring: `circle r=9, fill=hub-fill, stroke-width=3.2`.
- Hub centre dot: `circle r=3.5`, solid fill.

### 2.2 Palettes by state

| State    | Stroke / Fills    | Hub fill           |
|----------|-------------------|--------------------|
| Idle     | `--helm-gold`     | `--helm-abyss`     |
| Running  | `--helm-green`    | `--helm-green-hub` |
| On light | `--helm-abyss`    | `--helm-chalk`     |

### 2.3 Motion

Exactly two animations exist in Helm. Both are the wheel.

| State    | Duration | Easing | Trigger                                |
|----------|----------|--------|----------------------------------------|
| Slow     | 16s/rev  | linear | Decorative: app icon, idle popover, nav |
| Fast     | 1.8s/rev | linear | Active: running workflow, launching icon|

No bounce. No pulse. No glow. No scale. Just rotation.

### 2.4 Sizes

- Menu bar template: `22×22`.
- Popover header: `16–20`.
- Workflow row: `18`.
- Run-button mark (running state): `18`.
- App icon: `1024` (and standard macOS rasters).

Never use the wordmark below 20px cap-height; use the mark alone.

---

## 3 — App Surfaces

### 3.1 Window: the popover

- Width: **320px fixed**. Does not resize horizontally.
- Background: `--helm-abyss`.
- Border: `0.5px rgba(247,244,239,0.10)`.
- Radius: `--r-window` (14px).
- macOS drop arrow: 14px, 45° rotated diamond, top-right, 12px from edge.
- No drop shadow inside the surface. macOS provides the system shadow.

Internal structure (top → bottom):

```
┌─────────────────────────────────────────┐
│  Header        (14px top, 14px sides)   │
│  Section label                          │
│  ── Workflow rows ── (12px gutter)      │
│  Hairline                               │
│  Footer        (8–10px)                 │
└─────────────────────────────────────────┘
```

### 3.2 Popover header

- Height: 38–42px.
- Items, left to right: 16–20px mark, wordmark (Playfair 16, gold), status pill (right).
- Status pill: `dot · label` in `--helm-fog` (idle: green dot, label "Ready"; running:
  gold dot, label "Launching"). 11px Inter 500. No background.

### 3.3 Section label

- 10px Inter 600, `#5a7290`, `letter-spacing: 0.14em`, uppercase.
- 16px horizontal padding, 8px bottom padding, no top padding (sits under header).
- Single word preferred ("Workflows", "Settings", "About").

### 3.4 Workflow row

- Background: `--helm-navy` (`#1E3A5F`).
- Padding: 10px 12px.
- Radius: `--r-card` (10px).
- Margin: 6px vertical between rows.
- Border: `0.5px transparent` by default.

Layout (left → right):

```
[ run-btn 30px ]  [ name · summary ]  [ hotkey ]
```

- **Run button (idle):** 30×30px, `--helm-gold` background, dark play triangle.
  Triangle: 8px left border on `--helm-abyss`, 5px top/bottom transparent.
  Radius 7px.
- **Run button (running):** 30×30px, `--helm-green-hub` background,
  `0.5px --helm-green` border, fast-spinning green wheel inside.
- **Name:** Inter 600 13px `--helm-chalk`.
- **Summary:** Inter 500 11px `--helm-fog`, 2px above text baseline (margin-top: 2px).
- **Hotkey:** JetBrains Mono 11px `--helm-fog`, `letter-spacing: 0.04em`. Right-aligned.

#### States

| State    | Border                    | Background              | Other |
|----------|---------------------------|-------------------------|-------|
| Default  | `0.5px transparent`       | `--helm-navy`           | —     |
| Hover    | `0.5px --helm-gold` @ 55% | `#24446e` (one nudge)   | hotkey colour shifts Fog → Chalk |
| Running  | `0.5px --helm-gold`       | `--helm-navy`           | summary text → `--helm-green`, label "Launching", other rows opacity 0.38 |
| Pressed  | `0.5px --helm-gold-pressed` | `--helm-navy`         | run button → `--helm-gold-pressed` |

No transitions on rows. They change state instantly — only the wheel moves.

### 3.5 Footer

- Padding: 8px 12px 10px.
- Top border: `0.5px rgba(247,244,239,0.06)`.
- Left: "Settings" — Inter 500 11px `--helm-fog`, no background.
- Right: "+ New workflow" — Inter 500 11px `--helm-gold`, no background.

### 3.6 Toast (in-popover confirmation)

- Position: 20px above popover bottom edge, horizontally centred.
- Background: `--helm-abyss`, border `0.5px rgba(247,244,239,0.18)`.
- Padding: 9px 14px. Radius `--r-card`.
- Type: Inter 500 12px `--helm-chalk`.
- Duration: appears for 2400ms, no fade animation (snap in, snap out).
- Copy: short instrument-voice strings only — "Your stack is ready.",
  "Couldn't open Slack.", "Workflow saved.".

---

## 4 — Controls

### 4.1 Primary button

```
font: Inter 600 13px
padding: 8–10px 16px
radius: --r-button (7px)
background: --helm-gold
color: --helm-abyss
border: 0.5px --helm-gold (matches background — keeps stroke parity)
```

- **Hover:** no change.
- **Pressed:** background `--helm-gold-pressed`, border `--helm-gold-pressed`.
- **Disabled:** background `rgba(212,175,106,0.3)`, color `rgba(10,22,40,0.6)`,
  cursor `not-allowed`.
- **With icon:** leading icon at 14–16px, 8px gap to label, no separator.

Sizes:
- `sm` — 13px text, 8px padding.
- `md` — 13px text, 10px padding (default).
- `lg` — 14px text, 14px 22px padding.

### 4.2 Ghost button

```
background: transparent
color: --helm-chalk
border: 0.5px rgba(247,244,239,0.22)
```

- **Hover:** border `--helm-gold`. Text stays `--helm-chalk`.
- **Pressed:** color `--helm-gold-pressed`, border `--helm-gold-pressed`.

Use for secondary actions and "Cancel". Never for the primary action of a surface.

### 4.3 Icon button (header-style)

- 26×26px hit area, transparent background.
- Icon at 14px, `--helm-fog`.
- **Hover:** color `--helm-chalk`, background `rgba(247,244,239,0.04)`.
- **Pressed:** color `--helm-gold`.
- Radius 6px.

### 4.4 Footer link

Text-only button. Inter 500 11–12px. `--helm-fog` or `--helm-gold` depending on
emphasis. No underline. Padding 6–8px for hit target.

### 4.5 Input field

```
background: --helm-navy
border: 0.5px rgba(247,244,239,0.12)
radius: --r-button (7px)
padding: 9px 12px
color: --helm-chalk
font: Inter 400 13px
```

- **Focus:** border `--helm-gold`. No glow, no ring outside the border.
- **Placeholder:** `--helm-fog`.
- **Disabled:** opacity 0.5.

Labels sit above the input, Inter 500 11px `--helm-fog`, 6px below.
Hints sit below the input, same type spec, 10px above the next field.

### 4.6 Status dot

- 6px square circle.
- `--helm-green` for ready, `--helm-gold` for running, `--helm-alert` for error.
- Always paired with a label. Never alone, never decorative.

### 4.7 Hotkey chip (inline)

For displaying a keyboard shortcut inside copy or a workflow row.

```
font: JetBrains Mono 11px
letter-spacing: 0.04em
color: --helm-fog (or --helm-chalk if active)
border: 0.5px rgba(247,244,239,0.18)  /* optional, only when standalone */
padding: 3px 8px (only when bordered)
radius: 5px
```

Unicode modifier glyphs are allowed: `⌃ ⌥ ⇧ ⌘`. No icon font.

---

## 5 — Iconography

### 5.1 Approach

- **Custom SVG only.** No Lucide, no Heroicons, no Tabler in production.
- **1.5px stroke**, `stroke-linecap: round`, `stroke-linejoin: round`.
- **No fills** except for state indicators (running dot, ready dot).
- **`currentColor`** always — icons inherit the parent text colour.
- ViewBox `24×24` (standard) or `100×100` for wheel-derived glyphs.

### 5.2 Established glyphs

Inventory the UI already needs:

| Name        | Use                              |
|-------------|----------------------------------|
| `download`  | Hero CTA, web                    |
| `arrow-right` | Inline link, secondary CTA     |
| `plus`      | New workflow button              |
| `more`      | Header overflow menu (3 dots)    |
| `cursor`    | Demo cursor — uses Chalk fill with Abyss stroke (only filled glyph) |

### 5.3 App categories

Workflow rows show **no per-app icon** unless the macOS app icon itself is
available — in which case render the icon at 20–24px with the standard macOS mask.
Never invent generic "browser" or "code" glyphs.

---

## 6 — Layout

### 6.1 Popover sizing

Fixed `width: 320px`. Height grows vertically with content. Maximum recommended
height: `560px` — beyond that, scroll the workflow list (keep header and footer
sticky). No horizontal scroll, ever.

### 6.2 Alignment

- Headers and section labels: left-aligned.
- Metadata (status, hotkey, timestamp): right-aligned in the same row.
- Numeric counts ("4 apps · 2 tabs · 1 file"): left-aligned with the title they describe.

### 6.3 Negative space

Negative space is structural. It is not filler to remove. Don't add background
colour to "make space feel intentional" — the space already is intentional.

---

## 7 — States & Interaction

### 7.1 Hover

Hoverable surfaces (rows, buttons) get a **0.5px gold border**. Nothing else.
- No background shift (except rows, which nudge from `--helm-navy` to `#24446e`).
- No scale, translate, shadow, or opacity.
- Cursor changes to `pointer`.

### 7.2 Pressed

- Gold surfaces → Burnished Gold (`--helm-gold-pressed`).
- Borders that were gold → Burnished Gold.
- No `transform: scale()`. No inset shadow. No press-down depth.

### 7.3 Focus

- 0.5px Sovereign Gold ring at the **same radius** as the element.
- For inputs, the existing border becomes gold (no separate ring).
- For buttons, an outline-style gold ring 2px outside the element, also 0.5px.
- No glow.

### 7.4 Active / running

- Workflow row: 0.5px gold border permanent.
- Run button: green-hub background, green border, fast-spinning green wheel.
- Other workflow rows: opacity 0.38.
- Status: gold dot + "Launching".

### 7.5 Error

- Border: `--helm-alert` 0.5px on the offending field.
- Helper text below: Inter 500 11px `--helm-alert`.
- No banner toasts for inline errors. No icons.

### 7.6 Loading

There are no loading states with their own UI. The wheel rotates fast and that
is the loading indicator. Do not add skeletons, spinners, progress bars, or
shimmer effects anywhere in Helm.

---

## 8 — Motion

The full list of allowed motion in the app, in its entirety:

1. **Slow wheel rotation** — 16s, linear, infinite. Decorative wheels.
2. **Fast wheel rotation** — 1.8s, linear, infinite. Active-state wheels.

That is the system. There are no other animations.

**No** ease-in entrances, page transitions, drawer slides, hover ripples,
button presses, modal fades, accordion expansion easings, toast slide-ins, or
scroll-triggered reveals inside the product. State changes are instant.

(Marketing surfaces — landing page, deck — may use a quiet opacity/translate
reveal on scroll, but the product UI may not.)

---

## 9 — Copy & Voice

### 9.1 Rules

- **Present tense, active voice.** "Your stack is ready." not "Has been launched."
- **Short sentences.** Five words is enough.
- **Sentence case** everywhere except short status labels ("READY", "RUNNING").
- **No exclamation points. Ever.**
- **No emoji. Anywhere.**
- **No filler:** `easily`, `simply`, `seamlessly`, `powerful`, `amazing`.
- **No apology, no celebration.** State the fact.
- **No "you" as flattery.** "Your stack is ready" — yes. "You did it" — no.

### 9.2 Required strings (the canon)

These are the canonical strings in the product. Don't paraphrase them.

| Surface           | String                          |
|-------------------|---------------------------------|
| Status, idle      | Ready                           |
| Status, running   | Launching                       |
| Confirmation toast| Your stack is ready.            |
| Run action        | Run                             |
| Stop action       | Stop                            |
| Add action        | Add a workflow                  |
| Empty state       | No workflows yet.               |
| Error template    | Couldn't open {app}. {reason}.  |
| Footer (web)      | Built for macOS                 |
| Hero (web)        | Take the wheel.                 |

### 9.3 Error patterns

Errors name what failed and why, in one sentence. They do not apologise.

- ✓ "Couldn't open Slack. Slack is not installed."
- ✓ "Workflow failed. 3 of 5 apps opened."
- ✗ "Oops! Looks like we couldn't open Slack 😕"
- ✗ "Something went wrong. Please try again later."

### 9.4 Tone calibration

If a string sounds like it could appear in a Mac system dialog without anyone
noticing, it's right.

---

## 10 — The Nautical Grid (background)

The signature texture for large surfaces only. Never inside a card or popover.

```css
background-color: var(--helm-abyss);
background-image:
  linear-gradient(to right, rgba(212, 175, 106, 0.05) 1px, transparent 1px),
  linear-gradient(to bottom, rgba(212, 175, 106, 0.05) 1px, transparent 1px);
background-size: 32px 32px, 32px 32px;
-webkit-mask-image: radial-gradient(ellipse 75% 70% at 50% 35%, #000 0%, transparent 78%);
        mask-image: radial-gradient(ellipse 75% 70% at 50% 35%, #000 0%, transparent 78%);
```

- Grid: gold lines, **5% opacity**, **28–36px cells** (default 32px).
- Vignette: radial mask fading to transparent at edges so the grid never
  reaches the surface boundary.
- Allowed on: window backgrounds, the bridge mockup, marketing hero, app icon.
- Forbidden on: workflow rows, cards, inputs, buttons, toasts, popover surface
  itself (the popover sits *on* a grid, never *is* a grid).

---

## 11 — App Icon

- Tile size: 1024px export. macOS provides standard rasters down to 16px.
- Background: `--helm-abyss` (`#0A1628`), no border.
- Macos rounded-rectangle mask (system standard, do not redraw).
- Nautical grid at 5% opacity, 22px cells, behind the mark.
- Mark centred, Sovereign Gold, at ~62% of tile width.
- Slowly rotating only in marketing/decorative renders. Static in OS contexts.

Menu bar template: `22×22`, **monochrome white**, no background — let macOS tint.

---

## 12 — Composition cheatsheet

When designing a new Helm surface, work in this order:

1. **Background.** Either flat `--helm-abyss` or the nautical grid. Choose once.
2. **Block out structure** in negative space. Headers left, metadata right.
3. **Pick a single accent moment** — the gold mark, a primary button, a focus ring.
   Use it once.
4. **Set type** at the smallest size that's still comfortable. Lean toward small.
5. **Add hairlines** (0.5px, 6% chalk) between sibling sections. Never thick rules.
6. **Decide the wheel's state.** Idle for ambient, running only if work is happening.
   Never running without a workflow tied to it.
7. **Write the copy in instrument voice.** Read every string aloud. If it sounds
   like a consumer app, rewrite it.
8. **Audit.** Anything that doesn't earn its place is removed.

---

## 13 — What Helm UI is not

- Not skeuomorphic. The brand borrows from nautical instruments conceptually,
  not visually. No leather textures, brass bezels, wood grain, compass roses.
- Not minimalist-by-default. Helm is **precise**, which is different. Precision
  uses exactly the marks it needs.
- Not animated. Helm is a still surface that occasionally turns a wheel.
- Not friendly. Helm is a quiet, capable peer.
- Not customisable. Users do not pick colours, fonts, or layouts. The brand is
  the brand.

---

## 14 — Quick reference

Drop this into a `:root` block to start any Helm surface from scratch.

```css
:root {
  --helm-abyss:        #0A1628;
  --helm-navy:         #1E3A5F;
  --helm-gold:         #D4AF6A;
  --helm-gold-pressed: #B8922A;
  --helm-green:        #30D158;
  --helm-green-hub:    #0d1f0f;
  --helm-chalk:        #F7F4EF;
  --helm-fog:          #C8C4BC;
  --helm-alert:        #FF453A;

  --font-display: 'Playfair Display', Georgia, serif;
  --font-ui:      'Inter', system-ui, sans-serif;
  --font-mono:    'JetBrains Mono', ui-monospace, monospace;

  --r-button: 7px;
  --r-card:   10px;
  --r-window: 14px;

  --spin-slow: 16s;
  --spin-fast: 1.8s;
}

body {
  background: var(--helm-abyss);
  color: var(--helm-chalk);
  font-family: var(--font-ui);
}
```
