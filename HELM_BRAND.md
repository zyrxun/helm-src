# Helm — Brand Concept Document

> Reference this document for all design, copy, and product decisions.
> It is the single source of truth for the Helm brand.

---

## What Helm Is

Helm is a macOS menu bar workflow orchestrator. One click opens your entire configured app stack — every app, every tab, every window, in the exact state you need.

Built for executives and power users who move fast and don't slow down for their tools.

---

## The Promise

**"Take the wheel."**

Helm gives you total command of your environment. Not someday, not after setup — right now, in one click. Your stack is ready before you are.

The product promise is precision and speed without friction. The feeling is sitting down at the bridge of a well-run ship: everything is where it should be, everything responds exactly as expected.

---

## Brand Concept — The Bridge

The visual and conceptual world of Helm is **The Bridge**: the command deck of a ship. Precision instruments. Nautical chart grids. Gold fittings on deep navy. A place where serious people make decisions without hesitation.

This is not a productivity toy. It is a professional instrument.

---

## Brand Personality

| Trait | Expression |
|---|---|
| Calm | Never urgent, never frantic. The UI is quiet. |
| Precise | Every element earns its place. Nothing decorative without purpose. |
| Commanding | The product makes you feel in control, not overwhelmed. |
| Confident | Short sentences. Active verbs. No hedging. |

---

## Voice & Tone

- Present tense. Active voice. Short sentences.
- No exclamation points — ever.
- No filler words: "easily", "simply", "seamlessly", "powerful".
- Speak to the user as a peer, not a customer.

**Good:** "Your stack is ready."
**Bad:** "Your apps have been successfully launched!"

**Good:** "One click. Your entire stack is running."
**Bad:** "Helm makes it easy to open all your apps at once!"

**Good:** "Something went wrong. Try again."
**Bad:** "Oops! We couldn't launch your workflow."

---

## Features

### Core
- **One-click workflow launch** — a single click from the menu bar opens every app in a workflow, in order, with the correct URLs and window state.
- **8-spoke workflow model** — workflows are named stacks of apps and URLs. Add as many as you need.
- **Menu bar native** — no Dock icon, no splash screen. Helm lives where power users already look.
- **JXA automation** — talks directly to macOS via JavaScript for Automation. Not URL schemes. Not shortcuts hacks. The real thing.
- **Local config** — workflows are stored in `~/Library/Application Support/Helm/workflows.json`. Your data never leaves your machine.

### UI
- **Idle state** — clean list of workflows, each with a gold run button.
- **Running state** — the active workflow's run button becomes a spinning gold wheel. Other workflows dim. Status reads "Launching".
- **CRUD** — add, edit, delete, reorder workflows directly from the popover.
- **System appearance** — follows macOS light/dark mode by default; user can override to always-dark or always-light.

### Planned
- Workflow CRUD UI in the popover
- iOS companion app — same design language
- Website — dark landing page
- Pitch deck — 10 slides

---

## Color System

| Name | Hex | Use |
|---|---|---|
| Abyss | `#0A1628` | Primary background, app icon background |
| Helm Navy | `#1E3A5F` | Card surfaces, workflow rows, gradients |
| Sovereign Gold | `#D4AF6A` | Mark, wordmark, CTAs, active states, run button |
| Burnished Gold | `#B8922A` | Hover/pressed gold states |
| Chalk | `#F7F4EF` | Primary text on dark, light-mode background |
| Fog | `#C8C4BC` | Secondary text, app names, labels |
| Clearance | `#30D158` | Success, running state wheel, ready indicator |
| Alert | `#FF453A` | Error states |
| Deep Border | `#1a2e47` | Subtle dividers, section separators |
| Muted Label | `#5a7290` | Tertiary labels, metadata, timestamps |

---

## Typography

| Role | Font | Weight | Notes |
|---|---|---|---|
| Wordmark | Playfair Display | 700 | `letter-spacing: 0.06em`. Gold on dark, Abyss on light. |
| Headlines | Inter | 700–800 | Tight tracking. UI headings and hero copy. |
| UI / Body | Inter | 400–500 | All app UI, labels, workflow names. |
| Data / Code | JetBrains Mono | 400 | Config paths, technical metadata. |

