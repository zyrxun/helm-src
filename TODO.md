# Helm — Pre-Launch TODO

## Blockers (breaks the experience)

- [x] Add `author` field to `package.json` (electron-builder warns; required for signed builds)
- [x] Login item — add "Launch at Login" toggle via `app.setLoginItemSettings()` in `electron/main.js`, expose to renderer
- [x] Accessibility permissions gate — detect if Accessibility access is granted; if not, show clear in-app prompt with link to System Settings → Privacy & Security → Accessibility; surface the reason when a workflow fails silently
- [x] Publish an initial release to `helm-releases` — auto-updater throws on every packaged launch until a RELEASES file exists in the repo

## Important gaps (bad UX)

- [x] First-run / empty-state onboarding — when `workflows.json` is missing or empty, show a "Create your first workflow →" prompt instead of a blank popover
- [x] Tray icon Retina — provide `menubar-icon@2x.png` (36×36) alongside the 18×18; set `setTemplateImage(true)` correctly so it's crisp on Retina displays
- [x] Privacy policy — required before Stripe goes live and for GDPR/CalOPPA compliance (email collected at checkout)
- [x] Clean up `helm-src` git history — remove committed `.DS_Store` and `Icons and design/*.zip` blobs (`git rm --cached`, add to `.gitignore`, recommit)

## Needs setup (external services)

- [x] Stripe — create $9 one-time payment link, wire webhook to `helmCheckout` Val.town, update `HELM_STRIPE_URL` in `.env`
- [x] Resend — sign up, get API key, verify domain, set `HELM_FROM_EMAIL` in Val.town env vars so license keys are actually delivered
- [x] Apple Developer enrollment ($99/yr) — fill `APPLE_ID`, `APPLE_APP_PASSWORD`, `APPLE_TEAM_ID` in `.env` for notarized builds
- [x] Bundle fonts locally — replace Google Fonts CDN link in `public/index.html` with self-hosted Inter / JetBrains Mono / Playfair Display

## Beta distribution

- [x] Upload DMG to Google Drive / Dropbox and share download link with testers (iMessage/AirDrop for nearby testers)
- [x] Add in-app "Report a bug" button in Settings panel — opens mailto: or Typeform so testers can send feedback without needing to find your contact
- [x] Add Sentry crash reporting — automatically captures crashes in the background; testers don't need to do anything, you see errors in Sentry dashboard (free tier, ~10 lines for Electron)

## Auto-update (electron-updater → Cloudflare R2)

- [x] Wire `electron-updater` in `main.js` pointing at R2 bucket `helm-updates`
- [x] Add `publish` config to `package.json` so `npm run pack` generates `latest-mac.yml`
- [x] Write `scripts/upload-release.sh` to push release files to R2
- [ ] **To ship a new release:**
  1. Bump version in `package.json` (e.g. `1.0.0` → `1.0.1`)
  2. Build + sign + notarize: `export $(cat .env | grep -v '#' | xargs) && npm run pack`
  3. Upload to R2: `bash scripts/upload-release.sh`
  4. Users will be notified in-app automatically on next launch

## App size & security

- [ ] Size optimization — app is currently 1.48 GB; investigate electron-builder ASAR compression, stripping unused locales (`--` extraResources), pruning devDependencies from bundle, and switching to a smaller Electron base. Target: under 200 MB.
- [ ] Security audit — review HELM_LICENSE_SECRET exposure in packaged binary (currently readable via strings on the DMG); consider moving all HMAC validation server-side only and removing local secret from the build.

## Future features

- [ ] Per-URL window placement in workflow config — let users tag tabs as `{ window: "new" }` or group multiple URLs into a named window so a workflow can split contexts (e.g. Mail in its own window, the 5 Linear tabs grouped, Slack in a third). Default stays as "all tabs in front window" (current behavior).
- [ ] Hide Stage debug/console + timestamp UI in the prelaunch launch-video iframe — currently visible to users despite the iframe being pointer-events:none. Either strip the controls from `Helm Launch Video (standalone).html` Stage component or overlay-mask them on the iframe side.
- [ ] Spotify Web API integration — OAuth login to browse + save specific playlists (not just current track); requires Spotify Developer app + token refresh flow
- [ ] Per-app refresh in workflow edit view — "re-capture this app" button on individual rows so e.g. Spotify track can be updated without rebuilding the whole workflow
- [ ] Shareable workflow cards (v1.1 growth feature) — on workflow save, offer to generate a shareable PNG card showing the stack (workflow name + app list + Helm branding); Canvas API client-side, no backend needed. Buttons: Copy image, Copy tweet. Follow-up v1.2: shareable get-helm.app/stack#[base64] URL with Open Graph preview for Twitter/iMessage link previews. Ship 2–3 weeks post-launch once users are attached to the product.

