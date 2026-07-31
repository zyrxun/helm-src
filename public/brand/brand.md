# Helm — Brand System

> The single source of truth for the Helm brand. All design, copy, and product
> decisions reference this document. Superseded copies (`HELM_BRAND.md` at the
> repo root and in `marketing/`) now point here.

---

## Story

Every ship has a helm. Not because the captain lacks power — but because power needs
a point of control.

Helm is built for the people who don't slow down for their tools. Executives,
founders, operators — people whose mornings are sequences of decisions, not
sequences of mouse clicks. They know exactly what they need open, what state their
machine should be in, and what they're about to go do. They just never had a way
to make it happen in one move.

Helm gives you that move.

One click from the menu bar. Every app in position. Every tab loaded. Every workflow
ready to run — before your coffee's even poured.

It sits quietly at the top of your screen, like a ship's wheel mounted at the bridge:
always within reach, never in the way. When you're ready to sail, it's ready to move.

**Helm. Take the wheel.**

---

## What Helm Is

Helm is a macOS menu bar workflow orchestrator. One click opens your entire
configured app stack — every app, every tab, every window, in the exact state you
need.

Built for executives and power users who move fast and don't slow down for their
tools.

### The Promise

**"Take the wheel."**

Helm gives you total command of your environment. Not someday, not after setup —
right now, in one click. Your stack is ready before you are.

The product promise is precision and speed without friction. The feeling is sitting
down at the bridge of a well-run ship: everything is where it should be, everything
responds exactly as expected.

### One-line Brief

Helm is the command interface for people who don't slow down for their tools.

---

## Brand Concept — The Bridge

The visual and conceptual world of Helm is **The Bridge**: the command deck of a
ship. Precision instruments. Nautical chart grids. Gold fittings on deep navy. A
place where serious people make decisions without hesitation.

This is not a productivity toy. It is a professional instrument.

### Brand Personality

| Trait | Expression |
|---|---|
| Calm | Never urgent, never frantic. The UI is quiet. |
| Precise | Every element earns its place. Nothing decorative without purpose. |
| Commanding | The product makes you feel in control, not overwhelmed. |
| Confident | Short sentences. Active verbs. No hedging. |

---

## Voice & Tone

- **Confident, not arrogant.** State what it does. Don't oversell.
- **Brief.** Every word earns its place. If it can be cut, cut it.
- **Present tense. Active voice. Short sentences.** "Helm opens your stack." Not "Helm will help you open..."
- **No exclamation points — ever.** Authority doesn't need them.
- **No filler words:** "easily", "simply", "seamlessly", "powerful".
- **Speak to the user as a peer, not a customer.**

**Good:** "Your stack is ready."
**Bad:** "Your apps have been successfully launched!"

**Good:** "One click. Your entire stack is running."
**Bad:** "Helm makes it easy to open all your apps at once!"

**Good:** "Something went wrong. Try again."
**Bad:** "Oops! We couldn't launch your workflow."

### Tagline options

> *Take the wheel.*
> *Your workflows. In position.*
> *One click. Everything ready.*
> *Built for people who don't wait.*

---

## What Helm Is Not