---

## The Mark — Ship's Wheel

The Helm mark is an 8-spoke ship's wheel constructed from:

- A circular rim (`stroke`, not filled)
- 8 spokes at 45° intervals (4 cardinal, 4 diagonal) with `stroke-linecap: round`
- 8 circular handle knobs sitting exactly on the rim at each spoke end
- A hub ring (dark fill, gold stroke) with a solid gold centre dot

**Construction rules:**
- Rim radius: 38 units in a 100×100 viewBox
- Cardinal handle radius: 6.5–7 units
- Diagonal handle radius: 5.5–6 units (slightly smaller for optical balance)
- Spoke stroke width: 3.2–3.5 units
- Hub outer radius: 9–10 units, dark fill, gold stroke matching spoke weight
- Hub inner dot radius: 3.5–4 units, solid gold

**Colors:**
- On dark: all elements in Sovereign Gold `#D4AF6A`, hub fill in Abyss `#0A1628`
- On light: all elements in Abyss `#0A1628`, hub fill in Chalk `#F7F4EF`
- Running state: all elements in Clearance `#30D158`, hub fill in `#0d1f0f`

**Animation:**
- Idle/app icon: rotates continuously at 16s per revolution
- Running state: rotates at 1.8s per revolution (fast enough to read as active, slow enough to see the mark)

---

## Logo Lockups

**Primary — stacked (dark bg):**
Mark centered above wordmark. 14px gap between bottom of mark and cap-height of wordmark. Wordmark in Playfair Display 700, Sovereign Gold, `letter-spacing: 0.06em`.

**Secondary — horizontal:**
Mark left-aligned, wordmark right, vertically centred on the mark's midpoint. Gap between mark edge and wordmark = half the mark's diameter.

**Mark only:**
Used at small sizes (favicon, menu bar icon, app badge). Never use wordmark below 20px cap-height.

**Wordmark only:**
Used in running text, footers, and anywhere the mark has already appeared nearby.

---

## App Icon

Dark background tile (`#0A1628`) with macOS rounded rectangle mask. Subtle nautical chart grid overlay at 5% opacity (gold lines, 22px grid). Mark centered, gold on dark. No border.

Sizes: 1024px (App Store), 512px, 256px, 128px (Dock), 32px, 22px (menu bar template — monochrome, no background).

---

## Popover UI

The menu bar popover is 320px wide. Dark background (`#0A1628`). Subtle chart grid overlay at 5% opacity.

**Structure:**
```
┌─ Header: "Helm" wordmark left · status dot + label right ─┐
│  Section label: "WORKFLOWS"                                │
│  Workflow row × N                                          │
└─ Footer: Settings · New workflow button ──────────────────┘
```

**Workflow row:**
- Background: Helm Navy `#1E3A5F`, border `#2a4a70`, border-radius 10px
- Name: Inter 500, Chalk. Apps: Inter 400 11px, Fog.
- Run button: 32×32px, gold background, dark play triangle icon.

**Idle state:**
- Status: green dot + "Ready"
- All rows full opacity
- Run buttons gold

**Running state:**
- Status: gold dot + "Launching"
- Active row: gold border highlight
- Active run button: dark green background (`#0d1f0f`), green border, spinning green wheel mark
- Other rows: 38% opacity

**Success state (post-launch):**
- Status: green dot + "Ready"
- Brief toast inside popover: "Your stack is ready." — then clears

---

## Website

Dark landing page. Nautical chart grid texture behind hero, fading to solid at edges via radial vignette.

**Nav:** Wordmark left. Links center (Features, Workflows, Changelog). "Download for Mac" CTA right — gold background, dark text.

**Hero:**
- Eyebrow: `MACOS MENU BAR ORCHESTRATOR` — 11px, 0.14em tracking, Sovereign Gold
- H1: "Take the wheel." — Playfair Display 700, 52px, Chalk. "wheel." in Sovereign Gold.
- Subhead: "One click. Your entire stack is running." — Inter 400, 17px, Fog
- CTAs: "Download for macOS" (gold, primary) + "See workflows →" (ghost, secondary)
- Hero UI chip: mini popover preview showing workflow pills and a run button

