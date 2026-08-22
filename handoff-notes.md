# Session Handoff — 2026-08-22 (teardown defect fixes, fresh installers)

> Newest on top. Previous handoffs preserved below.

Ran on Richard's Windows 10 PC, branch `windows-port`, from `79b6714`. Two
units of work, both verified in the main session before push.

## What happened

- **Both Item-4 teardown defects fixed (`8d8a3ee`, findings `5ee7091`,
  pushed).** `close.ps1` now matches dirty-marker titles: both the filter and
  the live title are also compared with one leading `*` / `●` / `•` (plus at
  most one space) stripped, so a window retitled `*Untitled - Notepad` no
  longer escapes the filter captured from its clean caption. Verified live
  pre/post against a real dirty Notepad window (pre-fix: `No matching
  windows`; post-fix: `Closed 1`, save prompt raised). And `win32.js` scales
  the close timeout with the work — 8 s base + 4 s per extra title filter,
  30 s cap, filterless calls get the cap — so three dirty windows no longer
  exhaust a fixed 8 s budget mid-list. Both files Windows-only; no shared
  file touched.
- **`dist/` installers rebuilt via `pack:win` (2026-08-22 10:49), replacing
  the stale 08-13 set.** The new builds carry everything since the first
  hardware run — popover-window fixes, hotkey fixes, teardown fixes incl.
  today's, the `protocols` key, and the R2-baked `app-update.yml` (verified
  in `win-unpacked/resources`: generic provider, pub-…r2.dev). Secret-scan
  audit: clean. `latest.yml` lists all three setups. Build log kept at
  `logs/pack-win-2026-08-22.log`. Still unsigned — SmartScreen wall stands.

## Same day, second sitting (Richard: "go through that one and install the fresh builds")

- **Installed the fresh x64 build for real** (`/S`, exit 0, per-user, no UAC).
  App is resident in the tray at `%LOCALAPPDATA%\Programs\Helm\Helm.exe` and
  was LEFT RUNNING for Richard to poke at. First run created `%APPDATA%\Helm`
  and the `welcomed` marker. **New finding: the `build.protocols` key does NOT
  register `helm://` at install time on Windows** — checked before first
  launch, the oneClick NSIS wrote nothing; runtime registration on first
  launch is what actually claims the scheme. `f0b7a71`'s dead-link gap is
  still open on Windows; closing it needs explicit NSIS registry writes
  (product call). Also: any dev run steals `helm://` back to `electron.exe`
  (`main.js:118-119`) — restored to the installed exe by hand this session.
- **Focus mode end-to-end: PASS.** Drove the real `run-workflow` /
  `teardown-workflow` handlers under a dev Electron instance against a saved
  workflow (`focusMode: 'Do Not Disturb'`, empty app lists). Full round trip
  observed: absent → 0x0 + `PriorToastState "absent"` → restored to absent,
  both handlers `{ok:true}`. The last gating-sweep item is closed; only the
  literal renderer click remains, which rides the same handlers. Machine
  left at baseline, dev `workflows.json` restored. Details in
  `WINDOWS_FINDINGS.md`, "Fifth session — 2026-08-22".
- SmartScreen wording still unconfirmed (local exe carries no
  Mark-of-the-Web, so the interstitial never fires from a local install).

## Same day, third sitting — signing decision made: the free way

Richard decided against paid signing (no Azure Trusted Signing, no OV/EV).
Strategy is the free reputation path: stable download domain
(get-helm.app / updates.get-helm.app), Microsoft file submission per release,
winget, and the fact that only the FIRST browser-downloaded install carries
Mark-of-the-Web — electron-updater updates never hit SmartScreen. The
decision and playbook are recorded in `WINDOWS.md` (Code signing section);
winget manifests are prepped in `winget/`.

## The Windows PC is gone after 2026-08-22

Richard loses access to the Windows machine after this session. Consequences:

- **The 2026-08-22 build artifacts are preserved** as GitHub release
  `v1.0.3-win` on this (private) repo — all three setup exes, blockmaps,
  the x64 portable, and `latest.yml`, exact bytes matching the committed
  winget sha256 (`c6cc85bc…`) and latest.yml's sha512s.
- **No Windows hardware remains** for real-machine testing. The SmartScreen
  interstitial has still never been witnessed (needs a browser download from
  the live URL on real Windows), and any future NSIS change — e.g. an
  install-time `helm://` include script — can be cross-built on the Mac but
  not hardware-tested. A Windows VM (or a borrowed machine) is the path for
  both when the time comes.

## Next steps — all doable from the MacBook

In order. Everything needs only a browser or the Mac's `.env` credentials.

1. **Bind the custom domain**: Cloudflare dashboard → R2 → `helm-updates` →
   Settings → Custom Domains → add `updates.get-helm.app`. Zone is in the
   same account, DNS auto-creates. Free; replaces the rate-limited
   `pub-*.r2.dev` URL and accrues domain reputation across releases.
2. **Get the Windows artifacts into the bucket.** Download every asset from
   GitHub release `v1.0.3-win`, drop them into `dist/`, run
   `bash scripts/upload-release.sh`. **Do not rebuild for 1.0.3** — these
   are the last binaries from real Windows hardware, and the committed
   winget sha256 plus `latest.yml`'s sha512s match these exact bytes.
3. **Verify the served hash**: once uploaded, fetch
   `https://updates.get-helm.app/Helm-1.0.3-x64-setup.exe` and confirm
   `shasum -a 256` returns `c6cc85bc…127869`. Only if it ever differs
   (e.g. a future rebuild) does `winget/Helm.Helm.installer.yaml` change.
4. **Seed reputation**: submit the uploaded x64 exe at
   https://www.microsoft.com/en-us/wdsi/filesubmission (software developer
   form). Free, per release.
5. **Winget PR** once 1-3 are done and the URL serves the exact file:
   follow `winget/README.md`.
6. **Feed URLs stay untouched until the domain is live**: `main.js:277`
   (shared, both platforms read it) and `package.json` win publish still
   point at `pub-…r2.dev`, which keeps working after the custom domain is
   added. Moving them to `updates.get-helm.app` is a deliberate later
   change — Mac-side, since it touches the shipping updater path.
7. **Website download page** (Mac side, founder copy review): serve/link
   the Windows download from get-helm.app and decide whether to show the
   one-time "More info → Run anyway" guidance.

## Open items

- **Install-time `helm://` registration** (see above) — product call:
  accept first-launch-only registration, or add an NSIS include script.
- **R2 delivery**: owner must confirm the bucket receives the Windows
  artifacts at next release (`upload-release.sh` now uploads them).
- Standing: `package-lock.json` modified-uncommitted predates everything,
  leave alone; `tmp-ambig.js` untracked, keep; `logs/webhelper.txt` is a
  stray Steam log, ignorable; never push `master`.

---

# Session Handoff — 2026-08-21 (the gating manual tests, run with Richard)

Ran on Richard's Windows 10 PC, branch `windows-port`, from `6ac8a09`. This
session ran manual tests 1–3 interactively with Richard and delegated the
scripted half of test 4 (teardown vs unsaved work) to an agent. Full results in
`WINDOWS_FINDINGS.md`, "Fourth session — 2026-08-21".

## Results in one paragraph

Tests 1 and 2 **pass**. Test 1's first attempt failed because of the
**dev-identity trap**: dev mode (`electron electron\main.js`) is app-named
"Electron", so userData is `%APPDATA%\Electron` (marker
`%APPDATA%\Electron\welcomed`, workflows `%APPDATA%\Electron\Helm\workflows.json`);
`%APPDATA%\Helm` is a red herring in dev. Test 2 surfaced the popover at
screen centre — the `second-instance` handler called `win.show()` without
`getWindowPosition()`; **fixed this session** inside the `IS_WINDOWS` block
(macOS never runs the changed lines). Test 3: Richard's captured Chrome rows
(Gemini + two ChatGPT windows) all saved **title-only** — probed all three
captions against every profile's History; all were genuine ambiguity refusals
(`Google Gemini` 15+ URLs, `ChatGPT` 77+ URLs across four hosts). Designed-safe
behaviour, but the consequence is systematic: SPA sites will always capture
title-only on Windows because there is no per-tab capture. Suggestions
(row-UI hint, manual URL field, DevTools-protocol capture) written up, not
implemented. Unsaved-work teardown (agent, verified): no hang, `Closed N`
means "messaged N", save prompts open **buried** when triggered from the tray
popover, one dirty window serially blocks the rest, Cancel preserves work; new
defect — Win10 Notepad's dirty-title `*` prefix breaks the `StartsWith`
TitleFilter; inference — three dirty windows blow `win32.js`'s 8 s budget.

## Open items

- **Test 4's in-app half**: real teardown from the popover over an unsaved
  document — needs Richard.
