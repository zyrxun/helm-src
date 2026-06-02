# Helm — Claude Workspace Instructions

## What This Project Is

**Helm** is a macOS menu bar workflow orchestrator. One click opens your entire configured app stack. Built for executives and power users who don't slow down for their tools.

- **Tagline:** "Take the wheel."
- **Brand concept:** "The Bridge" — precision instruments, nautical chart grid, gold on deep navy
- **Project path:** `~/claude-workspace/workflow-orchestrator/`

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript → compiled to `dist/` via `tsc` |
| Desktop shell | Electron v42 |
| macOS automation | JXA (JavaScript for Automation) via `osascript` |
| Renderer | Plain HTML/CSS/JS — no framework |
| Config storage | `src/config.ts` today → migrating to `~/Library/Application Support/Helm/workflows.json` |

---

## Project Structure

```
workflow-orchestrator/
├── electron/
│   ├── main.js          # Tray + BrowserWindow + IPC handlers
│   └── preload.js       # contextBridge: api.getWorkflows, api.runWorkflow
├── public/
│   ├── index.html       # Menu bar popover UI
│   └── brand/
│       ├── icon.svg         # 1024×1024 full-color app icon
│       ├── menubar-icon.svg # 22×22 monochrome menu bar template
│       └── brand.md         # Full brand system reference
├── src/
│   ├── config.ts            # Typed workflow definitions (AppTarget[], Workflow[])
│   ├── index.ts             # CLI entry point
│   └── platform/macos/
│       └── launch.jxa       # JXA bridge — opens apps, navigates browsers
├── dist/                    # Compiled output (gitignored)
├── CLAUDE.md                # This file
├── package.json
└── tsconfig.json
```

---

## NPM Scripts

```bash
npm run build       # tsc only
npm start           # tsc + node dist/index.js  (CLI runner)
npm run menu-bar    # tsc + electron electron/main.js  (menu bar app)
```

---

## How It Works

1. `src/config.ts` exports `userWorkflows: Workflow[]` — each workflow has an `id`, `name`, and `apps: AppTarget[]`
2. The engine finds a workflow by ID, then for each `AppTarget` spawns `osascript -l JavaScript launch.jxa <appName> <url?>`
3. The JXA script calls `Application(appName).activate()` and optionally sets `windows[0].activeTab.url` for Chrome/Safari
4. In Electron mode, this same exec logic runs inside an IPC handler (`run-workflow`) triggered by the renderer's Run button
5. The renderer never touches Node directly — all access is through the `contextBridge` preload

---

## Known Issues & Technical Debt

- **JXA path hack:** `launch.jxa` is resolved from `src/` at runtime because `tsc` doesn't copy non-TS assets to `dist/`. Will break with `electron-builder`. Fix: add a `cp` step to the build script.
- **Hardcoded config:** Workflows live in `src/config.ts`. Migration target: `~/Library/Application Support/Helm/workflows.json` with CRUD from the UI.
- **Electron main is plain JS:** `electron/main.js` is not TypeScript. Should be brought into the TS pipeline.
- **Icon placeholder:** Menu bar icon in `electron/main.js` is a base64 PNG stub. Should use the real `public/brand/menubar-icon.svg` converted to PNG.
- **Electron install:** First install may hit an `EEXIST` symlink error. Fix: `rm -rf node_modules/electron && npm install`

---

## Brand System

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
- **Wordmark:** Cormorant Garamond Bold
- **Headlines:** Inter 700–800, tight tracking
- **UI / Body:** Inter 400–500
- **Data / Code:** JetBrains Mono

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

---

## Roadmap (Priority Order)

1. Fix Electron launch + wire real SVG menu bar icon
2. Migrate config to `~/Library/Application Support/Helm/workflows.json`
3. Workflow CRUD UI in the popover
4. Logo — wordmark + mark, light/dark SVG variants
5. Website — dark landing page, grid texture, animated wheel hero
6. Pitch deck — 10 slides
7. Mobile app — iOS, same design language

<!-- stripe-projects-cli managed:claude-md:start -->
look at AGENTS.md for your rules
<!-- stripe-projects-cli managed:claude-md:end -->
