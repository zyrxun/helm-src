# Helm — Pre-Launch Security Review

**Date:** 2026-06-12
**Scope:** Authorized review of Helm (founder-owned product + infra) ahead of the
July 1 public launch. Read-only on the codebase; live endpoints touched only with
single, non-destructive malformed-input probes.
**Build reviewed:** `package.json` version 1.0.2; local `dist/` build present and
inspected.

Ordering: **Blockers → Should-fix → Nice-to-have**. Each item has an exploit
scenario and a minimal fix. Prior-pass fixes I re-confirmed and an explicit
"not reviewed" list are at the end.

---

## Blockers

> **No open blockers.** BLK-1 (below) was the only one and is **resolved** —
> founder confirmed (2026-06-12) that the R2, Stripe, and Apple credentials that
> shipped in the leaked `.env` have all been rotated. Residual items are
> hardening/verification only and are tracked under Should-fix / Nice-to-have.

### BLK-1 — [RESOLVED] Release/update credentials leaked in the public 1.0.0/1.0.1 DMGs

**Where:** `electron/main.js:454-457` (feed URL = public `pub-…r2.dev` bucket);
`scripts/upload-release.sh:13-21` (R2 creds write to `helm-updates`). Leaked
artifact confirmed locally at `dist/Helm-1.0.0-universal.dmg` →
`Helm.app/Contents/Resources/app.asar` **contained `/.env`** (verified via
`asar list`).

**What happened.** `.env` shipped inside the public 1.0.0/1.0.1 bundles, exposing
(per `CLAUDE.md` Required `.env` keys) `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`
(write to the auto-update bucket), `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`, the
Stripe credentials, and others. Had those R2 write keys remained live, anyone who
downloaded the old DMG could have overwritten `latest-mac.yml` + the zip and pushed
an arbitrary "update" to the entire user base (the only backstop being macOS code-
signature validation on the zip).

**Resolution (founder-confirmed 2026-06-12).** R2, Stripe, and Apple credentials
from the leaked `.env` have been rotated, so the exposed values are dead. The leaked
1.0.0/1.0.1 artifacts were already removed from the R2 bucket (B1), and the shipped
1.0.2 asar contains no `.env`/secrets (verified this pass). The update-channel-
takeover vector is therefore closed.

**Residual hardening (not blockers — see Nice-to-have NTH-6/NTH-7):**
1. Confirm the **new** R2 token is least-privilege: write scoped to `helm-updates`
   only (not account-wide), and the `pub-…r2.dev` bucket is public-**read**, never
   public-write.
2. Rotate `META_PAGE_ACCESS_TOKEN` (B1a) and `SENTRY_DSN` (B1b) — still listed open
   in `TODO.md`; not mentioned in the founder's rotation, low-risk but in the leak.
3. When switching to Stripe **livemode**, use a fresh webhook secret (the roadmap
   already plans this) and never place it anywhere bundled.
4. (Local cleanup) the leftover `dist/Helm-1.0.0-*` / `1.0.1-*` artifacts hold the
   old (now-dead) secrets; delete them so a stale copy isn't re-served by accident.

---

## Should-fix

### SF-1 — `helmWaitlist` live val runs stale code: stack-trace disclosure, no rate limit, shared-blob race (confirmed live)

**Where:** deployed val behind
`https://zyrxun--4209f72a5edc11f1a9731607ee4eb77e.web.val.run`; hardened
replacement exists but is **undeployed** at `scripts/val-helmWaitlist.ts`.

**What I verified (non-destructive probe).** A single malformed-JSON POST returns a
raw runtime stack trace, publicly:

```
{"error":{"name":"SyntaxError","message":"Expected property name …",
 "stack":"SyntaxError: …
    at async Object.default … https://esm.town/v/zyrxun/helmWaitList@10-main/main.ts:11:21
    at async mapped (ext:deno_http/00_serve.ts:360:18)"}}
```