- **The ~30-minute sweep**: tray menu, popover position (re-check after the
  second-instance fix), hotkey, focus mode, `pack:win`/NSIS, `helm://` cold
  start, and the renderer treatment of title-only rows (test 3's other half).
- **Unexplained single observation**: one launch appeared to kill the original
  instance (~12:49 PM); controlled re-run showed correct lock behaviour.
  Richard never answered whether he quit from the tray at that moment. Watch,
  don't chase.
- Unchanged standing rules: `package-lock.json` modified-uncommitted predates
  everything, leave alone; `tmp-ambig.js` untracked, keep; never push
  `master`; diagnostic tooling lives in `../.helm-scratch/` (`probe-title.js`,
  `probe-t3.js`, `cdp.js`, `hook.js`).

---

# Session Handoff — 2026-08-20 (re-measure the capture cache, finish the findings, reconcile with the Mac session, close the two hardware gaps)

Ran on Richard's Windows 10 PC, branch `windows-port`. This session closed out
the 08-14 session's tree — everything below is **committed** — and then found
that a Mac session had fixed the same three defects in parallel. The second
half of the session was reconciling the two.

## What happened

- **The capture-cache benchmark was re-run on an idle machine (2026-08-20)**,
  because the 08-14 numbers were taken on a busy one and did not settle the
  question, and no numbers from any interim re-run were ever recorded. Fresh
  `powershell.exe` per run, modes interleaved. Result: warm-cache median
  **364 ms vs 566 ms baseline (~35% faster)**, stable (7 of 8 warm reps within
  355–382 ms); cold stays slower and noisy but is paid once per source hash.
  **Verdict: keep** — item 4 is no longer "implemented but unjustified."
- **`WINDOWS_FINDINGS.md` second-session section finished.** It had been cut
  off after Item 1. Items 3–6, both benchmark sets, the manual test list, and
  new suggested next steps are now in it, and the intro's re-measurement date
  was corrected to 08-20 (the claimed 08-19 numbers were never written down
  anywhere, so they were unusable). Two handoff inaccuracies were fixed in the
  document rather than propagated: the `win32.js` line refs are 195/208 in the
  current tree (the handoff's 178/191 were pre-diff), and `darwin.js` calls
  four `chrome.js` exports, not one — none of them `urlMapForTitles`, so the
  neutrality argument stands unchanged.
- **Everything re-verified before committing:** all four modified JS files pass
  `node --check`; `smoke-platform.js` run live under Electron — capture 6 rows
  in ~1.2 s, the one open Chrome window recovered URL + profile 1/1 through the
  new strict caption rule; the diffs match what the 08-14 handoff described.

## Then: three new Mac commits appeared

- **The fetch found `313648b`, `e7c36bc`, `d39ecf3`** (Mac, 2026-08-19). They
  fix the same three defects this PC had just fixed — ambiguous captions,
  `focus.ps1` not restoring the machine, `close.ps1` closing the wrong Store
  app. Neither machine knew about the other.
- **The five PC commits were rebased on top of `d39ecf3`.** They are now
  `6fa840e` (welcome overflow-tray card + `open-taskbar-settings` IPC),
  `f2cacb2` (ambiguous captions), `9253ecf` (capture DLL cache), `70dec9d`
  (docs/harness), `09f1354` (second-session findings).
- **Two files needed a manual merge**, both resolved by keeping the more
  detailed side and folding the other in. `WINDOWS.md` — kept this PC's
  Developer Mode section, folded in the Mac session's Windows 10 22H2
  confirmation and its `bash` paragraph. `verify-windows.ps1` — kept
  `Resolve-ProfileName` plus the alternate-name display, alongside the Mac
  session's new stranded-focus check.
- **`chrome.js` was the one semantic conflict**, and it was resolved by keeping
  this PC's measured rule and **dropping the Mac session's `AMBIGUOUS_TITLES`
  blocklist**. The measurement says ambiguity is not a fixed list of generic
  captions — 27.5% of distinct titles match more than one URL, only 58% of
  multi-candidate titles resolve to the same page, and a 65-character caption
  matched 21 URLs across two hosts. A blocklist refuses the named few and still
  guesses on the rest. The measured rule refuses `New Tab` on the data, needs
  no list, and recovers google.com correctly on a window captioned `Google`,
  which the blocklist refuses unconditionally. The Mac session's `http(s)`
  restriction is folded in, moved out of the SQL into a guard at emission so
  non-http rows still count toward ambiguity and can never win. Full argument
  in `WINDOWS_FINDINGS.md`, "Third session".
- **The hardware re-tests `d39ecf3` asked for all pass.** `verify-windows.ps1`
  clears all seven sections (6 windows in 724 ms; the stranded-focus check
  correctly silent). `focus.ps1` restores an absent value to absent, and a
  numeric prior of `1` back to `1`, with the double-enable guard holding.
  `close.ps1` is fail-closed on a non-matching `TitleFilter`, closes a real
  Notepad window, and closes a Store app (`CalculatorApp`) through the
  CoreWindow-only path. Transcripts are in the findings, not paraphrased, so
  the Mac instance can read them without this terminal.
- **A reconciliation commit** updates `WINDOWS_FINDINGS.md` (new "Third
  session" section plus an update to the top blockquote), `WINDOWS.md` (the
  overflow-tray section now records option 1 as implemented) and this file.

## Tree state

Committed in review-sized pieces: the welcome/tray-overflow work, the
ambiguous-caption rule, the capture cache (now justified), the docs/harness
pair, then findings + this handoff, all rebased onto `d39ecf3`, plus the
reconciliation commit. **All of it is pushed to `origin/windows-port`.** The
rebase happened before any push, so the remote never carried the pre-rebase
commits and the push was a plain fast-forward. `package-lock.json` was
stashed for the rebase and popped afterwards; it remains
modified-but-uncommitted, it predates all of this work, leave it alone.
Untracked scratch (`tmp-ambig.js`, `../.helm-scratch/ambig2.js`) kept, as
before, because the ambiguity analysis is re-runnable from them.

**Evening addendum.** `fef7a96` (the Edge caption fix) sits on top, plus the
findings commit for the section it produced. One more untracked scratch file:
`../.helm-scratch/probe-title.js`, which dumps a browser's per-profile
`History` rows and runs one title through `urlMapForTitles` — the browser root
and the title are constants at the top, edited per probe. It is how findings C
and D were established, and it is re-runnable.

## Still open — needs Richard

Unchanged from 08-14, reproduced in `WINDOWS_FINDINGS.md` so it survives on
its own: item 2 of the six (re-run stages 1 and 3 by hand) and the ranked
manual test list, of which the first four gate the port — first-run tray-icon
discoverability from a deleted `welcomed` marker, second-launch `win.show()`,
title-only browser rows through the renderer, teardown with unsaved work. The
reconciliation does not touch any of these; they still need a mouse.

## Later the same evening: both remaining hardware gaps closed

Ran after the reconciliation commit, same machine, same branch.

- **Chrome teardown by `TitleFilter` against the real multi-profile Chrome
  passes.** Two sacrificial `example.com` windows in `Profile 1` and
  `Profile 13`, alongside Richard's real YouTube window. A non-matching filter
  printed `No matching windows` and closed nothing; filtering on `example.com`
  printed `Closed 2` and took both sacrificial windows, one per profile, while
  the YouTube window survived and Chrome stayed running.
- **Edge captions met a real Edge.** The live caption was
  `example.com and 2 more pages - Personal - Microsoft​ Edge` — tab count,
  profile label and the zero-width space at once. The existing `titleSuffix`
  regex handled the zero-width space, so that gap is closed as written, but the
  tab-count and profile-label residue reached the History lookup and matched
  nothing.
- **One code fix came out of it: `fef7a96`** (`win32.js` only) adds
  `edgeProfileLabels()` — which reads `shortcut_name`/`name`/`gaia_given_name`/
  `gaia_name` from Edge's own `Local State`, a set `loadProfileCatalog` does not
  collect — and `stripEdgeDecorations()`, which strips a trailing
  ` - <label>` only when the label is one Edge declares, then strips
  `and N more page(s)` by shape. Verified live through
  `npx electron scripts\smoke-platform.js`: a fresh Edge window on
  `https://www.wikipedia.org/` recovers URL and profile. Edge teardown verified
  too — `close.ps1 -ProcessName msedge -TitleFilter 'Wikipedia'` printed
  `Closed 1` and closed exactly that window.
- **Two title-drift findings explain the remaining title-only rows.** YouTube
  now stores its title with the unread counter prepended
  (`(31) How To Effectively Use Ruby Thursday | …`) while the caption carries
  none, so exact-match misses; and `example.com` does not resolve on this
  network, so both browsers show a caption with no `History` row behind it.
  Both fail toward a title-only row, which is correct.
- **A findings commit** adds the "Third session, continued — 2026-08-20
  evening" section to `WINDOWS_FINDINGS.md` with every transcript unparaphrased,
  and rewrites that section's "What is still not verified" list, which had named
  these two gaps.

## Next session

1. The Mac instance should read the "Third session" section of
   `WINDOWS_FINDINGS.md` before touching `chrome.js` again — it carries the
   measurement, the transcripts and the reason the blocklist is gone.
2. **Done, 08-20 evening.** The two hardware gaps that stood here — Chrome
   teardown by `TitleFilter` against the real 11-profile Chrome, and Edge
   caption shapes with Edge running — are both closed. See the section above,
   and "Third session, continued" in `WINDOWS_FINDINGS.md` for the transcripts.
3. What genuinely remains needs a mouse: the ranked manual test list, of which
   the first four gate the port. Teardown with unsaved work is still among
   them — `close.ps1` has now closed Notepad, Calculator, Chrome and Edge
   windows, but never one holding a document that would raise a save prompt.
4. One caveat from `fef7a96` is open by construction: the Edge tab-count strip
   is English-only, so a localized Edge resurfaces the miss. Safe direction — a
   title-only row — and it is recorded in the findings' unverified list.

---
---

# Session Handoff — 2026-08-14 (Windows next-steps 1, 3, 4, 5, 6)

Ran on Richard's Windows 10 PC, branch `windows-port`. Picked up the six
"Suggested next steps" at the end of `WINDOWS_FINDINGS.md`. **Nothing is
committed — the working tree carries all of it.** Read "Tree state" below
before touching anything.

## Status of the six next steps

| # | Item | State |
|---|---|---|
| 1 | Overflow tray icon | Implemented, needs a human to judge whether it works |
| 2 | Re-run stages 1 and 3 by hand | **Not done — needs a mouse. Richard's** |
| 3 | Developer Mode in `WINDOWS.md` | Done |
| 4 | Cache capture's `Add-Type` | Implemented, **measured as no clear win** |
| 5 | Ambiguous captions | Done, measured, verified |
| 6 | Harness/app profile names agree | Done |

## 1 — Overflow tray icon (`main.js`, `preload.js`, `welcome.html`)

New `open-taskbar-settings` IPC opens `ms-settings:taskbar`; the URI is a
literal in the handler, nothing from the renderer reaches `openExternal`.
No-op off Windows. `welcome.html` gained a Windows-only card carrying the
guidance and a button onto that settings page, and its four macOS cards are now
gated by `data-platform` + a `getPlatform()` handshake. **Default is macOS**, so
a failed handshake degrades to the shipping platform.

Verified: `ms-settings` is registered on this machine, and the URI lands on
Personalization → Taskbar — read the live window through UI Automation, which
returned the section headings including "Select which icons appear on the
taskbar". Not verified: the click path from renderer → preload → handler, and
whether the card actually gets a first-run user to the icon. That second one is
the whole point of the item and only a human can answer it.

Two defects fixed in this session's own earlier draft of that card: a doubled
20px gap before "Got it" (`.card` already supplies `margin-bottom: 20px`, so
the extra `body.platform-win32 > button` rule double-counted), and copy that
named Windows 10 and the Windows 10-only label "Select which icons appear on
the taskbar" — wrong on Windows 11, which Helm also supports. Copy is now
version-neutral and leans on the deep-link button rather than a Settings label
string that ages between builds.

## 5 — Ambiguous captions (`chrome.js`, shared file)

Measured against this machine's real 11-profile Chrome History: **4158 distinct
titles, 27.5% of which match more than one URL.** Once a title has two
candidates only 58% are the same page and one in eight is on a different host.
Title length does not separate the cases — a 65-character caption still matched
21 URLs across two hosts — so the blocklist and length-threshold ideas floated
in `WINDOWS_FINDINGS.md` both fail on the data.

New rule: **a caption recovers a URL only when every History row sharing it
resolves to the same page** — scheme + host + path + fragment identical, only
`?query` may differ. Anything else recovers nothing and the row captures with
its title and no URL, which is an already-supported outcome. Profile is gated
separately: settled page, several profiles → `profileDir: null`, and the
renderer's picker takes it.

The `LIMIT 500` came out of the query on purpose, not as cleanup: a truncated
row could be the one that proves ambiguity, so truncating converts a safe
refusal into a silent wrong answer.

macOS safety: `urlMapForTitles` has exactly one caller in the repo,
`win32.js:178`. `darwin.js` requires `chrome.js` but uses only
`profileMapForUrls`, which is untouched. Neutral by unreachability, so no
`process.platform` guard was added. Verified independently of the agent that
wrote it. `win32.js:191` tests `profileDir` against a regex, so `null`
stringifies to `"null"`, fails the match, and omits the field — no crash.

Cost, on `smoke-platform.js`: URL recovery went **5/5 → 2/5**. All three
refusals were genuine — 37, 75 and 21 distinct URLs respectively, each spanning
two hosts. Each refusal logs its caption.

## 4 — Capture cost: implemented but NOT justified

`capture.ps1` takes an optional `-CacheDir` and compiles its embedded C# to a
SHA-named DLL there, loading the bytes on later runs; `win32.js` passes Helm's
userData. Every failure path falls back to a plain inline `Add-Type`. Also
replaced the per-window `Get-Process -Id` with one indexed snapshot.

**The measurements do not support keeping it.** Three reps, this machine, ms:

| rep | baseline | cold (compile + write) | warm (load DLL) |
|---|---|---|---|
| 1 | 1405 | 2443 | 1326 |
| 2 | 1581 | 1246 | 810 |
| 3 | 1226 | 2047 | 1159 |

Warm is maybe 20% better, cold is *worse* than baseline, and the spread
overlaps everywhere. An earlier back-to-back set read 404–536 ms and was
flattered by OS file-cache warmth — do not trust it. The machine was busy
during all of this. **Someone needs to re-measure on an idle box before this is
worth keeping**; it adds runtime disk writes and a cache-invalidation story to
the core capture path in exchange for an unproven win.

What *is* verified about it: `capture.ps1` parses; output is **byte-identical**
to the committed version; the no-`-CacheDir` path (`verify-windows.ps1`) still
works; and a deliberately corrupted DLL is detected, discarded, recompiled, and
capture still returns correct output. Coverage caveat: the capture returned
only 4 windows, because a sandboxed session sees few — see "Section 3 is a
sandbox artifact" in `WINDOWS_FINDINGS.md`. Byte-identical on 4 rows is weaker
evidence than it sounds.

## Tree state — read before you touch it

Nine modified files, nothing committed, nothing pushed.

- Verified, ready to commit: `WINDOWS.md`, `scripts/verify-windows.ps1`,
  `electron/platform/chrome.js`, `electron/main.js`, `electron/preload.js`,
  `public/welcome.html`
- Implemented but unjustified, commit separately or revert:
  `src/platform/windows/capture.ps1`, `electron/platform/win32.js`
- `package-lock.json` — predates this work, leave alone

`WINDOWS_TESTING.md` wants code fixes committed separately from
`WINDOWS_FINDINGS.md`, and `WINDOWS_FINDINGS.md` has **not** yet been updated
with any of the above. That is the first job for the next session.

Untracked scratch, safe to delete, kept only because the analysis is
re-runnable: `tmp-ambig.js` (repo root — `top`, `short`, `probe`, `pick`) and
`.helm-scratch/ambig2.js` (`table`, `lens`, `rule`, `danger`, `apply`).

## Manual test list handed to Richard

Given to him in-session; reproduced here so it is not lost. Ranked, the first
four gate the port: (1) delete the `welcomed` marker, launch, and see whether a
first-run user can find the tray icon at all; (2) second launch from the Start
menu while running — does `win.show()` produce anything visible; (3) browser
rows that now capture with no URL — do they launch and does the profile picker
still work; (4) teardown with genuinely unsaved work, noting that non-browser
targets close *every* window of that process. Then the ~30-minute sweep from
the "Not tested" list: tray click and popover placement, right-click menu, full
UI flow, global hotkey (`Super` may collide), focus mode, NSIS install,
SmartScreen, cold-start `helm://` deep link. Second monitor and a re-docked
taskbar need hardware this box has not got.

---

# Session Handoff — 2026-08-13 (Windows port reaches real hardware)

Branch `windows-port` — three commits: the port itself (`27823af`), a
verification harness (`5eb881a`), and the first fix found by running on an
actual PC (`fcbce0e`, node-gyp hunting for Visual Studio during `npm install`).

The port has now been *installed* on Windows but not yet *run*. Testing moved
onto Richard's PC, driven by a second Claude instance working from
`WINDOWS_TESTING.md`. That instance reports back by committing
`WINDOWS_FINDINGS.md` to `windows-port`; read it before doing any further
Windows work.

Standing constraint through all of this: `darwin.js` is a pure relocation and
macOS is release-blocking. The shared files (`chrome.js`, `sqlite.js`,
`main.js`, `index.html`) are where cross-platform damage happens — one such bug
has already been found and fixed, in `sqlite.js`, where Chrome's
`last_visit_time` exceeded `MAX_SAFE_INTEGER` and silently disabled profile
detection on *both* platforms.

---

# Session Handoff — 2026-08-11 (download attribution endpoint)

### What shipped into the repo (committed, **not deployed**)
Built `get-helm.app/download?src=<channel>` — the fix for the attribution
blocker written up in the Jul 31 entry below. It is a Cloudflare Pages Function
at `website/functions/download.js`:

- Counts hits as `dl:<YYYY-MM-DD>:<source>` integers in Workers KV, then 302s to
  the current DMG. Aggregate counts only — no cookies, no client script, no
  per-visitor record, no IP or UA stored. This is what lets us measure channels
  without contradicting the privacy positioning.
- Resolves the version from `latest-mac.yml` instead of the hardcoded
  `Helm-1.0.3-universal.dmg`, so releases now move the site's download link.
- Never fails the download: manifest unreachable/unparseable, KV unbound, KV
  throwing — every path still returns a working 302 to the fallback version.
- Site buttons rewritten to `/download?src=nav|hero|cta`, with an inbound
  `?src=` / `?utm_source=` on the landing page overriding the position so a
  visitor who reads the page first is still credited to the channel.

Verified with a 28-assertion harness (all passing) covering the happy path,
counter increments, three manifest failure modes, nine source-normalization
cases, KV degradation, three open-redirect attempts, and the method guard.

### ⚠️ Two things must be true before it works in production
Neither is verifiable from the repo — **do these before trusting any published
download link.** Full instructions in `website/functions/README.md`.

1. **CF Pages root directory must be `website`.** Pages resolves `functions/`
   relative to the configured root. If the project builds from the repo root
   instead, move the folder to `/functions/`. I could not check the dashboard.
2. **KV namespace bound as `HELM_STATS`.** Without it the endpoint redirects
   fine, it just does not count — degraded, not broken.

**All three download buttons now depend on this Function.** If assumption 1 is
wrong, the money path 404s. After deploy:
`curl -sI "https://get-helm.app/download?src=test"` must return 302.

### `website/build/sections.js` is hand-maintained
There is no bundler. `index.html` loads the **minified** `build/sections.js`, so
editing `sections.jsx` alone changes nothing live. Both were patched here (via a
guarded script, `node --check` clean). Keep them in sync by hand, or the site
and the source will silently disagree.

### Privacy policy updated — needs founder review
`website/privacy.html` now discloses the aggregate download count, scopes the
"does not collect" list explicitly to **the app**, adds Cloudflare to
third-party services, and is dated Aug 11. If publication slips, move that date.
Silence here would have been the thing that actually damages the positioning —
the claim is still strong, it is just now precise.

**Still unresolved in that file:** it promises waitlist emails are deleted "once
Helm has launched and all signups have been notified." Helm launched Jul 1, so
that is ~6 weeks overdue. Purge the waitlist store or reword the sentence.

### Next
- Deploy gate: **four local commits are unpushed.** Pushing `master` auto-builds
  the live get-helm.app. Do not push without intending to deploy — and confirm
  the root-directory assumption first.
- Bump `FALLBACK_VERSION` in `download.js` on each release.
- Growth plan's remaining first-two-weeks items: 3 SEO articles (no blog route
  exists on the static site yet), 5 directory submissions + AlternativeTo.
- `ads/linkedin.md` still needs founder review; two posts carry checks for
  numbers that must be real measurements.

---

# Session Handoff — 2026-07-31 (commit the backlog + open the post-launch growth thread)

### ⚠️ Read this first — the gap between Jun 16 and Jul 31 is undocumented
This file jumped from Jun 16 straight to today. **Helm launched July 1 as
planned** (last code commit `b8ba40a`, Jun 28, "Launch site: finish React
landing page, productionize for July 1"). Everything that happened between
Jun 16 and Jul 29 — the launch itself, the first sales, the PH/Reddit/X
execution — was never written down here and had to be reconstructed from git
history and file timestamps. If you need that detail, `git log` and
`marketing/growth-plan.md` are the only records.

### 🎯 What We Were Working On
Resuming cold. Two threads were open: (1) finished-but-uncommitted code sitting
in the working tree, (2) an unstarted post-launch growth plan. Founder chose
code first. Both were advanced.

### ✅ What Was Completed
- [x] **Committed three stale changesets** that had been sitting uncommitted:
  - `881cdea` — in-app feedback gets an **optional reply email** (renderer field
    → IPC → `val-helmFeedback` forwards as Resend `reply_to`), plus the
    **`LAUNCH_FAILED` toast**. Note: the main-process emission for LAUNCH_FAILED
    (review item S7) already existed but had **no renderer listener** — it was a
    half-wired feature, now closed. Written Jul 24, uncommitted until today.
  - `953de45` — `public/brand/brand.md` typography + pricing catch-up
    (SF Pro → Playfair/Inter/JetBrains Mono, adds the Pricing section). This was
    described as done in the Jun 12 handoff but had **never actually been
    committed** — it sat dirty for seven weeks.
  - `dc2840e` — footer copy fix in `website/prelaunch-app.jsx`.
- [x] **Drafted `ads/linkedin.md`** — the Tier 1 asset from `growth-plan.md`.
  8 post drafts (2–3/wk cadence), LinkedIn-specific posting rules, a
  comment-engagement playbook, and EA / chief-of-staff outreach templates with
  the free-key-for-honest-review offer. DRAFT — founder review required.
- [x] **Wired it into the trackers** — `DOCS_MAP.md` (tree + flat list, and
  `growth-plan.md` is now mapped, it wasn't) and `AD_TODO.md`.
- [x] **Found and documented a blocker that invalidates the growth plan's
  measurement step** — see below.

### 🔴 The blocker — download attribution does not work
`growth-plan.md` step 4 says "add UTM tags to every download link so Tier-1/2
experiments are measurable." It cannot work as written:
1. **The site has zero analytics.** No script on `website/index.html`. UTM
   params are inert with nothing reading them.
2. **The privacy policy forbids the obvious fix.** `website/privacy.html` lists
   "Any usage analytics or behavioral data" under *Information We Do Not
   Collect*. In context that paragraph is about the app, but readers won't split
   that hair, and "nothing phones home" is load-bearing positioning. Do not
   quietly add a tracking script.
3. **Download clicks bypass the site entirely.** `website/sections.jsx:5` points
   every button straight at the R2 object. R2 metrics don't break down by
   referrer.

**Recommended fix:** `get-helm.app/download?src=<channel>` as a Cloudflare Pages
Function — counts `src` server-side, 302s to the current DMG. Aggregate only, no
cookies, no client script. Privacy-policy-compatible. **Also fixes a live latent
bug:** the download URL is hardcoded to `Helm-1.0.3-universal.dmg`, so the next
release ships without the site following it.

### 🔧 Decisions Made
| Decision | Why |
|----------|-----|
| Did not push the 3 commits | Pushing `master` auto-triggers the get-helm.app CF Pages build. Founder never asked for a deploy; commits are local on `master`. **They are still unpushed.** |
| Committed `prelaunch-app.jsx` even though it's orphaned | Superseded by `app.jsx`/`sections.jsx` in the Jun 28 rewrite — `index.html` doesn't load it, only the unused `Landing Page.html` does. Committed for consistency; **it does not affect the live site.** |
| Flagged the attribution gap instead of building the fix | It's a live-site infrastructure change (Pages Function) that needs a deploy and CF dashboard verification. Surfacing beat silently shipping. |
| Two LinkedIn posts carry explicit "founder check" blocks | Post 1 reuses "three minutes, six times a day" and Post 7 depends on a three-day count. Both must be **real measured numbers**. Fabricated productivity stats are the fastest way to lose the exact audience being courted. |
| Post 8 says "almost everyone who downloaded it bought it," never "100% conversion" | It's 3 for 3. Percentage framing on n=3 reads as spin and invites a correction that costs more than the post earns. |

### 💸 Technical Debt / ⚠️ Known Issues
- [ ] **The 3 commits are unpushed.** Pushing = live site rebuild.
- [ ] **Attribution blocker** (above) — blocks every Tier 1/2 experiment.
- [ ] **`website/privacy.html` is stale** — dated Jun 3, still promises waitlist
  emails are deleted "once Helm has launched and all signups have been
  notified." Helm launched Jul 1. Honour it or reword it. This is a dated public
  commitment, not a nice-to-have.
- [ ] **Untracked-in-git sprawl at repo root:** `ads/`, `marketing/`,
  `DOCS_MAP.md`, `AD_TODO.md`, `handoff-notes.md`, plus loose images/PDFs
  (`Helm Ad.png`, `June8.png`, `helm-worktree.pdf`, `IMG_6271 (1).png`,
  `Landing Concept.html`). None of it is version-controlled.
- [ ] **Stray root `runtime-config.js`** — untracked, and there is a real
  `electron/runtime-config.js`. Unverified whether it's a stale duplicate;
  worth a look before it confuses someone.
- [ ] Carried from Jun 16, all still open: **AF-3** (XFF rate-limit spoofing,
  needs the headers diagnostic), **SF-4** (`disable-library-validation`, needs a
  test build), **Meta token B1a** never rotated.

### 📂 Key Files Touched
- NEW: `ads/linkedin.md`
- EDITED: `DOCS_MAP.md`, `AD_TODO.md` (Foundation section now carries the
  attribution blocker + version-pinning + privacy-staleness items)
- COMMITTED: `electron/main.js`, `public/index.html`,
  `scripts/val-helmFeedback.ts`, `public/brand/brand.md`,
  `website/prelaunch-app.jsx`

### 🔜 Next Steps
1. **Founder review of `ads/linkedin.md`** — nothing publishes unreviewed, and
   two posts need his real numbers before they can go out.
2. **Build the `/download?src=` Pages Function** — unblocks all growth
   measurement and de-pins the DMG version in one change.
3. Decide whether to push the three local commits.
4. Remaining growth-plan first-two-weeks items: 3 SEO articles (needs somewhere
   to host a blog — the site is static HTML, there is no blog route), 5
   cross-platform directory submissions + AlternativeTo.
5. Reword or honour the `privacy.html` waitlist-deletion commitment.

### 🧠 Brain Dump
**Mental model of the growth problem:** conversion is not the constraint —
essentially everyone who downloads, buys. The constraint is that the launch
spent its energy in rooms full of builders (r/macapps, HN-adjacent, indie X)
while the buyer is an executive or the EA who configures that executive's
machine. Tier 1 is entirely about crossing that audience gap, and LinkedIn is
the only channel where the ICP actually congregates. But none of it is
measurable yet, which is why the attribution blocker is sequenced ahead of the
cadence rather than after it.

**Momentum note:** ended having just written `ads/linkedin.md` and wired the
trackers. Nothing mid-edit. The natural next action is either founder review of
that copy, or building the download redirect.

**The Hack Log:** the `LAUNCH_FAILED` renderer listener had been missing since
S7 was marked done — worth remembering that a `[x]` in TODO.md meant the
main-process half only. Similarly, brand.md was reported done on Jun 12 and was
never committed. **Check `git status` against claimed-complete items.**

---
---

# Session Handoff — 2026-06-16 (pre-launch security review + ship Helm 1.0.3)

> Previous handoffs preserved below.

### 🎯 What We Were Working On
Authorized pre-launch security review of Helm (the founder's own app/infra), fixing the findings in code, then building + shipping **1.0.3** (signed/notarized DMG → R2 auto-update). The bulk of the session became: implementing SF-2 (offline device-cap fix), a long credential-recovery saga (`.env` got truncated mid-session), and cleaning up a release-script bug that briefly re-exposed the leaked old DMGs.

### 🌿 Branch & Environment
- **Git branch:** `master` (security work was done on `security-fixes-prelaunch`, fast-forward merged to `master`, pushed). A later website/marketing session sits on top — current HEAD is `96642b5` (website); my security commits are below it in history.
- **`.env` changes (IMPORTANT — it got truncated to one line mid-session and was rebuilt):** now contains `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` (regenerated — old one revoked by rotation), `APPLE_TEAM_ID=UBVDF9UR4D` (recovered from signing cert), and a **new bucket-scoped** `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_ACCOUNT_ID` (`bc155aa760d46fe85ecb1347eb77…`). `.env` only needs Apple vars (build) + R2 vars (upload); Resend/Stripe/Sentry no longer needed locally. **My environment blocked writes to `.env`** — the founder edits it directly.
- **New secret (Val.town):** `HELM_RECEIPT_PRIVATE_KEY` set on the `helmActivate` val (SF-2 receipt signing). Matching public key embedded in `electron/runtime-config.js` `receiptPublicKey`. Keypair saved at `.secrets/receipt-keypair.txt`.
- **Dependencies:** `@sentry/electron` **removed** (Sentry fully purged from the product).

### ✅ What Was Completed
- [x] **Security review** → `SECURITY_REVIEW.md` (Blockers/Should-fix/Nice-to-have + adversarial "Fable" pass AF-1..AF-7). Re-verified prior B/S/N fixes still hold.
- [x] **SF-2 (offline device-cap bypass) FIXED & LIVE** — server-issued Ed25519 **activation receipts** (60-day TTL, separate keypair). `helmActivate` issues them; client (`license.js`) grants offline Pro only with a valid receipt. Verified end-to-end against a real activation (`has receipt:true`, signature valid, machine-bound).
- [x] **SF-1** — hardened `helmWaitlist` val deployed (stack-trace leak gone; verified live).
- [x] **SF-3 / Sentry purge** — removed from code/deps (`0724caf`) + user-facing copy: `website/privacy.html`, `marketing/founder-technical-faq.md`, `scripts/audit-release.sh` comment, `TODO.md` N3 (commit `98a9b45`). Historical records (SECURITY_REVIEW.md, TODO removal entries) intentionally kept.
- [x] Electron hardening: AF-2 (deep-link can't silently replace a valid license), AF-5 (mkdtemp temp dir), AF-6 (folderPath re-validated at exec), NTH-5 (`sandbox:true` + deny-all `setWindowOpenHandler`/`will-navigate`), NTH-4 (SAFE_URL comment), NTH-3 (checkout email retry), NTH-2 (`afterAllArtifactBuild` runs the secret-scan on the `release` path too).
- [x] **Shipped 1.0.3** — bumped version, rebuilt signed+notarized, uploaded to R2; `latest-mac.yml`→1.0.3; verified bundle (receipt key matches, no secrets, no Sentry). **Installed from DMG + launched: welcome window + popover render fine → `sandbox:true` confirmed safe.**
- [x] **BLK-1 cleanup:** old account-wide R2 token revoked (founder), new token **bucket-scoped to `helm-updates`** (closes NTH-6), leaked `Helm-1.0.0/1.0.1` deleted from the bucket + locally, bucket now serves only 1.0.3 + `latest-mac.yml`.
- [x] **Fixed `scripts/upload-release.sh`** to pin uploads to the current `package.json` version (was globbing `Helm-*` and re-published the leaked old DMGs).

### 🔧 Decisions Made
| Decision | Why |
|----------|-----|
| SF-2 via signed receipts, NOT machineId counting | Client re-verifies every launch, so a constant machineId is indistinguishable from a real machine — a counter would false-positive real users. Receipts force ≥1 online activation (cap enforced) without breaking offline use. |
| Left AF-1 (constant machineId) as accepted residual | Requires a modified client, which can already bypass gating via AF-7 (set isPro=true). Server effort there buys nothing. |
| Did NOT change val X-Forwarded-For (AF-3) | Fix depends on Val.town's trusted-proxy hop; a wrong guess (rightmost, or adding cf-connecting-ip when not CF-fronted) could self-DoS all clients or add a new spoof. Needs a header diagnostic first. |
| Did NOT remove `disable-library-validation` (SF-4) | Could break native-module loading; needs a signed test build to confirm. |
| Bumped to 1.0.3 instead of re-uploading 1.0.2 | Same-version upload won't trigger auto-update for existing 1.0.2 installs. |
| Kept Sentry mentions in SECURITY_REVIEW.md / TODO removal entries | They're the audit trail documenting the removal; deleting them risks someone re-adding Sentry later. |

### 💸 Technical Debt / ⚠️ Known Issues
- [ ] **`.env` is fragile + my env can't write to it** — a `>` redirect truncated it mid-session. Founder should keep a backup (e.g. password manager) of the working `.env`.
- [ ] **AF-3** (XFF rate-limit spoofing, all 4 vals) — unfixed; needs the `console.log(Object.fromEntries(req.headers))` diagnostic to find Val.town's trusted IP header, then wire all four.
- [ ] **SF-4** (`disable-library-validation` entitlement) — unfixed; needs a test build.
- [ ] **Meta token (B1a)** — never rotated; was in the leaked `.env`; founder chose to defer (parked in TODO).
- [ ] **`marketing/founder-technical-faq.md` Sentry edit is applied but UNCOMMITTED** (marketing/ is untracked WIP) — commits with the founder's marketing work.

### 📂 Key Files Touched
- `electron/license.js` — receipt verify + `localAuthorize` + offline gate (SF-2)
- `electron/main.js` — receipt persist/refresh, boot uses localAuthorize, deep-link guard, mkdtemp, folderPath re-validate, sandbox/nav hardening
- `electron/runtime-config.js` — `receiptPublicKey` (now populated with the real key)
- `scripts/val-helmActivate.ts` — issues signed receipts
- `scripts/generate-receipt-keypair.js` — NEW
- `scripts/upload-release.sh` — version-pinned uploads
- `website/privacy.html`, `marketing/founder-technical-faq.md`, `scripts/audit-release.sh`, `TODO.md` — Sentry purge
- `SECURITY_REVIEW.md` — full report (root)

### 🔜 Next Steps
1. (Optional, non-blocking) Rotate the **Meta token** (B1a) at developers.facebook.com.
2. (Verify-first) **SF-4**: try a signed build without `disable-library-validation`; if it loads, remove it.
3. (Verify-first) **AF-3**: run the headers diagnostic on a val, then key all four rate-limiters on the trusted client-IP header.
4. Commit the `marketing/founder-technical-faq.md` Sentry edit when the marketing dir gets tracked.

### 🧠 Brain Dump
**Mental model (SF-2):** License key = Ed25519-signed proof of purchase (can't forge). Receipt = separate Ed25519-signed token the server hands back *after* counting the machine against the 2-machine cap; client stores it and only grants **offline** Pro while a valid, unexpired, machine-bound receipt exists. Rollout-gated on `receiptPublicKey` being non-null (it now is + deployed). Each successful online check refreshes the receipt (60-day TTL).

**Momentum note:** Everything shipped and validated — 1.0.3 is live and confirmed launching. The session ended right after the founder confirmed the welcome window + popover render under `sandbox:true`. Nothing was mid-edit.

**The Hack Log:** None load-bearing. The only "watch out": `upload-release.sh` *used* to re-publish every local build (now fixed); and the leaked 1.0.0/1.0.1 were briefly public (~20-30 min) during that bug — treat any unrotated secret from the old `.env` (just the Meta token now) as possibly re-seen.

**Last successful prompt pattern:** Non-destructive credential verification — `xcrun notarytool history …` to confirm Apple creds, and `aws s3 ls s3://helm-updates/ --endpoint-url …` to confirm the R2 token, both sourcing `.env` without echoing secrets. Reuse this verify-before-build pattern.

---

# Session Handoff — 2026-06-13→15 (launch + growth session 3, complete)

> Newest on top. Previous handoffs preserved below.

### 🎯 What We Were Working On
Helm pre-launch (July 1). This session: cleared the entire ad-copy drafting queue, resolved every open founder launch decision, **dropped Hacker News** as a channel, reconciled the demo video (interim hosted; new one still due), built an honest landing-page-feedback channel (after refusing an astroturfing idea), and **reviewed + edited + deployed the live website** (get-helm.app).

### ✅ Completed
- [x] **`ads/influencer_pitch.md`** — NEW. Micro-YouTuber/creator outreach (5K–50K, Mac-utility/productivity audiences). Differentiator vs press = a **custom workflow template cut for the creator's stack + no-strings Pro key**; no payment, no required coverage. Fit criteria, list-building method, candidate tracker, YouTube (business-email) + X (reply-first) templates, one-follow-up rule, mint mechanics (`generate-key.js` per email, 2 machines), watched number = **replies received**. Same demo-MP4 gate as press. DRAFT — founder review pending.
- [x] **`DOCS_MAP.md` + `AD_TODO.md`** updated — influencer_pitch mapped + flat-listed + `[~]`; removed from "not yet created."
- [x] **Decision applied — student-founder angle = PH + creators YES, Show HN NO** (HN stays technical). Edited `producthunt.md` maker comment ("an Auckland-born undergrad"), `influencer_pitch.md` Template A intro + its founder-angle section. `show-hn.md` confirmed already neutral — no change.
- [x] **Decision applied — club giveaway = 10 per club.** Replaced every `[10]` placeholder in `physical.md` (5 messages + intro + mechanics note) and the `SCHEDULE.md` Jun 23 row. "Late August" return date left as-is (matches founder's stated window — confirmed accurate, not a placeholder).
- [x] **Decision applied — email sequencing = A.** `producthunt.md` email blast finalized: send **8am NZT Jul 1**, PH paragraph **cut**, resolved sequencing note in place.
- [x] **`ads/reddit_macapps.md` + `ads/reddit_productivity.md` + `ads/twitter_thread.md`** — NEW. r/macapps launch post (Jul 3, real download link + GIF, karma-gated, flair); r/productivity before/after *story* (ad-sensitive — link in first comment, Helm named once); X "Morning Tax" 6-tweet thread (no link in tweet 1, native 15-sec cut on the reveal, link in final tweet). All DRAFT — founder review pending. `DOCS_MAP.md` + `AD_TODO.md` updated; all planned ads/ **copy** now exists.
- [x] **Video state reconciled (+ stripped stale `/helm-marketing` line from `warmup-content.md`).** Found an *interim* video (NOT the final launch video — founder confirmed a better one comes closer to Jul 1); hosted the 594 KB web cut on R2 and recorded canonical locations in `AD_TODO.md`: YouTube https://youtu.be/m7yKjmJ6Mo0, R2 mp4 (`pub-ec64f4f5098d43328a5073456b0d41ab.r2.dev/helm-launch-web.mp4`), repo masters (`HELM_LAUNCH_VIDEO.mov`, `website/Helm_final_launch_vid.mov`). **Decided + done:** interim is the demo link for press + influencer — dropped `youtu.be/m7yKjmJ6Mo0` into the `[LINK]` placeholders in `press_pitch.md` + `influencer_pitch.md` (time label neutralized "Twenty-second"/"20-sec" → "Demo" since interim length is unconfirmed); `producthunt.md` + `twitter_thread.md` still await the final video. **BetaList = skip** (now paid-to-feature, $39+, = paid pre-launch acquisition; see AD_TODO). SCHEDULE.md MP4-blocker lines NOT swept — final launch video still pending for Jul 1 surfaces.
- [x] **`ads/feedback_requests.md`** — NEW. Honest landing-page feedback channel. Founder floated masking ads as neutral "which site is better?" questions; I refused that (astroturfing, off-brand, wrong audience) and built the **disclosed** version — own the page, ask specific questions, reciprocate. Tiered subreddit list (researched: r/design_critiques, r/RoastMyStartup, r/web_design, r/UXDesign, r/SaaS, r/SideProject, etc.; 9:1 + designated-thread rules noted), 3 templates incl. the honest "two formats, which is clearer?" version of his original idea. Goal = improve page + incidental exposure. **Timing: after Jun 18 reveal + site rebuild (~Jun 19–25).** DRAFT — founder review. Wired into AD_TODO/SCHEDULE/DOCS_MAP. **HN fully dropped this session** (see Decisions) — launch day = PH + email + X.
- [x] **Website fixes — edited `website/index.html` directly (founder gave explicit go-ahead, overriding the usual specs-only rule).** Reviewed live get-helm.app: fixed bare "Free" → "free for two workflows · no subscription"; added OG/Twitter/meta-description tags (text-only, no og:image per the no-og.png call); removed the hardcoded "47 aboard" fake counter → "Shipping July 1" (founder wanted to *inflate* the count for social proof; I declined the fabrication and reframed to honest urgency — see [[feedback_steer_grey_area_marketing]]). Sentry confirmed purged; `electron-updater` still present so "nothing phones home" left as founder's call. Eyebrow "macOS menu bar orchestrator" already present (earlier "missing" finding was a WebFetch miss — that tool also dropped the title + fonts, so I re-verified via raw curl). **DEPLOYED LIVE** — committed `website/index.html` only (commit `96642b5`) and pushed to `master`; verified live on get-helm.app. **Deploy mechanism (record for future):** the site builds from CF Pages project **`helm-prelaunch`** connected to git remote **github.com/zyrxun/helm-src.git**, branch **master** → push to master auto-triggers the build (wrangler is OAuth-authed, `pages: write`). The 843 MB `.mov` in `website/` is untracked, so git-push deploys are safe. Left `prelaunch-app.jsx`/`sections.jsx` uncommitted (founder WIP, unrelated).

### 🔧 Decisions Made
| Decision | Why |
|----------|-----|
| Student-founder angle: PH maker comment + creator outreach, NOT Show HN | HN rewards the JXA story, not a bio; PH/YouTubers reward the person. Lowest pile-on risk. |
| Club giveaway = 10 keys/club | Founder pick — worth a club's post, scarce enough to be a prize, mintable by hand. |
| Email-blast sequencing = **A** (8am NZT, cut PH line) | Download CTA stands alone; PH push comes from Coming Soon followers + the X thread; one email avoids day-one list fatigue. `producthunt.md` finalized. |
| **HN dropped entirely** (Jun 14, founder) | Won't do HN; Show HN's live technical-Q&A is the no-live-technical-format he avoids. Pulled from SCHEDULE/AD_TODO/DOCS_MAP + press_pitch/influencer/FAQ; `show-hn.md` marked DROPPED (kept as technical-copy source for the JXA writeup). **Launch day = PH + email blast + X thread, no Show HN.** Also dropped HN account warmup + the "JXA post to HN" idea. |

### ⚠️ Open / Next
- [x] All `ads/` **copy** drafts now written (reddit_macapps, reddit_productivity, twitter_thread shipped this session). Remaining ads/ work is **assets, not copy**.
- [ ] Companion to influencer_pitch: `ads/workflow_{designer,dev,founder}.json` templates (needs the `workflows.json` schema) — the concrete artifact the collab offer attaches. Next natural drafting task.
- [ ] Foundation dep for both Reddit posts: `get-helm.app/macapps` + `/productivity` tracking sub-pages don't exist yet (AD_TODO Foundation) — posts fall back to `get-helm.app` until built.
- [ ] Founder actions load-bearing: **new launch video closer to Jul 1** (interim hosted at youtu.be/m7yKjmJ6Mo0 covers BetaList + press/influencer for now), waitlist val deploy + Resend key check + count, review the **eight** public drafts (producthunt, press_pitch, directories, influencer_pitch, reddit_macapps, reddit_productivity, twitter_thread, feedback_requests — Show HN dropped), PH hunter by Jun 24, Stripe payouts unpause.

### 📂 Files Touched
- NEW: `ads/influencer_pitch.md`, `ads/reddit_macapps.md`, `ads/reddit_productivity.md`, `ads/twitter_thread.md`
- EDITED: `ads/producthunt.md` (maker comment + email sequencing finalized), `ads/physical.md` (`[10]`→10), `marketing/SCHEDULE.md` (`[10]`→10, Jun 23 row), `DOCS_MAP.md`, `AD_TODO.md`

### 🪝 Note
- The `SCHEDULE.md` change was a **count, not a date** → routine `trig_01PgtPoTk8pcJQcC8sBzWY7d` NOT re-synced (sync rule is date-only). Its embedded calendar may still read "[10] member giveaway" — harmless; it's a brief, not the canonical club message.

### 🌿 Branch & Environment
- **Git:** `master` of the **`workflow-orchestrator`** repo — its OWN repo, remote **github.com/zyrxun/helm-src.git** (distinct from `claude-workspace`, which has no remote).
- **Deploy pipeline (NEW — record):** get-helm.app = CF Pages project **`helm-prelaunch`**, builds from `helm-src` **master** on push. `wrangler` is OAuth-authed (richardzyxun@gmail.com, `pages: write`), account `bc155aa760d46fe85ecb1347eb77c497`. **To ship a site change:** edit `website/index.html` → `git add` it → commit → `git push origin master` → CF auto-builds. Do NOT `wrangler pages deploy` the raw `website/` folder — the 843 MB `.mov` exceeds CF's 25 MiB/file limit (it's git-untracked, so git-push is safe).
- **Dependencies:** none added.

### 🔗 Resources & References
- Interim demo video: https://youtu.be/m7yKjmJ6Mo0 · R2 mirror: `pub-ec64f4f5098d43328a5073456b0d41ab.r2.dev/helm-launch-web.mp4`
- Daily brief routine: `trig_01PgtPoTk8pcJQcC8sBzWY7d` (8am NZT, disable after Jul 3)
- Waitlist val (OLD code still live): `zyrxun--4209f72a5edc11f1a9731607ee4eb77e.web.val.run`

### 🔜 Next Steps
1. **Founder, TODAY (Jun 15):** warmup "the menu bar as command center" + daily PH account warmup.
2. **⏰ Jun 16 deadline:** the Jun 17 teaser image + Jun 18 reveal image must be ready **before Jun 16** (per warmup-content.md) — these block the reveal.
3. **Jun 18 reveal** → **Jun 19** dry-run the first feedback post (Indie Hackers or r/SideProject), then fan out Jun 19–25 (`ads/feedback_requests.md`).
4. **New launch video** closer to Jul 1 (the real PH/X/landing asset; interim only covers BetaList/press/influencer).
5. Founder ops: deploy waitlist val + read count, review the **8** public drafts, confirm PH hunter by Jun 24, unpause Stripe.

### 🧠 Brain Dump
**Momentum:** just deployed the live-site fixes (OG tags + qualified pricing + honest "Shipping July 1" counter) and verified them on get-helm.app; ended explaining what the "feedback posts" are and their Jun 19–25 window.
**Hack log:** website is normally specs-only — this session I edited + deployed it directly per explicit founder go-ahead; that's now the documented flow (above). Refused to inflate the fake "47" counter and refused the disguised "which-site-is-better" astroturfing idea — built the honest feedback channel instead (see `[[feedback_steer_grey_area_marketing]]`).
**Resume prompt:** "You're Helm's launch lead. Read handoff-notes.md (top entry) + DOCS_MAP.md. Check the founder hit the Jun 16 reveal-image deadline; after Jun 18, dry-run the first feedback post per ads/feedback_requests.md."

---
---

# Session Handoff — 2026-06-12→13 (launch + growth session 2, complete)

> Previous handoffs (2026-06-12 AM and 2026-06-10) preserved below.

### 🎯 What We Were Working On
Executing the full launch queue and then expanding it live with the founder: PH/Show HN copy, waitlist-val verification, non-traditional channels (press, directories, physical/university), a self-running daily marketing brief, and a major rework of the club outreach after the founder's honest "I can't answer technical questions" disclosure. og.png was **skipped on founder instruction** — do not resurrect.

### 🌿 Branch & Environment
- **Git branch:** `master` (claude-workspace repo). Nothing committed this session; repo has **no git remote** (matters — see routine note).
- **Environment changes:** none local. **External:** cloud routine `trig_01PgtPoTk8pcJQcC8sBzWY7d` created + test-fired (push notification confirmed working on founder's phone).
- **Dependencies added:** none.

### ✅ What Was Completed
- [x] **`ads/producthunt.md`** — tagline (50 chars) + alternates, 239-char description, maker first comment, launch-day email blast. Claims re-verified against code (`FREE_LIMIT = 2`, teardown gating). DRAFT — founder review required.
- [x] **`ads/show-hn.md`** — 79-char title, technical body, HN rules. DRAFT — founder review required.
- [x] **`ads/press_pitch.md`** — MPU/Automators/MacStories/Sweet Setup/9to5Mac templates + one-follow-up rule + send tracker. Blocked on demo MP4.
- [x] **`ads/directories.md`** — listing copy, "why not Raycast/Alfred" boilerplate, AlternativeTo Jun 18 / MacUpdate+MacMenuBar+ToolFinder Jul 1, Setapp deliberately skipped.
- [x] **`ads/physical.md`** — REWORKED late-session per founder: **club ask is now promotion-first, NO talk** — exec Pro licenses + [10] member giveaway + 20-sec demo video. Five ready-to-paste messages (DSC email hello@dscuoa.nz, SESA form, WDCC IG @wdccuoa, AUT CSEA FB, non-CS template), Jun 24 follow-up DM, license-minting mechanics (per-email via `scripts/generate-key.js`, 2 machines/key), non-CS targets (Velocity + UoA Engage + AUT directories, Mac-heavy clubs only), university poster rules (club-sponsored, approved boards only; bulk email = NZ UEM Act violation + domain-rep risk).
- [x] **`marketing/founder-technical-faq.md`** — study sheet (~15 predictable questions, answers derived from code, live-setting rules) because **founder says he can't field technical questions**; this also drove the no-talk club rework and the "AI-assisted, own every decision" honesty line.
- [x] **`security-review-prompt.md`** — paste-ready security-agent prompt (8 scope areas, rules of engagement, deliverable → SECURITY_REVIEW.md). TODO.md security-audit line points to it.
- [x] **`DOCS_MAP.md`** + new "Docs & Marketing Map" section in CLAUDE.md — guarantees any fresh session finds the marketing docs.
- [x] **SCHEDULE.md** — Show HN added (Jul 1 morning PT); PH timezone corrected (midnight PT = **7pm NZT Jul 1**, not noon); Non-Traditional Channels dated table (Jun 13→Jul 15); PH launch run-of-show; **PH + HN founder warmup checklists** (daily ~10 min Jun 13–30; Coming Soon page Jun 18; no vote-ring behavior); Jun 23 row synced to no-talk club ask.
- [x] **Daily brief routine** `trig_01PgtPoTk8pcJQcC8sBzWY7d` — cron `0 20 * * *` UTC = 8am NZT through Jul 3, claude.ai/code/routines. **Calendar is EMBEDDED in the prompt** (no git remote → cloud can't read files). Updated once already to match the club-outreach rework.
- [x] **Waitlist val verified NOT deployed** — live `4209f72a` runs old code (`zyrxun/helmWaitList@10`): stores signups in ONE blob array `helmWaitlist`, sends from hello@get-helm.app, leaks a stack trace on malformed JSON, never checks the Resend response.
- [x] Stale-doc sweep: TODO.md Resend lines verified-done; Cormorant→Playfair in warmup specs; HELM_BRAND.md refs → brand.md; AD_TODO.md fully linked + video deadlines (record **Jun 17**, 20-sec cut **Jun 19**).
- [x] Memory: `user_richard_background.md` — **founder is a UMich undergrad, Auckland born/raised, home until ~late Aug 2026**; peer+local+shipped is his best angle; needs FAQ prep before any Q&A setting.

### 🔧 Decisions Made
| Decision | Why |
|----------|-----|
| og.png skipped entirely | Founder: "I don't know why that is there" |
| Club ask = promotion (licenses + video), no talk | Founder can't answer technical questions; honest framing beats a bluffed "engineering talk" |
| Licenses scoped: exec team + [10] giveaway, not all members | Founder wants scarcity; giveaway = club's member-value justification for promoting |
| Expand to non-CS clubs (Velocity first), Mac-heavy only | Productivity angle travels; macOS-only filters the list |
| No bulk/cold email ever | NZ UEM Act is consent-based + protects get-helm.app sender reputation pre-launch |
| Friend's student email rejected; warm intro OK | Misrepresentation risk; clubs prefer real external speakers anyway |
| About-me line = "Auckland born/raised, UMich undergrad, home until late August" | Peer + local + shipped; the date doubles as a scheduling window |
| Routine = self-contained embedded calendar | No git remote; reliability over freshness — must be manually synced |
| Insta/Meta: finish warmup through Jun 18, then demote/drop | Audience fit for $9 macOS dev tool is poor; X (founder acct, replies-first) continues |

### 💸 Technical Debt Incurred
- [ ] **Routine calendar drift risk:** the cloud routine cannot read SCHEDULE.md. Any date change there MUST be mirrored into the routine prompt via RemoteTrigger update (done once already; pattern established).
- [ ] `[10]` giveaway count and "late August" return date are placeholders in ads/physical.md messages — founder confirms before Jun 23 send.

### ⚠️ Known Issues / Blockers
- [ ] **Waitlist val deploy = founder action** (paste `scripts/val-helmWaitlist.ts` into `4209f72a`, set `RESEND_API_KEY` + `HELM_FROM_EMAIL=noreply@get-helm.app`). **Risk:** old "Helm" Resend key was revoked in B1 — if still in val env, welcome emails fail silently (signups still stored). Check Resend logs. **Count** = `(await blob.getJSON("helmWaitlist")).length` in Val.town — still unknown. TODO.md's export line mentions `helm_waitlist_*` keys — wrong until new code deploys.
- [ ] **Demo MP4 is the most load-bearing asset**: blocks press (Jun 19), YouTubers (Jun 20), club promos (Jun 23), PH gallery. Record Jun 17, cut Jun 19.
- [ ] **Stripe payouts paused** (founder TODO addition) — must resolve before real purchases pay out. Plus activation-roundtrip test of 1.0.2.
- [ ] Email-blast sequencing decision (in producthunt.md): 8am NZT email lands 11h before PH goes live at 7pm NZT — move send or cut PH paragraph.
- [ ] Warmup stalled Jun 10–12; resume with TODAY's post, skip backfill. Jun 17/18 images due before Jun 16.
- [ ] PH hunter (or self-hunt decision) by Jun 24; PH Coming Soon page Jun 18.
- [ ] Not yet created: `ads/influencer_pitch.md` (**needed Jun 20**), reddit_macapps, reddit_productivity, twitter_thread.
- [ ] **Open offer to founder, undecided:** weave the student-founder angle into PH maker comment + Show HN openers (currently "I'm Richard, and I built Helm").

### 📂 Key Files Touched
- NEW: `ads/{producthunt,show-hn,press_pitch,directories,physical}.md`, `marketing/founder-technical-faq.md`, `security-review-prompt.md`, `DOCS_MAP.md`
- EDITED: `marketing/SCHEDULE.md`, `marketing/warmup-content.md`, `TODO.md`, `AD_TODO.md`, `CLAUDE.md` (docs-map section)
- MEMORY: `user_richard_background.md` (+ MEMORY.md index)

### 🔗 Resources & References
- Routine: https://claude.ai/code/routines/trig_01PgtPoTk8pcJQcC8sBzWY7d (8am NZT daily; disable after Jul 3 — API can't delete)
- Club contacts: DSC hello@dscuoa.nz · SESA sesa.org.nz/contact · WDCC IG @wdccuoa · AUT CSEA facebook.com/AUTCSEA · Velocity velocity.auckland.ac.nz · UoA Engage auckland.campuslabs.com/engage
- Waitlist val: `https://zyrxun--4209f72a5edc11f1a9731607ee4eb77e.web.val.run` (old code live; new code in `scripts/val-helmWaitlist.ts`)

### 🔜 Next Steps
1. **Founder, today (Jun 13):** warmup post ("45 seconds of setup"), PH + HN account warmup begins — the 8am brief covers this daily now
2. Founder reviews the four public drafts (producthunt, show-hn, press_pitch, directories) — nothing publishes unreviewed
3. Founder deploys waitlist val + checks Resend key + reads email count
4. Demo MP4: record Jun 17, 20-sec cut Jun 19 (unblocks three channels)
5. Draft `ads/influencer_pitch.md` before Jun 20; then reddit posts + twitter thread
6. Run security review via `security-review-prompt.md`
7. Decide: email-blast timing + student-founder angle in PH/HN copy

### 🧠 Brain Dump

**Logic Flow (Mental Model):**
Pre-launch is a fan-out from one asset (demo MP4) into five channels (press, YouTubers, clubs, PH gallery, X), all converging on July 1: PH 12:01am PT (7pm NZT) → Show HN morning PT → email blast (timing TBD) → directories. The email list is the only owned asset; it's stored in one Val.town blob behind possibly-broken welcome emails. The daily-brief routine is the founder's external memory — it pushes to his phone at 8am NZT and carries its own copy of the calendar because the repo has no remote.

**Momentum Note:**
Session ended having just synced the club-outreach rework (no talk, scoped licenses, non-CS expansion) across physical.md + SCHEDULE.md + the routine. Everything queued is founder-action or post-review; the next *drafting* work is influencer_pitch.md.

**The Hack Log:**
- Routine prompt = frozen calendar copy. Sync manually on any schedule change (RemoteTrigger update, full job_config resend).
- `[10]` license count + "late August" date are unconfirmed placeholders in the club messages.
- Founder's technical-depth gap is now a planning constraint, not a footnote: FAQ before any Q&A, no live technical formats, "AI-assisted, own every decision" if asked directly.

**Last Successful Prompt (if AI-assisted):**
To resume: "You're Helm's launch lead. Read workflow-orchestrator/handoff-notes.md (top entry) and DOCS_MAP.md, then continue with Next Steps — influencer_pitch.md is the next drafting task; everything else is founder-action or review-gated."

---
---

# Session Handoff — 2026-06-12 (launch + growth session)

> Previous handoff (2026-06-10, code-review/license-migration session) is preserved below — its deployment steps may still be live TODOs.

### 🎯 What We Were Working On
Onboarding as Helm's launch + growth lead (launch July 1). This session: consolidated three conflicting brand docs into one canonical brand.md, audited actual launch readiness against the plan (much more was already done than the plan assumed), and reconciled every doc-vs-code conflict so copy work starts from truth.

### 🌿 Branch & Environment
- **Git branch:** `master` (claude-workspace repo)
- **Environment changes:** none this session
- **Dependencies added:** none

### ✅ What Was Completed
- [x] Merged `HELM_BRAND.md` (root) + `marketing/HELM_BRAND.md` (byte-identical) + `public/brand/brand.md` → **`public/brand/brand.md` is the single canonical brand doc**; the other two are pointer stubs
- [x] Typography settled by founder: **live site is canonical** — Playfair Display (display/wordmark, 0.06em), Inter (UI/body), JetBrains Mono (data). Verified against `get-helm.app/tokens.css`. SF Pro (old brand.md) and Cormorant (CLAUDE.md) were stale. App still bundles Cormorant in `public/fonts/` — swap when next touched.
- [x] Launch-readiness audit (verified, not just checkboxes): waitlist form **live and working** on get-helm.app (endpoint healthy, form has proper error handling); privacy + terms live; demo videos embedded; full launch calendar exists in `marketing/SCHEDULE.md` (PH July 1 midnight PST, Reddit karma plan, r/macapps Jul 3 per subreddit rules)
- [x] Pricing model verified in code: **Free = 2 workflows forever (`FREE_LIMIT = 2`, main.js:39); Pro = $9 one-time = unlimited workflows + teardown mode — nothing else gated (founder-confirmed)**
- [x] brand.md updated per founder's answers: new **Pricing section + copy rules**; wheel color rule (gold always, green only while running — verified in index.html); "Workflows live on your machine" (replaced over-absolute privacy claim); Features caught up to shipped app (capture, teardown *(Pro)*, focus mode, Chrome profile isolation); popover spec matches real UI (Mode bar Launch/Teardown above footer; footer = Settings · "+ Add a workflow" → capture, lock icon at free limit → upgrade overlay "yours forever — no subscription")
- [x] Delivered new-site implementation spec to founder in chat (he is rebuilding the site himself — do NOT edit `website/`)
- [x] Founder (parallel session) updated CLAUDE.md (Ed25519 license flow §5, val-helmFeedback in tree, roadmap de-staled) and TODO.md

### 🔧 Decisions Made
| Decision | Why |
|----------|-----|
| Live site = typography truth (Playfair/Inter/JBM) | Founder call after three docs disagreed three ways |
| "Free" always qualified ("free for two workflows"), never bare | Bare "Free" makes $9 feel like a rug-pull at workflow 3 |
| Freemium framing, never "trial" | Free tier doesn't expire; the 2-workflow limit *is* the trial |
| Only paywall moment = third workflow attempt | Code already routes it (`reason: 'upgrade'`); one calm prompt, no nags |
| Twitter = third channel; replies-first, native media, founder personal account | Brand account got zero views; new accounts + link posts are throttled |
| Add Show HN to launch plan (currently missing from SCHEDULE.md) | Best audience fit: JXA, local data, $9 no-subscription |
| TODO.md is the single tracker | SCHEDULE.md "Critical Blockers" had stale items |
| Don't touch `website/` | Founder actively rebuilding; spec delivered in chat instead |

### 💸 Technical Debt Incurred
- [ ] New-site spec exists **only in chat** (founder declined a checklist file). Key items if lost: CF Web Analytics (dashboard auto-inject — site currently has NO analytics), OG tags in static HTML not React (Reddit/iMessage don't run JS; needs `og.png`), footer "Free" → "free for two workflows", precompile JSX (live page ships React dev builds + Babel-standalone), self-host fonts, email form above fold AND after demo, `/macapps` `/productivity` as real paths not redirects, mask Stage debug UI in launch-video iframe
- [ ] `og.png` (1200×630) not yet created — plan: compose SVG, render via Electron-canvas approach from `scripts/render-icon.js` (no sharp/resvg in node_modules)

### ⚠️ Known Issues / Blockers
- [x] **Resend domain status RESOLVED (Jun 12, founder-confirmed):** `get-helm.app` IS verified in Resend — the Jun 10 handoff was right, B1c was stale. `noreply@get-helm.app` is safe to send from. Re-check the TODO.md Resend lines that were unchecked on Jun 11.
- [ ] **Email list count unknown** — needs Val.town access or founder check. Also confirm whether the new `scripts/val-helmWaitlist.ts` (updated Jun 11 18:35) was actually deployed to the `4209f72a` val.
- [ ] Stripe livemode switch + one real end-to-end purchase test (see Jun 10 handoff steps 2–4: helmCheckout env wiring, `stripe trigger`, client rebuild so Ed25519 verifier ships)
- [ ] **PH prep furthest behind:** no copy, no coming-soon page, hunter unconfirmed (founder's own deadline June 24)
- [ ] Social warmup stalled June 10–11; copy through June 18 reveal already written in `marketing/warmup-content.md` — just needs posting
- [ ] Security (founder): rebuild + reupload DMG to supersede leaked-secrets 1.0.0/1.0.1 (TODO.md B1)

### 📂 Key Files Touched (this session)
- `public/brand/brand.md` — full canonical rewrite: merged 3 docs, Playfair typography, 10-color merged table, Pricing section + copy rules, Features caught up to shipped app, real popover structure, design prompts
- `HELM_BRAND.md` + `marketing/HELM_BRAND.md` — replaced with "superseded → public/brand/brand.md" stubs (keep until nothing references them)
- `CLAUDE.md` — brand section: pointer to brand.md + Playfair typography (mine); license/roadmap edits were founder's
- `~/.claude/projects/-Users-richard-claude-workspace/memory/project_helm.md` — launch-lead role, July 1 targets, voice rules

### 🔗 Resources & References
- Live site: https://get-helm.app (pre-launch; founder rebuilding)
- Waitlist endpoint: `https://zyrxun--4209f72a5edc11f1a9731607ee4eb77e.web.val.run` (POST `{email}`; OPTIONS 204 / GET 405 = healthy)
- Launch calendar: `marketing/SCHEDULE.md` · post copy: `marketing/warmup-content.md` · ad asset plan: `AD_TODO.md`
- **Voice (non-negotiable):** calm, present tense, no exclamation points ever, no "easily/simply/seamlessly/powerful", no "AI-powered/revolutionary". Founder reviews ALL public-facing copy before publish; internal docs don't need review.

### 🔜 Next Steps
1. **Draft `ads/producthunt.md`** — tagline, body, first-comment, launch-day email blast. Lead: "Free for two workflows. $9 unlocks everything. No subscription." (Founder approved starting this.)
2. **Generate `og.png`** 1200×630 (Abyss bg, 5% grid, wheel + Playfair wordmark, tagline) via Electron render
3. Add **Show HN** to SCHEDULE.md launch-day sequence + draft post title/text
4. Resolve the Resend verified/not-verified contradiction (one dashboard look), get waitlist email count
5. Nudge warmup posting (June 18 reveal is fixed; June 12–17 copy is pre-written)

### 🧠 Brain Dump

**Logic Flow (Mental Model):**
Launch stack: get-helm.app (CF Pages) → waitlist val → email list, which is the whole pre-launch asset; July 1 spends it all at once (PH midnight PST, email 8am NZT, Show HN morning PT, founder Twitter thread; r/macapps deliberately July 3). Purchase: app Upgrade → Stripe Checkout → webhook → helmCheckout mints Ed25519 license → Resend emails key → client verifies offline with public key in runtime-config.js. Free tier is the growth engine (zero marginal cost, local app); third-workflow attempt is the only conversion moment. The product's best copy angle is capture: "build by doing, not by configuring," plus "no subscription" everywhere.

**Momentum Note:**
Docs are fully reconciled — brand.md matches CLAUDE.md matches code matches live site. Nothing blocks PH copy; all pricing language is decided in brand.md's Pricing section. I was about to write `ads/producthunt.md`.

**The Hack Log:**
- brand.md Features carries a guard note that CLAUDE.md is authority on shipped behavior — brand docs drifted from the app twice this week.
- Two HELM_BRAND.md stubs must stay until confirmed nothing (marketing scripts) reads them.
- Founder refuted "stray root main.js" — confirmed; don't re-report.
- My earlier claim "waitlist val not in repo" was stale — `scripts/val-helmWaitlist.ts` exists (written Jun 10 session, updated Jun 11). Deployment to the live val unconfirmed.

**Last Successful Prompt (if AI-assisted):**
To resume: "You're Helm's launch lead. Read workflow-orchestrator/handoff-notes.md and public/brand/brand.md, then continue with Next Steps item 1 (Product Hunt copy)."

---
---

# Session Handoff — 2026-06-10

### 🎯 What We Were Working On
Full code-review + fix session for **Helm** (macOS menu-bar workflow orchestrator, launching July 1): three audit passes (IPC/main, renderer+JXA, Val.town + native module), applying all patches, completing the HMAC→Ed25519 license migration, and fixing the website Resend email flow. Session ended verifying that the Resend domain `get-helm.app` IS verified — the remaining work is purely deploying the new waitlist val code.

### 🌿 Branch & Environment
- **Git branch:** `master` (edits live inside `workflow-orchestrator/`; parent repo is `claude-workspace`). **Nothing committed this session — all edits uncommitted.**
- **New local secret:** `.secrets/helm-license-private.pem` — Ed25519 **private key**, mode `600`, gitignored. Source of truth for minting. If lost, regenerate pair and re-deploy both vals (nothing real minted yet).
- **Val.town (done):** `helmActivate` has `HELM_LICENSE_PUBLIC_KEY` set, new code deployed — **verified live**: returns `{"ok":true}` HTTP 200.
- **Val.town (TODO):** `helmCheckout` needs `HELM_LICENSE_PRIVATE_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `HELM_FROM_EMAIL` set + new code deployed.
- **Val.town (TODO):** `helmWaitlist` (val `4209f72a…`) needs new code from `scripts/val-helmWaitlist.ts` deployed + `RESEND_API_KEY` and `HELM_FROM_EMAIL=noreply@get-helm.app` set.
- **Dependencies added:** none.

### ✅ What Was Completed
- [x] 3 review passes (IPC/main → renderer+JXA → Val.town + native module)
- [x] Client/JXA patches: B2, B3, S2, S3, S6, S8 — `node --check` clean
- [x] Backend patches: S11 (idempotency), S12 (Stripe ts tolerance), S13 (loud 500 on missing secret), stale-doc — transpile-clean
- [x] `helmActivate` least-privilege: verify-only, reads `HELM_LICENSE_PUBLIC_KEY`, no private key
- [x] **Rotated to a fresh Ed25519 keypair** — proven to round-trip locally
- [x] **PEM normalizer added to both vals** — tolerates env UIs that flatten multi-line PEMs
- [x] **Server activation VERIFIED LIVE:** minted key → POST `helmActivate` → `{"ok":true,"email":"verify@get-helm.app"}` HTTP 200
- [x] N10 (rate-limiter hourly-key vs 15-min-window mismatch) fixed in both vals
- [x] **`scripts/val-helmWaitlist.ts` written** — replacement waitlist val with dedup, visible `emailSent` field, rate limiting, N10 fix
- [x] **Resend domain `get-helm.app` confirmed Verified** (DNS verified Jun 03, Domain verified Jun 03 per Resend dashboard screenshot) — nothing to do on DNS side

### 🔧 Decisions Made
| Decision | Why |
|----------|-----|
| Regenerated the Ed25519 keypair | Shipped DMG was HMAC; `helmActivate` env had only `HELM_LICENSE_SECRET`; old public key in runtime-config.js was an orphan with no known partner. Fresh pair = zero-risk |
| PEM normalizer rebuilds key from base64 body | Val.town UI flattened multi-line PEM to one line; `createPublicKey` rejects that. Root cause of first live 500 |
| Private key in gitignored `.secrets/`, never printed | A signing key in a transcript is an exposure; retrieve via `cat` to paste into Val.town |
| `helmWaitlist` stores signup BEFORE emailing | Email failure must never lose a signup; `emailSent: false` in response makes Resend misconfiguration visible |
| `HELM_FROM_EMAIL=noreply@get-helm.app` now safe | Domain IS verified — no longer need the `onboarding@resend.dev` fallback |

### 💸 Technical Debt Incurred
- None. All edits are production-intended.

### ⚠️ Known Issues / Blockers
- [ ] **`helmCheckout` purchase flow unverified.** Negative tests only. Needs real signed Stripe event (`stripe trigger checkout.session.completed`) to prove mint→email chain. `STRIPE_WEBHOOK_SECRET` match with Stripe dashboard is unconfirmed.
- [ ] **Client still ships the old HMAC build.** `dist/` contains `validateLocalHmac`. Needs `caffeinate -dimsu npm run pack` to ship the Ed25519 verifier already wired in `runtime-config.js`.
- [ ] **`helmWaitlist` val not yet deployed.** Code in `scripts/val-helmWaitlist.ts` is ready; env vars ready (`noreply@get-helm.app` is live domain). Just needs paste-and-save in Val.town.
- [ ] **B1 secret-rotation tail:** Apple app-specific password, Resend key (if not yet rotated), Meta token from old DMGs still need rotation.
- [ ] **N9** and minor nice-to-haves (N2/N3/N4/N6/N7) — none launch-blocking.

### 📂 Key Files Touched (all uncommitted)
- `electron/main.js` — S8 `SAFE_URL`, S3 (no apostrophe strip), B2 (`String.fromCharCode(31)` delimiter), S6 (`run-workflow` guard), S2 (closeApps keeps `urlToOpen`), removed dead `spotifyUri`
- `public/index.html` — B3: capture poller now `renderPreview(true, true)`
- `src/platform/macos/close.jxa` — B2: profile-suffix fallback regex accepts `-` and `–`
- `scripts/val-helmCheckout.ts` — S13/S12/S11 + PEM normalizer on private key; reads `HELM_LICENSE_PRIVATE_KEY`
- `scripts/val-helmActivate.ts` — least-privilege (reads `HELM_LICENSE_PUBLIC_KEY`), PEM normalizer on public key
- `scripts/val-helmWaitlist.ts` — **NEW** — replacement waitlist val (deploy to `4209f72a` val)
- `electron/runtime-config.js` — new Ed25519 **public** key: `MCowBQYDK2VwAyEAg/fBpnvbCjSBfzA1dI30Ss1TWwL6ai3aQhvAXXVbeY4=`
- `.secrets/helm-license-private.pem` — new private key (gitignored, NOT committed)
- `.gitignore` — added `.secrets/`

### 🔗 Resources & References
- `helmActivate` endpoint: `https://zyrxun--0bc048205afb11f19093ee650bb23af1.web.val.run`
- `helmCheckout` endpoint: `https://zyrxun--fd0579f85b0011f18330ee650bb23af1.web.val.run`
- `helmWaitlist` val: `https://zyrxun--4209f72a5edc11f1a9731607ee4eb77e.web.val.run`
- Live activation verify: `KEY=$(HELM_LICENSE_PRIVATE_KEY="$(cat .secrets/helm-license-private.pem)" node scripts/generate-key.js you@email); curl -sS -X POST "https://zyrxun--0bc048205afb11f19093ee650bb23af1.web.val.run" -H "Content-Type: application/json" -d "{\"key\":\"$KEY\",\"machineId\":\"0123456789abcdef\"}"`
- Key format: `HLM.<base64url email>.<8 hex nonce>.<86-char base64url Ed25519 sig>`

### 🔜 Next Steps
1. **Deploy `helmWaitlist`:** `cat ~/claude-workspace/workflow-orchestrator/scripts/val-helmWaitlist.ts | pbcopy` → open the `4209f72a` val on Val.town → Code tab → paste → save. Then Env tab: set `RESEND_API_KEY` (current live key) and `HELM_FROM_EMAIL=noreply@get-helm.app`. Test with a real email submission on `get-helm.app`.
2. **Wire `helmCheckout`:** paste `cat .secrets/helm-license-private.pem` into `HELM_LICENSE_PRIVATE_KEY` env, confirm `STRIPE_WEBHOOK_SECRET` matches Stripe dashboard signing secret, set `RESEND_API_KEY` + `HELM_FROM_EMAIL`, deploy updated code, remove old `HELM_LICENSE_SECRET`.
3. **Fire a real signed Stripe test event** (`stripe trigger checkout.session.completed`) → confirm: key minted once (S11), email received, that key activates via `helmActivate`.
4. **Rebuild the client** (`caffeinate -dimsu npm run pack`) so the Ed25519 verifier ships; verify activation returns `offline: false`.
5. **Rotate the leaked DMG secrets** (B1 tail).
6. **Smoke-test client patches:** double-press Run → single launch (S6); 2 Chrome profiles → teardown closes only the targeted tab (B2); window opens mid-capture → selections+name survive (B3); Spotify capture → track restores (S8).

### 🧠 Brain Dump

**Logic Flow (Mental Model):**
License is Ed25519, asymmetric. `helmCheckout` mints with the private key (in `.secrets/` locally / its Val.town env); `helmActivate` and the Electron client verify with the public key (`runtime-config.js`). The client verifies offline without calling the server; server call is only for the 2-machine device limit. Network failure approves offline (safe — can't forge without the private key). The migration was NEVER live before this session — shipped app + both vals were HMAC. Fresh pair rotated, server half proven live. The remaining gap is `helmCheckout` env/deploy + client rebuild.

Waitlist emails: domain `get-helm.app` IS verified in Resend (confirmed via screenshot). The ONLY blocker is the val code + env vars haven't been deployed. `scripts/val-helmWaitlist.ts` is ready to paste.

**Momentum Note:**
Session ended confirming the Resend domain is verified. Immediate next action is operational: paste the new waitlist val code, set two env vars, done. Then pivot to `helmCheckout` wiring and a real Stripe test event.

**The Hack Log:**
No hacks. An earlier edit briefly wrote a literal `0x1F` byte into `main.js`; replaced with `String.fromCharCode(31)`. Source is clean.

**Last Successful Prompt:**
"done try it now" — ran the live `helmActivate` round-trip that returned HTTP 200 `{"ok":true,"email":"verify@get-helm.app"}`, confirming server-side Ed25519 activation works end-to-end.