## Domain & email (get-helm.app)

- [x] Cloudflare Pages — push landing page HTML to GitHub repo, connect get-helm.app as custom domain
- [x] Email forwarding — set up hello@get-helm.app → personal Gmail in Cloudflare (free, 5 min)
- [x] Resend domain verification — verify get-helm.app in Resend so license keys send from noreply@get-helm.app

## Before public launch (needs external accounts)

- [x] Stripe test mode — payment link, webhook, Val.town handler all wired and tested
- [ ] Stripe livemode — switch to live keys: new payment link, new webhook secret, update `HELM_STRIPE_URL` and `STRIPE_WEBHOOK_SECRET` in `.env` and Val.town env vars
- [x] Resend — sign up, get API key, verify domain, set `HELM_FROM_EMAIL` in Val.town env vars so license keys are actually delivered
- [x] Apple Developer enrollment ($99/yr) — start early, Apple verification takes 1–2 days; needed for code signing + notarization so Gatekeeper doesn't block paying customers
- [x] Privacy policy — required before Stripe goes live (GDPR/CalOPPA, email collected at checkout)
- [x] Website / landing page — launch and prelaunch HTML ready

## Code-review pass 1 — main process (verified findings, fix before launch)

### Blockers
- [ ] **B1.** `.env` was shipped inside `app.asar`. Done: removed from `build.files`, rotated `HELM_LICENSE_SECRET` + Apple app-specific password + Resend `Helm` key (revoked), migrated license signing from HMAC → Ed25519 (server holds private key, client only verifies with embedded public key), moved feedback path behind new Val.town `helmFeedback` endpoint (deployed + tested), added `scripts/audit-release.sh` pre-upload guard wired into `scripts/upload-release.sh`, introduced `electron/runtime-config.js` for safe-to-ship constants. Additional hardening: `helmActivate` now reads `HELM_LICENSE_PUBLIC_KEY` directly (no longer derives the public key from the private — minter and verifier each hold only what they need). Remaining: rebuild + reupload 1.0.2 so the no-secrets DMG supersedes the leaked 1.0.0/1.0.1.