This leaks the internal module path, the Val.town username, the val name, and its
version (`@10-main`). The same old code (per B1 notes) has no rate limiting and
stores the whole list under a single shared blob key (read-modify-write race +
unbounded growth). It is the only internet-facing, unauthenticated endpoint of the
four, so it's the most directly abusable.

For contrast, I probed the other two client-facing vals the same way and both run
**current** hardened code (`{"ok":false,"reason":"bad_request"}`, no stack):
- `helmActivate` (`…0bc048205afb…`) — current
- `helmFeedback` (`…2f856d026457…`) — current

So the drift is isolated to `helmWaitlist`.

**Exploit scenario.** Any internet user POSTs malformed JSON and reads internals;
or floods the unthrottled endpoint to bloat the shared blob, race writes, and burn
the founder's Resend quota with welcome-email sends.

**Minimal fix.** Deploy `scripts/val-helmWaitlist.ts` (per-email blob keys,
`BODY_SIZE_MAX`, `isSafeEmail`, rate limiter, JSON parse wrapped in try/catch
returning `{ok:false,reason:"bad_request"}`), and set this val's env
(`RESEND_API_KEY`, `HELM_FROM_EMAIL`). It already does all of the above; it just
isn't live.

### SF-2 — Permanent-offline mode bypasses the 2-machine limit and license-sharing controls

**Where:** `electron/license.js:55-58` (no endpoint → `valid:true, offline:true`)
and `:71-74` (any network error → `valid:true, offline:true`); device limit is only
enforced server-side at `scripts/val-helmActivate.ts:150-157`.

**Exploit scenario.** The Ed25519 migration means keys can't be *forged* (good —
that part holds). But verification falls through to a purely local signature check
whenever the activation endpoint is unreachable. A user who blocks the endpoint
(firewall, `/etc/hosts` → `127.0.0.1`, or simply activating offline) gets full Pro
with **zero** server contact, on **unlimited** machines, from a single shared $9
key. A brand-new key that the server has never seen is accepted this way too,
because `activate()` grants Pro before any successful round-trip. This defeats both
the device cap and the anti-sharing intent.

**Trade-off.** Offline grace is a deliberate design choice (documented), so this is
a business-risk decision, not a code defect. For a $9 one-time product the blast
radius is bounded.

**Minimal fix (if you want the cap to mean something).** Require at least one
*successful* online activation before granting Pro, then persist a short-lived
server-signed "activation receipt" and allow offline operation only while a prior
receipt exists. New activations with no server contact should stay in a limited
state rather than full Pro.

### SF-3 — Sentry + feedback can carry workflow contents/URLs/emails → contradicts the "workflows live on your machine" claim

**Where:** `electron/main.js:13-18` (`Sentry.init`, `tracesSampleRate: 1.0`,
default integrations → console/breadcrumb capture); `:1020-1025` (feedback →
`Sentry.captureMessage(... extra:{ body })`); `:995-1018` (`body` includes the last
50 lines of `main.log`). Numerous `console.error` calls log captured data, e.g.
`:274` ("AX matches / history matches"), `:935` (profile-probe stdout, sliced to
200 chars), and launch/teardown paths that carry app names, window titles, Chrome
profile names, and URLs.

**Exploit scenario.** This isn't attacker-driven; it's a privacy/marketing-claim
mismatch. With default Electron Sentry integrations, `console` output becomes
breadcrumbs attached to crash events, and the feedback path ships the same log tail
both to Sentry (`extra.body`) and to the founder's inbox. Those logs can contain
URLs, window titles, Chrome profile labels, and the user's email — i.e. exactly the
"workflow contents" the site says never leave the machine.

