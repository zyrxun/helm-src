# Helm — Pre-Launch TODO

## Blockers (breaks the experience)

- [x] Add `author` field to `package.json` (electron-builder warns; required for signed builds)
- [x] Login item — add "Launch at Login" toggle via `app.setLoginItemSettings()` in `electron/main.js`, expose to renderer
- [x] Accessibility permissions gate — detect if Accessibility access is granted; if not, show clear in-app prompt with link to System Settings → Privacy & Security → Accessibility; surface the reason when a workflow fails silently
- [x] Publish an initial release to `helm-releases` — auto-updater throws on every packaged launch until a RELEASES file exists in the repo

## Important gaps (bad UX)

- [x] First-run / empty-state onboarding — when `workflows.json` is missing or empty, show a "Create your first workflow →" prompt instead of a blank popover
- [x] Tray icon Retina — provide `menubar-icon@2x.png` (36×36) alongside the 18×18; set `setTemplateImage(true)` correctly so it's crisp on Retina displays
- [ ] Privacy policy — required before Stripe goes live and for GDPR/CalOPPA compliance (email collected at checkout)
- [x] Clean up `helm-src` git history — remove committed `.DS_Store` and `Icons and design/*.zip` blobs (`git rm --cached`, add to `.gitignore`, recommit)

## Needs setup (external services)

- [x] Stripe — create $9 one-time payment link, wire webhook to `helmCheckout` Val.town, update `HELM_STRIPE_URL` in `.env`
- [ ] Resend — sign up, get API key, verify domain, set `HELM_FROM_EMAIL` in Val.town env vars so license keys are actually delivered
- [ ] Apple Developer enrollment ($99/yr) — fill `APPLE_ID`, `APPLE_APP_PASSWORD`, `APPLE_TEAM_ID` in `.env` for notarized builds
- [x] Bundle fonts locally — replace Google Fonts CDN link in `public/index.html` with self-hosted Inter / JetBrains Mono / Playfair Display

## Beta distribution

- [x] Upload DMG to Google Drive / Dropbox and share download link with testers (iMessage/AirDrop for nearby testers)
- [x] Add in-app "Report a bug" button in Settings panel — opens mailto: or Typeform so testers can send feedback without needing to find your contact
- [x] Add Sentry crash reporting — automatically captures crashes in the background; testers don't need to do anything, you see errors in Sentry dashboard (free tier, ~10 lines for Electron)

## Auto-update (Sparkle)

- [ ] Wire `update-electron-app` with GitHub releases appcast (version check on launch, in-app banner)
- [ ] Host appcast: tag releases as `v1.x.x`, attach signed DMG as artifact — Sparkle fetches from GitHub Releases automatically
- [ ] Requires signed + notarized build — Apple Developer enrollment above must be done first

## Future features

- [ ] Spotify Web API integration — OAuth login to browse + save specific playlists (not just current track); requires Spotify Developer app + token refresh flow
- [ ] Per-app refresh in workflow edit view — "re-capture this app" button on individual rows so e.g. Spotify track can be updated without rebuilding the whole workflow

## Before public launch (needs external accounts)

- [x] Stripe test mode — payment link, webhook, Val.town handler all wired and tested
- [ ] Stripe livemode — switch to live keys: new payment link, new webhook secret, update `HELM_STRIPE_URL` and `STRIPE_WEBHOOK_SECRET` in `.env` and Val.town env vars
- [ ] Resend — sign up, get API key, verify domain, set `HELM_FROM_EMAIL` in Val.town env vars so license keys are actually delivered
- [ ] Apple Developer enrollment ($99/yr) — start early, Apple verification takes 1–2 days; needed for code signing + notarization so Gatekeeper doesn't block paying customers
- [ ] Privacy policy — required before Stripe goes live (GDPR/CalOPPA, email collected at checkout)
- [ ] Website / landing page — needed for support, changelog, and purchase link before distributing to public