### Lower-priority secret rotations (current beta is trusted, so low immediate risk)
- [ ] **B1a.** Rotate `META_PAGE_ACCESS_TOKEN` at developers.facebook.com (token wasn't referenced from code yet — was waiting on marketing tooling — but is in the public DMGs).
- [ ] **B1b.** Rotate `SENTRY_DSN` at sentry.io (optional — write-only credential, worst case is fake event spam against quota; leak risk is low).
- [ ] **B1c.** Verify `get-helm.app` at https://resend.com/domains so feedback emails come from `noreply@get-helm.app` instead of `onboarding@resend.dev` (currently using Resend's default test sender).
- [x] **B2.** Per-profile teardown is broken end-to-end. `electron/main.js:622` joins matching titles with `''` but `src/platform/macos/close.jxa:29` splits on `\x1f`. Even with the join fixed, the fallback regex at `close.jxa:59` uses ` - ` (hyphen) while Chrome's disambiguator is ` – ` (en-dash). And the primary `chromeWindowProfilesViaTitle()` (`main.js:112`) reads titles via Apple Events, which return only the tab title — no profile suffix — so the map is always empty and falls into the broken fallback regardless. Result: per-profile teardown closes tabs across *all* profiles. Fix: change join to `'\x1f'`; align en-dash in close.jxa regex; switch the live title source from Apple Events to the native AX module (which does return the full suffix).

### Should-fix
- [x] **S1.** Name validator mismatch. `electron/main.js:501` saves with `isSafeDisplayString` (allows `()&!`), but launch and teardown gate on stricter `isSafeString` (`main.js:596`, `:668`). Apps like "Microsoft Teams (work or school)" save fine but silently never open. Fix: use `isSafeDisplayString` at execution sites (execFile uses argv, no shell, so the strict filter buys nothing).
- [x] **S2.** `closeApps[].urlToOpen` validated and consumed but never persisted. `main.js:834` saves only `{ name }`. Result: a "close this tab" target closes the whole browser instead. Fix: add `...(a.urlToOpen && isSafeUrl(a.urlToOpen) ? { urlToOpen: a.urlToOpen } : {})` to the `closeApps.map`.
- [x] **S3.** `main.js:598` strips `'` from app names before passing to close.jxa. No shell layer (execFile argv), so this is pure corruption — `"Pat's Tools"` becomes `"Pats Tools"` and `Application(…)` won't match. Delete the `.replace(/'/g, '')`.
- [x] **S4.** `electron/storage.js:37` `writeFileSync` is non-atomic. Mid-write crash leaves invalid JSON; `load()` then backs up and resets to `[]`, so the UI shows empty workflows. Fix: write to a temp file in the same dir, then `fs.renameSync` over the original.
- [x] **S5.** Auto-update behavior contradicts CLAUDE.md. `main.js:448` sets `autoInstallOnAppQuit = false`, so a quit alone doesn't install; user must click the prompt (calls `quitAndInstall` via `main.js:932`). Either flip to `true` or fix the doc.
- [x] **S6.** `run-workflow` IPC handler (`main.js:732`) skips `activeExecutionGuard`. Teardown (`:734`) and hotkey path (`:704`) both use it. Double-click on Run launches everything twice; can interleave with a teardown. Wrap `run-workflow` in the same guard.
- [x] **S7.** Launch failures invisible. `main.js:679` passes `() => {}` as execFile callback. An uninstalled app or JXA error produces no feedback. Minimal fix: on error, reuse the existing `workflow-warning` channel with a new type and the app name; renderer copy `"Could not open Notion."` (brand voice).

### Nice-to-have
- [x] **N1.** Resolved by the Ed25519 migration: key delimiter is now `.` (not in the base64url alphabet), so `split(".")` is unambiguous. The dash-collision concern no longer applies.
- [x] **N2.** `hasAccessibility()` results cached for 30s so burst run/teardown/IPC traffic doesn't run a blocking osascript every call.
- [x] **N3.** Feedback message capped at 10,000 chars before Sentry/Val forwarding.
- [x] **N4.** Deep-link `activateLicense` now wrapped with `.catch()` — no unhandled rejection on save failure.

### Other verified (from "unverified" → confirmed real)
- [x] **U1.** Resolved by the S8 patch: the Spotify URI now flows through the standard `urlToOpen` field (capture.jxa:100 → save mapping → run → launch.jxa:167 `playTrack`). No separate `spotifyUri` plumbing needed.

### Pending review passes
- [x] Pass 3 — Val.town + native module (findings below).

## Code-review pass 2 — renderer + JXA + state probes (verified)

### Blocker
- [x] **B3.** Capture poller silently wipes the user's mode selections + name input every 4 seconds. `public/index.html:1430` calls `renderPreview()` with no args; `renderPreview(preserveSelection = false, …)` defaults to RESET — line 1597 rebuilds `appModes` as all-open, line 1918 clears the name field. So mid-capture any new window detected by the poller wipes everything the user has clicked/typed, with no visible reason. Edit flow is worse: `openEdit` (`:2046`) reconstructs both/close/skip modes carefully, then starts the same poller (`:2079`); one new window resets the entire edit to all-open. Fix: change line 1430 to `renderPreview(true, true)` mirroring the existing call at `:2096`.

### Should-fix
- [x] **S8.** Spotify never resumes the captured track. `capture.jxa:97` emits `track.spotifyUrl()` (a `spotify:track:…` URI) as `urlToOpen`, but `SAFE_URL` (`main.js:475`) only matches `https|notion|slack|figma|obsidian` so the URI is stripped at the validator. `launch.jxa:167` then never sees it and Spotify reopens to whatever was last playing. Fix: add `spotify` to `SAFE_URL` *and* relax the `://` requirement (Spotify URIs use `spotify:track:…`, no `://`) — or use a separate URI validator for non-http schemes. Then confirm Spotify's AppleScript `spotifyUrl()` returns the URI form vs the `https://open.spotify.com/…` form on the target Mac — current `launch.jxa:167` only handles `spotify:` prefix, so an https URL would still be ignored even if it survived validation.
- [x] **S9.** Teardown — a Pro feature — bypassable for free. The renderer hides the Teardown button behind `isPro` (`index.html:1352`), but the mode-toggle global hotkey path doesn't gate. `registerModeToggleHotkey` (`main.js:582`) and the duplicate at `:720` both call `setTeardownMode` without an entitlement check, and `set-mode-toggle-hotkey` (`main.js:749`) lets any user bind the hotkey from Settings. A free user binds it, presses it, then every per-workflow shortcut routes through `teardownWorkflowById` at line 714 instead of `runWorkflowById`. Fix: gate `setTeardownMode(true, …)` on `isUserAuthorized()` in main where the enforcement actually matters, not just in the renderer.
- [x] **S10.** Slack deep-link probe reads a hard-coded LevelDB filename. `src/platform/macos/slack_state.py:10` opens `…/leveldb/000004.log`, but LevelDB rotates that number on every compaction. For most users the active log is `000005.log` or higher, the probe fails quietly, `enrichSlackApps` (`main.js:88`) swallows the empty result, and Slack falls back to the manual paste UI with no error indication. Fix: glob the directory for `*.log` and read the most-recently-modified (or highest-numbered) file.