**Features strip (3 columns):**
- Separated by 1px Helm Navy dividers
- Each: Tabler icon in gold, 15px Inter 700 title in Chalk, 13px Inter 400 body in `#8fa3bc`

**Footer:** System metadata left (macOS version, data note) · Wordmark right.

---

## Design Prompts

Use these prompts when generating or regenerating any Helm visual asset.

### App Icon
```
macOS app icon for "Helm", a menu bar workflow orchestrator.
Dark navy background (#0A1628) with subtle nautical chart grid overlay at 5% opacity.
Centered ship's wheel mark in Sovereign Gold (#D4AF6A).
Wheel: circular rim, 8 spokes at 45° intervals with round linecaps, circular handle knobs at each spoke end sitting on the rim, hub ring with dark fill and gold stroke, small solid gold centre dot.
No gradients, no glow, no drop shadow. Flat, precise, minimal.
macOS rounded-rectangle mask. Clean and authoritative.
```

### Wordmark / Logo
```
Logotype for "Helm". Ship's wheel mark in Sovereign Gold (#D4AF6A) paired with the wordmark "Helm" in Playfair Display Bold, letter-spacing 0.06em, same gold color.
Available as: stacked (mark above wordmark), horizontal (mark left, wordmark right), mark only, wordmark only.
On dark (#0A1628): gold mark and text.
On light (#F7F4EF): Abyss (#0A1628) mark and text.
No tagline in the lockup. Clean and precise.
```

### Menu Bar Popover UI
```
macOS menu bar popover UI for "Helm" workflow orchestrator. 320px wide.
Background: #0A1628 (Abyss). Subtle nautical chart grid at 5% opacity.
Header: "Helm" in Playfair Display Bold, Sovereign Gold, left-aligned. Status indicator right.
Workflow rows: Helm Navy (#1E3A5F) cards, 10px radius, workflow name in Inter 500 Chalk, app list in Inter 400 11px Fog, gold 32×32px run button with play icon.
Idle state: green dot "Ready", all rows full opacity, gold run buttons.
Running state: gold dot "Launching", active row has gold border, active run button shows spinning ship's wheel mark in Clearance green (#30D158) on dark green background, other rows at 38% opacity.
Footer: Settings link left, "+ New workflow" ghost button right in gold.
No gradients, no shadows. Flat, dark, precise.
```

### Website Landing Page
```
Dark landing page for "Helm" macOS app. Background #0A1628.
Nav: "Helm" Playfair Display Bold gold wordmark left, center links in Inter 400 Fog, "Download for Mac" gold CTA button right.
Hero: nautical chart grid texture (#D4AF6A lines at 5% opacity, 34px grid) with radial vignette fading to background. Eyebrow in gold small caps. H1 "Take the wheel." in Playfair Display 52px Chalk, "wheel." in Sovereign Gold. Subhead Inter 17px Fog. Two CTA buttons. Mini popover UI chip preview.
Features: 3-column strip, Helm Navy dividers, Tabler outline icons in gold, Inter 700 15px Chalk titles, Inter 400 13px #8fa3bc body.
Footer: metadata in #5a7290 left, wordmark right.
No gradients, no shadows, no bright colors outside the brand palette.
```

### Running State Animation
```
Helm ship's wheel mark animation for running workflow state.
Mark drawn in Clearance green (#30D158) on dark green background (#0d1f0f), inside a 32×32px rounded square button with a subtle green border.
Wheel rotates continuously at 1.8s per revolution, clockwise.
Same mark construction as the main icon: circular rim, 8 spokes, round-cap linecaps, circular knobs on rim, hub ring with dark fill and green stroke, solid green centre dot.
Smooth linear rotation. No easing. No pulse. No glow.
```

---

## What Helm Is Not

- Not a launcher (it doesn't just open apps — it opens your configured environment)
- Not a shortcut tool
- Not a productivity app in the self-help sense
- Not playful, bubbly, or friendly — calm and precise
- Not for everyone — built for power users who know what they want

---

## One-line Brief

Helm is the command interface for people who don't slow down for their tools.