- Not a launcher (it doesn't just open apps — it opens your configured environment)
- Not a shortcut tool
- Not a productivity app in the self-help sense
- Not playful, bubbly, or friendly — calm and precise
- Not for everyone — built for power users who know what they want

---

## Color System

### Primary — Deep Navy
The foundation. Authority without aggression. Feels like a boardroom at night.

| Name | Hex | Use |
|---|---|---|
| Abyss | `#0A1628` | App background, app icon background, darkest surfaces |
| Helm Navy | `#1E3A5F` | Card surfaces, workflow rows, gradients |
| Officer Blue | `#2C5282` | Hover states, borders |

### Accent — Sovereign Gold
Warmth and precision. Signals that something important is happening.

| Name | Hex | Use |
|---|---|---|
| Sovereign | `#D4AF6A` | Mark, wordmark, icon highlights, primary CTAs, run button |
| Burnished | `#B8922A` | Active / pressed / hover gold states |
| Antique | `#8B6914` | Shadows, depth on gold elements |

### Neutrals

| Name | Hex | Use |
|---|---|---|
| Chalk | `#F7F4EF` | Text on dark, light mode bg |
| Fog | `#C8C4BC` | Secondary text, subtitles, app names, labels |
| Slate | `#4A5568` | Disabled states, dividers |
| Deep Border | `#1a2e47` | Subtle dividers, section separators |
| Muted Label | `#5a7290` | Tertiary labels, metadata, timestamps |

### Semantic

| Name | Hex | Use |
|---|---|---|
| Clearance | `#30D158` | Success, "Run", running-state wheel, ready indicator |
| Alert | `#FF453A` | Error states |

---

## Typography

Canonical set — matches the live site at get-helm.app (`tokens.css`):

| Role | Font | Weight | Notes |
|---|---|---|---|
| Display / Wordmark | Playfair Display | 700–900 | Wordmark at 700, `letter-spacing: 0.06em`. Gold on dark, Abyss on light. |
| Headlines | Inter | 700–800 | Tight tracking. UI headings and hero copy. |
| UI / Body | Inter | 400–600 | Body 400, labels 500–600. |
| Data / Code | JetBrains Mono | 400–500 | Config paths, technical metadata, literal code. |

Helm never shouts. It uses restraint and weight to command attention.

> **Migration note (June 2026):** older docs variously listed SF Pro and Cormorant
> Garamond; the app still bundles Cormorant in `public/fonts/`. The live site is
> canonical. Swap off-spec assets to Playfair/Inter as they are next touched.

---

## The Mark — Ship's Wheel

A geometric ship's wheel — 8 spokes, outer ring, center hub — rendered in Sovereign
Gold on Abyss Navy. Constructed from:

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
Mark centered above wordmark. 14px gap between bottom of mark and cap-height of
wordmark. Wordmark in Playfair Display 700, Sovereign Gold, `letter-spacing: 0.06em`.

**Secondary — horizontal:**
Mark left-aligned, wordmark right, vertically centred on the mark's midpoint. Gap
between mark edge and wordmark = half the mark's diameter.

**Mark only:**
Used at small sizes (favicon, menu bar icon, app badge). Never use wordmark below
20px cap-height.

**Wordmark only:**
Used in running text, footers, and anywhere the mark has already appeared nearby.

---

## App Icon

Dark background tile (`#0A1628`) with macOS rounded rectangle mask (230px radius on
1024px canvas). Subtle nautical chart grid overlay at 5% opacity (gold lines, 22px
grid). Mark centered, gold on dark. No border.

Sizes: 1024px (App Store), 512px, 256px, 128px (Dock), 32px, 22px (menu bar
template — monochrome, no background, for native macOS tinting).

Files:
- `icon.svg` — full color 1024×1024 app icon
- `menubar-icon.svg` — 22×22 macOS menu bar template

---

## Popover UI

The menu bar popover is 320px wide. Dark background (`#0A1628`). Subtle chart grid
overlay at 5% opacity.

**Structure:**
```
┌─ Header: "Helm" wordmark left · status dot + label right ─┐
│  Section label: "WORKFLOWS"                                │
│  Workflow row × N                                          │
│  Mode bar: "Mode" · Launch / Teardown toggle (Pro)         │
└─ Footer: Settings · "+ Add a workflow" (gold, → capture) ─┘
```

"+ Add a workflow" opens the capture flow. At the free limit it shows a small
lock icon and leads to the upgrade overlay ("Helm Pro · yours forever — no
subscription").

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

Dark landing page. Nautical chart grid texture behind hero, fading to solid at
edges via radial vignette.

**Nav:** Wordmark left. Links center (Features, Workflows, Changelog). "Download
for Mac" CTA right — gold background, dark text.

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

## Features (for copy reference)

### Core
- **One-click workflow launch** — a single click from the menu bar opens every app in a workflow, in order, with the correct URLs and window state.
- **Capture** — Helm reads your current screen and turns it into a workflow: apps, Chrome tabs with their profile, VS Code workspace, Slack channel, open files. Build by doing, not by configuring.
- **Teardown** *(Pro)* — the reverse move. One click closes a workflow's apps and tabs — per Chrome profile, without touching anything else.
- **Focus mode** — clears everything that isn't the work.
- **Chrome profile isolation** — tabs open in the right Chrome profile, detected automatically. Override with one click.
- **Workflows** — named stacks of apps and URLs.
- **Menu bar native** — no Dock icon, no splash screen. Helm lives where power users already look.
- **JXA automation** — talks directly to macOS via JavaScript for Automation. Not URL schemes. Not shortcuts hacks. The real thing.
- **Workflows live on your machine** — stored locally, in Application Support.

### UI
- **Idle state** — clean list of workflows, each with a gold run button.
- **Running state** — the active run button becomes a spinning wheel in Clearance green. Other workflows dim. Status reads "Launching".
- **Wheel color rule** — the wheel is gold everywhere, always; it turns green only while a workflow is running.
- **CRUD** — add, edit, delete, reorder workflows directly from the popover.
- **System appearance** — follows macOS light/dark mode by default; user can override.

> Keep this list in sync with the product. CLAUDE.md is the authority on what is
> actually shipped — never promise a feature that isn't in the build.

---

## Pricing

| Tier | Price | Includes |
|---|---|---|
| Free | $0 | Two workflows. |
| Pro | $9, one time | Unlimited workflows. Teardown mode. |

No subscription.

**Copy rules:**
- "Free" is always qualified — "free for two workflows," never bare "Free."
- Never call the free tier a trial. It doesn't expire.
- The only paywall moment is the third workflow. In-app upgrade copy:
  *"Helm is free for two workflows. Unlimited is $9. One time."*
- Pro gates exactly two things — unlimited workflows and teardown (verified in
  code). Don't claim more is included, and don't gate more in copy than the app
  gates.

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