**Minimal fix.** Add a `beforeSend`/`beforeBreadcrumb` scrubber that strips URLs,
titles, profile names, and emails; disable the console breadcrumb integration; drop
`tracesSampleRate` to `0` (no perf tracing need here); and make the privacy policy
explicitly disclose Sentry crash reporting and that "Report a bug" attaches log
lines. Keep the log-attach checkbox (it's user-consented) but stop duplicating that
body into Sentry silently.

### SF-4 — Hardened-runtime entitlements disable library validation

**Where:** `entitlements.mac.plist` —
`com.apple.security.cs.disable-library-validation` + `allow-unsigned-executable-memory`.

**Exploit scenario.** `disable-library-validation` lets the signed, notarized Helm
process load **unsigned / third-party dylibs**. A local attacker who can place a
dylib on a path Helm loads (or via `DYLD_INSERT_LIBRARIES` in some configurations)
gets code execution inside a process that holds Accessibility + automation TCC
grants — and it erodes the signature trust that the auto-update channel (BLK-1)
ultimately leans on. `allow-jit` is required for V8; `allow-unsigned-executable-memory`
is commonly needed for Electron, but `disable-library-validation` is often added
only to load an unsigned native module and isn't always necessary once the `.node`
is rebuilt and signed in the universal build.

**Minimal fix.** Confirm whether `disable-library-validation` is actually required
(try a signed build without it after `@electron/rebuild`). If the native module
loads without it, remove it. Keep `allow-jit`; re-test JIT before removing
`allow-unsigned-executable-memory`.

---

## Nice-to-have

### NTH-1 — Stale "HMAC" comments post-Ed25519 migration
`electron/main.js:375` ("fast local HMAC check") and `electron/license.js:72`
("approve on local HMAC") describe the retired scheme. Misleading during incident
response. Update to "Ed25519 signature."

### NTH-2 — `release` script bypasses the secret-scan guard
`audit-release.sh` is only wired into `scripts/upload-release.sh:24`. `npm run
release` (`package.json:13`, `electron-builder --publish always` → GitHub
`helm-releases`) publishes **without** running the audit. Wire the audit into both
publish paths (or an `afterPack`/`afterAllArtifactBuild` hook) so the guard can't be
skipped by choosing the other command.

### NTH-3 — Checkout email never retried after a first-delivery failure
`scripts/val-helmCheckout.ts:193-196` returns `{ok:true}` on any redelivery once
`helm_minted_<sessionhash>` exists, but `:200-208` only attempts the email on the
*first* delivery. If Resend fails transiently on that first call, the stored record
blocks all future sends and the buyer never gets the key. Store `emailSent:false`
and, on redelivery where `prior.key` exists but `emailSent` is false, retry the
email (then set the flag).

### NTH-4 — `SAFE_URL` validates only the scheme prefix
`electron/main.js:480` matches the leading scheme but not the remainder, so a URL
like `https://x/'; …` passes `isSafeUrl`. This is currently safe because **every**
shell sink single-quote-escapes the value (`launch.jxa`) — but a future refactor
that drops that escaping would turn this into injection. Add a comment at the regex,
and consider `new URL()` parsing for the http(s) branch.

### NTH-5 — Defense-in-depth Electron hardening
No `webContents.setWindowOpenHandler` (deny-all) or `will-navigate` guard is
registered, and `sandbox: true` is not set on the BrowserWindows
(`main.js:410-415`, `:444-447`). Risk is low today because the renderer loads only
local files and routes external links through `openExternal`, but add a deny-all
window-open handler, a `will-navigate` guard pinned to the local file, and
`sandbox: true` so a future content-injection bug can't navigate or spawn windows.

### NTH-6 — Verify the new R2 token is least-privilege (residual of BLK-1)
After the BLK-1 rotation, confirm the replacement R2 token grants **write to
`helm-updates` only** (not account-wide), and that the `pub-…r2.dev` bucket is
public-**read**, not public-write. The update channel's integrity rests on bucket
ACL + Apple code-signature; `latest-mac.yml` itself carries no independent
signature, so a write-scoped token + read-only bucket is what keeps a third party
from serving updates.

### NTH-7 — Rotate the two remaining leaked tokens (residual of BLK-1)
`META_PAGE_ACCESS_TOKEN` (B1a) and `SENTRY_DSN` (B1b) were in the leaked `.env` and
are still listed open in `TODO.md`; the founder's rotation covered R2/Stripe/Apple
but not these. Both are low-risk (Meta token wasn't referenced from code; Sentry DSN
is write-only), but rotate to fully close the leak.

---

## Additional findings — Fable adversarial pass (2026-06-12)

Second pass, attacker mindset: assume the client binary is fully editable (it's
unsigned JS in an asar), the user is hostile, and any value the client sends to a
val is forged. New items below; severities slot into the same Blocker/Should-fix/
Nice-to-have scale.

### AF-1 (Should-fix) — Device-activation cap is defeated online by a client-chosen `machineId`

**Where:** `electron/license.js:13-23,60,65` (machineId computed **client-side** and
sent in the POST body); `scripts/val-helmActivate.ts:135-160` (server trusts the
submitted `machineId` verbatim).

**Exploit scenario.** The 2-machine cap (`val-helmActivate.ts:150`) counts distinct
`machineId` strings. But `machineId` is just a value the client puts in the request
body — the server has no way to tie it to a real machine. An attacker (or a buyer
sharing a key) patches the local client, or simply curls `helmActivate` directly,
sending a **constant** `machineId`. Every install then collapses to a single device
slot, so one $9 key activates on unlimited machines **even with the network up and
the server reachable** — this is the online complement to SF-2's offline bypass.
Submitting a *fixed* id is strictly better for the attacker than offline mode
because it returns `offline:false` ("Verified" in the UI).

**Why it's hard to fully fix.** Any anti-sharing check that trusts a client-supplied
identifier is forgeable. Realistic mitigations: derive the machine binding
server-side from something the client can't freely pick (e.g. tie activations to the
Stripe customer / purchase and cap *total* activations per key regardless of
machineId), and/or require a server-issued, signed activation receipt that the
client must echo back. Accept that a determined sharer always wins on a $9 offline-
capable product; the goal is to stop trivial "set one constant" sharing. Documented
here so the cap isn't mistaken for an enforced limit.

