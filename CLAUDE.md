# Helm — Claude Workspace Instructions

## What This Project Is

**Helm** is a macOS menu bar workflow orchestrator. One click opens your entire configured app stack. Built for executives and power users who don't slow down for their tools.

- **Tagline:** "Take the wheel."
- **Brand concept:** "The Bridge" — precision instruments, nautical chart grid, gold on deep navy
- **Project path:** `~/claude-workspace/workflow-orchestrator/`
- **Distribution:** signed + notarized universal DMG, hosted on Cloudflare R2, auto-updates via electron-updater

> **Windows port in progress** (branch `windows-port`). All OS automation now
> routes through `electron/platform/`, which dispatches on `process.platform`.
> `darwin.js` is a pure relocation of the old inline `main.js` logic — macOS is
> the shipping revenue path, so behaviour changes there are release-blocking.
> See `WINDOWS.md` for the capability matrix, security notes, and the list of
> things never yet run on a real Windows machine.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript → compiled to `dist/` via `tsc` (Electron main + JXA are plain JS) |
| Desktop shell | Electron v42 |
| macOS automation | JXA (JavaScript for Automation) via `osascript` |
| Native AX module | Objective-C++ via `node-addon-api` (`native/profile-probe/`) |
| SQLite reads | System `/usr/bin/sqlite3` CLI (no native driver) |
| Renderer | Plain HTML/CSS/JS — no framework |
| Workflow / settings storage | `~/Library/Application Support/Helm/Helm/workflows.json` and `settings.json` |
| Packaging | `electron-builder` — signed universal DMG + zip |
| Auto-update | `electron-updater` — reads `latest-mac.yml` from R2 |
| Distribution | Cloudflare R2 (`helm-updates` bucket) |
| License backend | Val.town serverless (`helmCheckout`, `helmActivate`) |
| Payments | Stripe Checkout |
| Transactional email | Resend (license keys) |

---

## Project Structure

```
workflow-orchestrator/
├── electron/
│   ├── main.js              # Tray + BrowserWindow + IPC handlers + capture/teardown
│   ├── preload.js           # contextBridge for renderer
│   └── license.js           # license storage + validation
├── public/
│   ├── index.html           # Menu bar popover UI (all workflow CRUD + capture flow)
│   ├── welcome.html         # First-run onboarding
│   ├── brand/               # icon.svg, menubar-icon.svg, brand.md
│   └── fonts/               # JetBrains Mono / Inter / Cormorant
├── src/
│   ├── config.ts            # Legacy default workflow defs (mostly superseded by user data)
│   ├── index.ts             # CLI entry point
│   └── platform/macos/
│       ├── launch.jxa            # Open apps with optional deep links
│       ├── capture.jxa           # Enumerate open apps/windows/tabs
│       ├── close.jxa             # Teardown (per-profile Chrome aware)
│       ├── focus.jxa             # Focus-mode app rules
│       ├── chrome_profiles.jxa   # Read Chrome Local State
│       ├── slack_state.py        # Slack workspace/channel introspection
│       └── vscode_state.py       # VS Code open folder/files
├── native/
│   └── profile-probe/       # node-addon-api AX module (universal binary)
├── scripts/
│   ├── chrome-profile-probe/     # Swift helper (universal Mach-O fat binary)
│   ├── upload-release.sh         # Pushes dist/* to R2 via aws-cli
│   ├── notarize.js               # electron-builder afterSign hook
│   ├── build-icon.sh             # Render PNG variants from SVG
│   ├── render-icon.js            # Icon rasterizer
│   ├── make-dmg-bg.py            # DMG background image
│   ├── generate-key.js           # License signing key generator
│   ├── val-helmCheckout.ts       # Val.town Stripe webhook handler (mints + emails license keys)
│   ├── val-helmActivate.ts       # Val.town license activation handler
│   └── val-helmFeedback.ts       # Val.town in-app feedback relay
├── dist/                    # Build output: universal DMG + zip + blockmaps + latest-mac.yml (gitignored)
├── CLAUDE.md                # This file
├── package.json             # electron-builder config in `build` key
└── tsconfig.json
```