### Nice-to-have
- [x] **N5.** Focus mode header now built with `createElement` + `textContent` — a Focus named `</` or `&` no longer breaks markup. `index.html:1520` interpolates `currentFocusMode` into `header.innerHTML`. Source is the user's own macOS Focus list (not attacker-reachable), and contextIsolation + no nodeIntegration keep blast radius cosmetic — but a Focus named with `</` or `&` breaks the markup. Switch to `textContent` like sibling elements.
- [x] **N6.** Visibility check changed from `'shown'` (never matched) to `'visible'`. Main sends `'visible'` / `'hidden'` (`main.js:416`, `:419`); renderer at `index.html:2302` checks `state === 'shown'`, which never matches. The intended teardown-mode re-sync still happens via the `'visible'` branch below it, so nothing breaks — just misleading. Change `'shown'` → `'visible'` (or delete).
- [x] **N7.** Doubled `stopCapturePoller()` call in `cancelCapture` removed.
- [x] **N8.** `enrichCodeApps` now sets `folderPath` alongside `filePath` so the 📄 glyph renders for VS Code rows.

### Cleanup (carried from pass 1, now confirmed dead code)
- [x] **C1.** Resolved by the S8 patch: the dead `spotifyUri` save-mapping entry was removed when Spotify migrated to the unified `urlToOpen` path. No orphan field in `main.js` save mapping.

### Re-verified clean (no action needed)
- `teardownWorkflowById` closing `workflow.apps` is intentional ("the reverse of run") per `welcome.html:185`. Distinct concept from `closeApps` (which is launch-time "close these before opening").
- No reachable shell injection through JXA `doShellScript` paths — every interpolated value is either single-quote-escaped + validated by `isSafeString`, or a hard-coded verb.

## Code-review pass 3 — Val.town handlers + native AX module (verified)

### Should-fix
- [x] **S11.** Stripe webhook duplicates mint a new valid key every retry. `scripts/val-helmCheckout.ts:161` calls `mintKey` on every `checkout.session.completed`, and `mintKey` (`:70`) uses fresh `randomBytes(4)` per call — so every delivery of the same event produces a different, independently-valid key. Stripe delivers at-least-once and retries on any non-2xx; one purchase legitimately can arrive multiple times. Each key is good for 2 machines (`val-helmActivate.ts:127`), so one purchase can yield far more than 2 activations. Fix: derive nonce deterministically from the Checkout Session id, and before minting check a blob keyed by that session id — if a key was already minted, return the same key (or just `{ok:true}`) instead of minting again.
- [x] **S12.** No timestamp tolerance on the Stripe signature check. `verifyStripeSignature` (`val-helmCheckout.ts:49`) extracts `t` and `v1`, recomputes the HMAC, compares — but never checks `t` is recent. Stripe's own verification rejects timestamps outside a 5-minute default precisely to stop replay. Without it, anyone who once observes a valid signed `checkout.session.completed` body can resend it indefinitely; combined with S11 each replay mints another valid key. Fix: after extracting `ts`, reject if `Math.abs(Date.now()/1000 - Number(ts)) > 300`.
- [x] **S13.** Likely root cause of "license emails unreliable" roadmap item. `val-helmCheckout.ts:136` returns `{ok:true, status:"dry_run_bypass"}` and exits before signature verification, minting, or email whenever `STRIPE_WEBHOOK_SECRET` is `""` or the placeholder. In production this converts a missing env var into a silent 200 success — Stripe sees delivery succeed, no retry, no key, no email, no error anywhere. Fix: gate the dry-run on an explicit non-production signal (e.g. `Deno.env.get("HELM_DRYRUN") === "1"`), and treat a missing secret in production as a loud 500. Verify the deployed Val.town env actually has `STRIPE_WEBHOOK_SECRET` set; if not, that's the symptom.