### AF-2 (Should-fix) — Drive-by license replacement via the `helm://activate` deep link

**Where:** `electron/main.js:361-372` (`setAsDefaultProtocolClient('helm')` +
`open-url` → `activateLicense(key)` with no confirmation); `activateLicense`
(`:349-359`) calls `license.save(key)` on success, **overwriting** the stored key.

**Exploit scenario.** Any web page the victim visits can trigger
`helm://activate?key=<attacker-or-junk>` (a link, an `<iframe src>`, a JS
redirect). macOS hands it to Helm, which silently runs activation with no prompt. A
validly-signed but attacker-owned key replaces the paying user's key on disk
(`license.key` overwritten), swapping their account/email and potentially flipping
them into the attacker's exhausted 2-machine slot — i.e. a remote, unauthenticated
way to **deactivate or hijack** a paying customer's license from a web page. A
malformed key is harmless, but an attacker who bought one cheap key can grief at
scale.

**Minimal fix.** Don't silently overwrite an existing valid license from a deep
link: if already Pro, ignore the deep-link key (or require explicit in-app
confirmation before replacing). Surface a confirmation toast rather than activating
blind. (Implemented below.)

### AF-3 (Should-fix) — Val rate limiting is bypassable via spoofed `X-Forwarded-For`

**Where:** all four vals — e.g. `scripts/val-helmActivate.ts:16`,
`val-helmCheckout.ts:15`, `val-helmFeedback.ts:17`, `val-helmWaitlist.ts:20` —
`req.headers.get("x-forwarded-for")?.split(",")[0].trim()`.