**Runtime data lives in `~/Library/Application Support/Helm/Helm/`** (the extra `Helm/Helm` is from Electron's userData + an inner subdir Helm creates): `workflows.json`, `settings.json`, `license.json`, `welcomed` marker.

---

## NPM Scripts

```bash
npm run build         # tsc only + copy *.jxa into dist/jxa/
npm start             # tsc + node dist/index.js  (CLI runner)
npm run menu-bar      # tsc + electron electron/main.js  (dev menu bar app)
npm run pack          # electron-builder --mac → signed universal DMG + zip in dist/
npm run release       # pack + publish (electron-builder auto-publish)
npm run build-helper  # Compile universal Swift chrome-profile-probe binary
npm run build-icon    # Render PNG variants of the brand icon
```

> Always wrap `pack`/`release` in `caffeinate -dimsu` so notarization doesn't fail on system sleep.

---

## How It Works

### 1. Capture flow (build a workflow)
1. User clicks "Capture state" in the popover.
2. `capture.jxa` enumerates visible apps via System Events. For each known app type it pulls structured data: Chrome → URL + tab title + window title, Notion → deep link, VS Code → workspace, Slack → workspace/channel, Preview/PDFgear → open file paths, etc.
3. `main.js` post-processes the JXA result: filters nameless processes, deduplicates single-instance apps, enriches Slack/VS Code via Python state probes, attributes Chrome profile via AX + History DB (see flow 4).
4. Renderer shows each row with mode toggles (open / teardown / both / skip) and a profile picker for Chrome.
5. Save writes to `workflows.json` after the validator strips/filters fields.

### 2. Launch flow (open a workflow)
1. Renderer triggers `run-workflow` IPC with a workflow ID.
2. For each `AppTarget` in `apps`, `main.js` spawns `osascript -l JavaScript launch.jxa <appName> <urlOrPath?> <profile?>`.
3. `launch.jxa` matches the app and runs the right Apple Events / shell-`open` recipe. Chrome with a profile uses `open -a 'Google Chrome' --args --profile-directory='<dir>' '<url>'` for true profile isolation.

### 3. Teardown flow (close apps on workflow change or "focus mode")
1. `close.jxa` accepts an app name, an optional URL to close just that tab, and an optional window-title filter list.
2. For Chrome targets with a `profile` set, `main.js` first builds a live `{windowTitle: profileDir}` map by parsing window titles + Chrome Local State, and passes the matching titles to `close.jxa` so it only closes that profile's tabs.

### 4. Chrome profile detection (zero-friction)
The capture pipeline attributes a profile directory (`Default` / `Profile N`) to each Chrome row using two complementary sources:

- **AX (native module)** — `native/profile-probe/profile_probe.mm` enumerates Chrome windows on the *current Mission Control Space* via Accessibility APIs and reads their system title (e.g. `"… - Google Chrome – Richard (Personal)"`). High confidence but Space-limited; only sees windows visible to the AX tree right now.
- **History SQLite fallback** — For every captured Chrome URL, copy each profile's `History` DB to `/tmp/`, query `SELECT url, MAX(last_visit_time) FROM urls WHERE url IN (…)`, then assign URL → profile with the most recent visit. Covers all Spaces / off-screen windows / minimized windows. No permissions needed.
- **Manual picker** — Avatar icon on each Chrome row opens a frosted-glass popup; user can override.

Profile name resolution uses Chrome's `Local State` `profile.info_cache` (read directly in JS) — combinations of `name`, `gaia_given_name`, and `user_name` build a catalog the AX path matches titles against.

### 5. License / payments
1. User clicks "Upgrade" → opens Stripe Checkout URL (Val.town `helmCheckout`).
2. Stripe webhook hits Val.town `helmCheckout` → signs a license payload with Ed25519 (`HELM_LICENSE_PRIVATE_KEY`, Val.town-only) → emails via Resend.
3. User pastes key into Helm → `license.js` verifies the Ed25519 signature with the public key embedded in `electron/runtime-config.js` → stores in app userData. `helmActivate` re-verifies server-side with its own `HELM_LICENSE_PUBLIC_KEY` env (least privilege: minter and verifier each hold only what they need).

### 6. Auto-update
1. `electron-updater` polls `latest-mac.yml` from R2 on launch.
2. If new version → downloads zip to `~/Library/Caches/helm-updater/pending/`.
3. Applies on next quit + relaunch.

---

## Known Issues & Technical Debt

- **TCC binds to code-signature hash, not app identity.** Every rebuild produces a different hash; macOS may treat a 1.0.0 → 1.0.1 upgrade as a "different app" and lose the Accessibility + Keychain grants. Existing users may need to remove + re-add Helm in System Settings on first upgrade. Stable signing identity across releases minimizes this.
- **`npm run pack` hangs at finalize.** electron-builder finishes producing DMG + zip but doesn't always exit cleanly. Safe to `pkill -f electron-builder` once both `dist/Helm-*.dmg` and `dist/Helm-*.zip` exist.
- **Notarytool dies on long network polls.** `--wait` times out or fails on connection blips. The submission survives on Apple's side — re-attach with `xcrun notarytool wait <submission-id>` to resume.
- **Chrome profile attribution misses brand-new URLs.** If a user just opened a URL and it hasn't synced to the History DB yet, the fallback won't find it. AX path catches it if on current Space.
- **Dev mode vs prod TCC differ.** `npm run menu-bar` runs as Electron.app (different TCC identity than Helm.app); some flows behave differently in dev than in the installed `/Applications/Helm.app`.
- **Electron main is plain JS.** Not in the TS pipeline. Intentional for now (avoids tsc edit-cycle on tray code).
- **Dead AX walk in `chrome_profiles.jxa`.** Superseded by the native module; should be deleted in cleanup pass.

---

## Docs & Marketing Map

> Full document map: `DOCS_MAP.md` (root). Launch/marketing work lives in
> `marketing/` (SCHEDULE.md calendar, warmup-content.md post copy,
> founder-technical-faq.md) and `ads/` (PH/HN/press/directory/physical copy,
> tracked in `AD_TODO.md`). Session continuity: `handoff-notes.md`, newest
> entry on top. All public-facing copy requires founder review before publish.

## Brand System

> Canonical brand doc: `public/brand/brand.md`. If anything below disagrees with it, brand.md wins.

### Colors
| Name | Hex | Use |
|------|-----|-----|
| Abyss | `#0A1628` | App background |
| Helm Navy | `#1E3A5F` | Card surfaces, gradients |
| Sovereign Gold | `#D4AF6A` | Icon, CTAs, active states |
| Burnished | `#B8922A` | Pressed/hover gold |
| Chalk | `#F7F4EF` | Text on dark |
| Fog | `#C8C4BC` | Secondary text |
| Clearance | `#30D158` | Success states |
| Alert | `#FF453A` | Error states |

### Typography
- **Display / Wordmark:** Playfair Display 700, letter-spacing 0.06em
- **Headlines:** Inter 700–800, tight tracking
- **UI / Body:** Inter 400–600
- **Data / Code:** JetBrains Mono
- Canonical = live site (get-helm.app tokens.css). Bundled Cormorant in `public/fonts/` is legacy; swap to Playfair when next touched.

### Voice Rules
- Calm, direct, present tense
- No exclamation points — ever
- Short sentences. Active verbs.
- "Your stack is ready." not "Your apps have been successfully launched!"

---

## Coding Conventions

- **Read files before editing.** Never assume file contents.
- **Ask before adding dependencies.** Lean stack is intentional.
- **No comments explaining what code does** — only comment *why* when non-obvious.
- **TypeScript strict mode is on** — no `any`, no `ts-ignore` without explanation.
- **Electron security:** always `contextIsolation: true`, always use the preload bridge. Never set `nodeIntegration: true`.
- **No UI frameworks** in the renderer — keep it plain HTML/CSS/JS unless there's a strong reason.
- **Dev vs prod parity:** after editing `electron/main.js` or `public/index.html`, dev mode (`npm run menu-bar`) reflects changes but TCC + asar packaging may differ from production. Validate any release-blocking change with `npm run pack` + reinstall to `/Applications/Helm.app`.
- **Native module changes:** after editing `native/profile-probe/*.mm`, run `npx @electron/rebuild -m native/profile-probe --force` before `npm run pack` or the rebuild may use cached objects.

---

## Distribution

- **R2 bucket:** `helm-updates`
- **Current download URL:** `https://pub-ec64f4f5098d43328a5073456b0d41ab.r2.dev/` (will move to `updates.get-helm.app`)
- **Files in the bucket per release:**
  - `Helm-<version>-universal.dmg` (+ `.blockmap`)
  - `Helm-<version>-universal-mac.zip` (+ `.blockmap`)
  - `latest-mac.yml` — auto-updater manifest pointing to the current version
- **`scripts/upload-release.sh`** uploads everything in `dist/` via the AWS S3 API (R2 is S3-compatible).

---

## Release Process

```bash
# 1. Bump version in package.json
# 2. Build + sign + notarize
caffeinate -dimsu npm run pack

# 3. (If notarytool was skipped by electron-builder) submit manually
xcrun notarytool submit dist/Helm-<v>-universal.dmg \
  --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD" --wait --timeout 30m

# 4. Staple the ticket so the DMG works offline
xcrun stapler staple dist/Helm-<v>-universal.dmg

# 5. Upload to R2 (uses .env credentials)
bash scripts/upload-release.sh

# 6. Verify auto-update from a previous version
#    Install Helm-<previous>.dmg locally, launch, check log for
#    "Found version <v>" and "New version <v> has been downloaded".
```

---

## Required `.env` keys

For full release pipeline:
```
APPLE_ID=…                          # Apple Developer account email
APPLE_TEAM_ID=…                     # 10-char team ID
APPLE_APP_SPECIFIC_PASSWORD=…       # generated at appleid.apple.com
R2_ACCOUNT_ID=…
R2_ACCESS_KEY_ID=…
R2_SECRET_ACCESS_KEY=…
# License signing: Ed25519 keypair. Private key lives ONLY in Val.town (helmCheckout
# env HELM_LICENSE_PRIVATE_KEY) + local .secrets/helm-license-private.pem; public key
# is shipped in electron/runtime-config.js and set as HELM_LICENSE_PUBLIC_KEY on helmActivate.
HELM_STRIPE_URL=…                   # Stripe Checkout link
HELM_FEEDBACK_EMAIL=…               # in-app feedback destination
RESEND_API_KEY=…                    # license-email send (lives in Val.town env)
```

---

## Roadmap (Priority Order)

1. **Stripe payouts paused** — account verification overdue in the Stripe dashboard; must resolve before any real purchase can pay out.
2. **Stripe livemode switch** — new payment link + webhook secret; update `HELM_STRIPE_URL` and `STRIPE_WEBHOOK_SECRET` in `.env` and Val.town.
3. **Product Hunt prep** — copy, coming-soon page, hunter. Deadline June 24.
4. **Custom R2 domain `updates.get-helm.app`** (in progress) — replaces the rate-limited `pub-*.r2.dev` URL.
5. **Welcome popover** explaining the Chrome avatar icon + profile picker.
6. **Cleanup pass:** done in source — AX-walk removed from `chrome_profiles.jxa` (live); `WindowProfiles` removed from `native/profile-probe/profile_probe.mm` (needs native rebuild + pack to ship).
7. Mobile companion / pitch deck — future.

<!-- stripe-projects-cli managed:claude-md:start -->
look at AGENTS.md for your rules
<!-- stripe-projects-cli managed:claude-md:end -->
