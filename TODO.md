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

- [ ] Stripe — create $9 one-time payment link, wire webhook to `helmCheckout` Val.town, update `HELM_STRIPE_URL` in `.env`
- [ ] Resend — sign up, get API key, verify domain, set `HELM_FROM_EMAIL` in Val.town env vars so license keys are actually delivered
- [ ] Apple Developer enrollment ($99/yr) — fill `APPLE_ID`, `APPLE_APP_PASSWORD`, `APPLE_TEAM_ID` in `.env` for notarized builds
- [x] Bundle fonts locally — replace Google Fonts CDN link in `public/index.html` with self-hosted Inter / JetBrains Mono / Playfair Display

## Nice to have before launch

- [ ] Crash / error reporting — add Sentry (free tier, ~10 lines for Electron)
- [ ] Website / landing page — needed for support, changelog, and purchase link before distributing the DMG