**Exploit scenario.** The bucket key derives from the **leftmost** `X-Forwarded-For`
entry, which is the value the *client* sends and can set to anything. An attacker
randomizes the header per request and never shares a bucket, nullifying every
`MAX_ATTEMPTS` limit. That re-opens: S11/S12-class webhook hammering on checkout,
brute attempts on activate, and (with AF-4 below) using `helmFeedback` to flood the
founder's inbox / burn the Resend quota. The rate limits several other mitigations
lean on are therefore advisory.

**Fix (needs platform knowledge — not blindly patched).** The correct client IP is
the entry added by Val.town's *trusted* proxy, not the leftmost claimed one. Confirm
where Val.town places it (typically the right-most hop, or a platform-specific
header) and key the limiter on that. I did **not** change the extraction in code: a
wrong guess (e.g. switching to the right-most segment when XFF is single-valued)
could collapse all clients into one bucket and self-DoS. Verify the trusted-hop
position first, then change all four.

### AF-4 (Nice-to-have) — `helmFeedback` inbox flooding (bounded, not an open relay)

**Where:** `scripts/val-helmFeedback.ts:51-85`.

**Exploit scenario.** Recipient (`HELM_FEEDBACK_TO`) and `from` are server-side env,
so this is **not** an open relay — an attacker can't choose the destination. But the
30/hour/IP cap is bypassable via AF-3, and the body is attacker-controlled, so it
can be used to flood the founder's own inbox and consume Resend quota. Content is
sent as `text` (not HTML), so no markup injection. Low severity; mitigated mostly by
fixing AF-3. Consider a global (not just per-IP) hourly ceiling as a backstop.

### AF-5 (Nice-to-have) — Predictable `/tmp` path in Chrome history copy (local symlink/race)

**Where:** `electron/main.js:229` — `helm-history-${dir}.db` in `os.tmpdir()`,
`copyFileSync` then `sqlite3` then `unlinkSync`.