### Nice-to-have
- [x] **N9.** Dropped `key` from webhook response body on email failure; replaced raw-key log with sha256 prefix + email. `val-helmCheckout.ts:168` returns `{ok:true, key, warning:"email_failed"}` when Resend fails — the key (a bearer credential) ends up in Stripe's webhook delivery log. `val-helmCheckout.ts:171` `console.log`s the full key when email isn't configured. Both are server-side so exposure is dashboard-only, but a credential at rest in third-party UIs is avoidable. Fix: drop `key` from the response body; log only a hash prefix or masked email, not the key.
- [x] **N10.** Rate-limit bucket key now derives from `WINDOW_MS` (the same constant the in-bucket reset uses). Limit reads as "MAX_ATTEMPTS per WINDOW_MS." TOCTOU on the read-modify-write left as-is (acceptable for a license endpoint per reviewer). Both handlers (`val-helmCheckout.ts:11–16`, `val-helmActivate.ts:9–14`) key the bucket on `currentHour = floor(now / 3_600_000)` while also enforcing a `WINDOW_MS = 15 min` sliding reset inside that bucket. Effective limit is "MAX_ATTEMPTS per clock-hour bucket," and a request at :59 and :00 fall in separate buckets. The two-step getJSON/setJSON is also a TOCTOU that can undercount under burst load. Acceptable for a license endpoint (not a security hole) — reconcile the two time constants so the limit means what it reads.

### Native AX module (`native/profile-probe/`, `scripts/chrome-profile-probe/`)
- [x] **N11a.** Word-boundary anchor `\b(Default|Profile [0-9]+)\b` in `profile_probe.mm` prevents `"Profile 4 Guide"` false matches.
- [x] **N11b.** Resolved by N11c — dead Swift code deleted, so the `runningChrome.first` issue is gone.
- [x] **N11c.** Swift `windowProfiles` case deleted from `main.swift` (plus orphaned `axString` / `axChildren` / `findProfile` helpers).

### Cross-reference to B1
The server-side device-limit and activation logic in `val-helmActivate.ts` is only as strong as the client's willingness to call it. `license.js` falls through to local verification when the network call fails. With the old HMAC scheme that meant: anyone with the leaked `HELM_LICENSE_SECRET` could mint locally-acceptable keys, and any user could stay offline to skip the 2-machine check entirely. Now done: rotated the secret, migrated to Ed25519 (server holds private, client only verifies), removed `HELM_LICENSE_SECRET` env from client. S11–S13 are still worth fixing — but the server-side rules now actually matter because the local fallback can no longer be forged.

---

## Review wrap-up — three passes complete

**Blockers (3):**
- B1 — secrets in public DMG (mostly done; rebuild + reupload 1.0.2 remaining)
- B2 — per-profile teardown closes other profiles' tabs
- B3 — capture poller wipes selections + name input every 4s

**Should-fix (13):** S1–S13 across capture validation, persistence, profile teardown, run guards, Stripe webhook idempotency + replay tolerance + dry-run silent failure, Spotify URI, Pro-gate bypass, Slack LevelDB filename. **Patched:** S1–S13 (all). **Open:** none.

**Nice-to-have (15):** N1–N11 across renderer cosmetics, dead code, AX module edges, log/response credential leakage, rate-limit time-constant mismatch.

**Highest-impact first:** B1 (done locally — needs 1.0.2 reupload), B3 (one-line fix), S13 (likely cause of "license emails unreliable"), S11+S12 (Stripe replay/dup minting).