**Exploit scenario.** The temp filename is predictable. A same-user local process
could pre-create a symlink at that path so the `copyFileSync` write follows it.
Impact is low (macOS `os.tmpdir()` is a per-user private dir, and the content is the
user's own history copied *out*, not secrets copied in), but it's avoidable. **Fix:**
copy into a fresh `fs.mkdtempSync` directory and remove it after. (Implemented below.)

### AF-6 (Nice-to-have) — `folderPath` is the one execution field not re-validated

**Where:** `electron/main.js:685-687` — at launch, `appTarget.folderPath` is used as
the URL/path argument with no `isSafeString` re-check (every sibling field —
`name`, `urlToOpen`, `filePath`, `profile` — is re-validated at execution).

**Exploit scenario.** `workflows.json` is same-user-writable, so this crosses no
privilege boundary today, and `launch.jxa` single-quote-escapes the value before any
`doShellScript`, so it is **not** currently injectable. It's purely a
defense-in-depth gap: the only field that reaches a shell sink without an execution-
time validator. **Fix:** gate it on `isSafeString` like the others. (Implemented below.)

### AF-7 (Nice-to-have / accepted risk) — Client-side Pro gating is inherently bypassable

**Where:** `electron/runtime-config.js:30-32` (embedded public key),
`electron/main.js:294-296` (`isUserAuthorized` = in-memory `isPro`).

**Exploit scenario.** Because the client is unsigned JS in an asar, anyone can edit
`isPro` / swap the embedded public key for their own and "activate" a self-minted
key locally. This is unavoidable for any offline-verifiable client license and is
**not** a server compromise — it only pirates on the attacker's own machine. Noted
so it isn't mistaken for a fixable flaw; the real protection is that the *server*
side (mint + activation) can't be forged, which holds.

---

## Fixes applied in this pass

Code changes made to the working tree (not yet built/deployed):

| ID | Fix | File(s) |
|----|-----|---------|
| SF-3 | `tracesSampleRate: 0`, drop all breadcrumbs (`beforeBreadcrumb`→null), scrub `request`/`user`/`server_name` in `beforeSend`, and stop shipping the feedback log body to Sentry | `electron/main.js` |
| AF-2 | Deep-link `helm://activate` no longer silently overwrites an existing valid license; notifies the user via a toast instead | `electron/main.js`, `public/index.html` |
| AF-5 | Chrome History copies go into a fresh `mkdtempSync` dir (no predictable `/tmp` filename), removed after use | `electron/main.js` |
| AF-6 | `folderPath` re-validated with `isSafeString` at execution time | `electron/main.js` |
| NTH-1 | Stale "HMAC" comments corrected to Ed25519 | `electron/main.js`, `electron/license.js` |
| NTH-2 | Secret-scan guard now also runs on the `npm run release` path via an `afterAllArtifactBuild` hook | `package.json`, `scripts/after-artifact-build.js` |
| NTH-3 | Checkout email is retried on redelivery when the first send failed (tracks `emailSent` in the idempotency blob) | `scripts/val-helmCheckout.ts` |
| NTH-4 | Comment at `SAFE_URL` documenting it validates scheme only; sinks must keep escaping | `electron/main.js` |
| NTH-5 | `sandbox: true` on both BrowserWindows; deny-all `setWindowOpenHandler` + `will-navigate` guard via `hardenNavigation()` | `electron/main.js` |

**Verification:** `node --check` passes on all edited JS; `package.json` is valid
JSON. `npm run pack` + reinstall is still required to validate the Electron changes
(`sandbox: true` especially) against a real signed build before release — the
preload only uses `contextBridge`/`ipcRenderer`, which are sandbox-safe, but confirm
the popover and welcome window still load.

### Not fixed in code (and why)

- **BLK-1** (leaked credentials) — **RESOLVED**: founder confirmed R2/Stripe/Apple
  keys rotated (2026-06-12). Residual hardening only: NTH-6 (verify new R2 token is
  write-scoped + bucket read-only) and NTH-7 (rotate Meta/Sentry).
- **SF-1** (helmWaitlist stale deploy) — the hardened source already exists
  (`scripts/val-helmWaitlist.ts`); it must be **deployed** to Val.town. I cannot
  deploy from here.
- **SF-2 / AF-1** (offline + client `machineId` device-cap bypass) — require a
  server-side design change (bind activations to the Stripe purchase / signed
  receipt). Left as documented risk to avoid shipping a half-measure.
- **SF-4** (`disable-library-validation` entitlement) — removing it can break native
  module loading; needs a test build (`@electron/rebuild` + signed pack) to confirm
  first. Left for a verified build cycle.
- **AF-3** (X-Forwarded-For spoofing) — the correct fix depends on Val.town's
  trusted-proxy hop position; guessing wrong could self-DoS all clients. Left
  documented pending that confirmation.
- **AF-4 / AF-7** — bounded/accepted risks, noted only.

## (a) Prior fixes I re-confirmed still hold

**Command/argument injection (Scope 1) — clean.** I re-traced every renderer→IPC→
`osascript`/JXA path against the current `main.js` and all `.jxa` files:
- App targets run via `execFile('osascript', [...argv])` — no shell layer; `appName`
  is only ever compared with `===` in `launch.jxa`/`close.jxa`, never interpolated
  into a shell string.
- Every `doShellScript` interpolation single-quote-escapes its input with
  `replace(/'/g, "'\\''")` (correct bash single-quote escaping) — `launch.jxa`
  Finder/Terminal/Notion/Slack/Obsidian/Figma/Preview/PDFgear/Code/Chrome-profile
  sites all do this. `focus.jxa:7-8` strips `'` inside a single-quoted context
  (also safe).
- `profile` is regex-gated `^(Default|Profile [0-9]+)$` at both save
  (`main.js:521,853`) and execution (`:631,690`, `launch.jxa:185`).
- `buildHistoryProfileMap` SQL uses doubled-quote escaping on a **read-only** temp
  copy queried via `execFile('/usr/bin/sqlite3', [...])` (no shell), `main.js:233-237`.

Confirmed individually:
- **B2** per-profile teardown: `main.js:638` joins on `\x1f`; `close.jxa:29` splits
  on `\x1f`; en-dash handled at `close.jxa:61`.
- **B3** capture poller no longer wipes selections: `index.html:1432`
  `renderPreview(true, true)`.
- **S1** execution sites use `isSafeDisplayString` (`main.js:672,684,611`).
- **S2** `closeApps[].urlToOpen` persisted (`main.js:863`).
- **S3** no quote-stripping of app names (gone from teardown/close paths).
- **S4** atomic workflow write: `storage.js` writes temp + `renameSync`.
- **S6** `run-workflow` guarded by `activeExecutionGuard` (`main.js:755-760`).
- **S7** launch failures surface via `workflow-warning` (`main.js:696-701`).
- **S9** teardown Pro-gated in main: `setTeardownMode` gates on `isUserAuthorized()`
  (`main.js:583`); `set-mode-toggle-hotkey` can bind a key but pressing it can't
  enter teardown without authorization.
- **S10** Slack probe globs newest `*.log` (`slack_state.py:13-16`).
- **S11** idempotent mint keyed on Checkout Session id (`val-helmCheckout.ts:188-200`).
- **S12** Stripe timestamp tolerance ±300s (`val-helmCheckout.ts:73`).
- **S13** missing webhook secret → loud 500, not silent 200
  (`val-helmCheckout.ts:159-162`); **and** confirmed live that `helmActivate` and
  `helmFeedback` run current hardened code (malformed-input probe returned
  `bad_request`, no stack trace).
- **N11** AX module word-boundary anchor `\b(Default|Profile [0-9]+)\b`
  (`profile_probe.mm:41`).

**Electron baseline:** `contextIsolation: true`, no `nodeIntegration`, no remote
module; preload bridge (`preload.js`) exposes only `ipcRenderer.invoke/on` wrappers
with no raw Node surface. `open-external` is allowlisted via `isSafeUrl`
(`main.js:917-920`); the S8 `spotify:[a-z]+:` addition to `SAFE_URL` is appropriately
narrow (lowercase scheme segment only) and did not over-widen.

**Build hygiene:** the shipped **1.0.2** asar contains **no** `.env`/secret/key
files — only `electron/runtime-config.js`, which holds the Ed25519 **public** key
and public URLs (verified via `asar list` + `asar extract-file`). `npm audit`
(prod deps): **0 vulnerabilities**.

## (b) What I did NOT review

- **R2 bucket ACL / IAM scoping and whether the leaked credentials are individually
  still live** — not inspectable from the repo; BLK-1's closure depends on this
  (Cloudflare dashboard) and on the Apple/Stripe dashboards. I did not extract or
  print any secret values.
- **`helmCheckout` live endpoint** — it's the Stripe webhook target and has no
  public URL I could probe non-destructively; I relied on source review plus the
  confirmation that its two sibling vals are running current code.
- **Val.town env vars in production** — I cannot see whether `STRIPE_WEBHOOK_SECRET`,
  `HELM_LICENSE_PRIVATE_KEY`, `HELM_FEEDBACK_TO`, etc. are actually set/correct on
  each val.
- **electron-updater / Squirrel.Mac signature-verification internals** — I assumed
  (did not test) that macOS rejects a differently-signed update; BLK-1's "backstop"
  rests on that assumption.
- **Notarization/stapling and `codesign --verify` of the shipped `.app`** — not run.
- **Compiled native binaries** — reviewed `profile_probe.mm` source only; did not
  audit the built `.node` or the Swift `chrome-profile-probe` (its `bin/` is
  gitignored and source wasn't in scope paths).
- **`public/welcome.html`**, the marketing/`ads/` material, and the website waitlist
  form HTML.
- **Stripe livemode** — per rules, nothing was sent against livemode; the
  payouts-paused / livemode-switch items are operational, not reviewed here.
- **Deep dependency/SCA** beyond `npm audit` (no transitive-native-dep analysis).
