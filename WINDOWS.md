# Helm on Windows

Status: **the backend is verified on real hardware; the UI is not.** A first run
on a Windows 10 machine (2026-08-19) exercised capture, URL recovery, profile
attribution, launch, teardown, focus mode and `pack:win` successfully, and found
four defects, all fixed. Full results and the list of what remains untested:
`WINDOWS_FINDINGS.md`.

Nothing that requires clicking was tested — the tray icon has never been
clicked, no hotkey has been pressed, and no workflow has been driven through the
renderer. One product problem is open and unresolved: on Windows 10 the tray
icon lands in the hidden overflow tray, so a first-run user never sees the app.

---

## Why the code is shaped this way

macOS and Windows differ in one way that decides almost every design choice in
this port.

On macOS, Helm *asks applications what they are holding*. Apple Events let
`capture.jxa` enumerate every Chrome tab in every window, read the document
Preview has open, and ask Terminal for its working directory. The app answers
in structured data.

Windows has no equivalent channel. What Windows offers is the window list:
process, executable path, window title, PID. Everything richer than that has to
be **reconstructed** — usually from files the applications leave on disk.

Two consequences run through the whole Windows backend:

1. **A window title is the primary key.** Chrome tab URLs are recovered by
   matching the window title against the profile `History` databases.
2. **Teardown operates on windows, not tabs.** There is no way to close a
   single Chrome tab from outside the browser process.

Neither is hidden from the user. `platform.capabilities` reports them and the
renderer hides controls that cannot work. Claiming a feature the platform
cannot deliver is worse than not shipping it.

---

## Architecture

`electron/main.js` performs no OS automation directly. It talks to
`electron/platform/`, which dispatches on `process.platform`:

```
electron/platform/
├── index.js     dispatcher + the documented backend contract
├── darwin.js    macOS backend (a pure relocation of the old inline main.js code)
├── win32.js     Windows backend
├── chrome.js    shared Chromium profile/History intelligence
└── sqlite.js    read-only SQLite, engine-probed at runtime
```

`darwin.js` is a *move*, not a rewrite. The macOS path is the shipping revenue
path; behaviour changes there are release-blocking.

`chrome.js` and `sqlite.js` are genuinely shared. Chromium's `Local State` and
per-profile `History` schema are identical on both platforms — only the
user-data root differs — so profile detection is one implementation
parameterised by root directory, not two.

PowerShell scripts live in `src/platform/windows/` and are packaged to
`resources/win/`, mirroring how the `.jxa` files are packaged to
`resources/jxa/`.

---

## What works

| Feature | Windows behaviour |
|---|---|
| Capture open apps | `capture.ps1` enumerates top-level windows via Win32 `EnumWindows` |
| UWP / Store apps | Unwrapped from `ApplicationFrameHost.exe` to the real process |
| File Explorer folders | Read via the `Shell.Application` COM object |
| Chrome + Edge tab URLs | Recovered by matching window title → `History` DB |
| Chrome + Edge profiles | Same `Local State` catalog as macOS |
| Launch with profile | `chrome.exe --profile-directory=<dir> <url>` |
| Teardown | `WM_CLOSE` to specific windows, so apps can prompt to save |
| Per-profile teardown | Title-filtered `WM_CLOSE`, since all profiles share one PID |
| Do Not Disturb | Registry toast switch (one mode — see below) |
| Global hotkeys | Electron `globalShortcut`; `Super` replaces `Command` |
| Deep links | Single-instance lock + `second-instance` argv parsing |
| Auto-update | electron-updater, same R2 bucket and `latest-mac.yml` sibling |

---

## What is degraded, and why

**No per-tab capture.** A macOS capture lists every Chrome tab. A Windows
capture lists every Chrome *window*, and recovers the URL of the tab that
window is currently showing. Background tabs are invisible to us. Reported as
`capabilities.perTabCapture: false`.

**No per-tab close.** Chrome exposes no external API to close one tab. A
browser target closes the window showing that page. Reported as
`capabilities.perTabClose: false`.

**One focus mode, not many.** macOS Focus modes are user-named and driven
through Shortcuts. Windows has no public API for Focus Assist or Focus
Sessions, and the Windows 11 focus state lives in an opaque CloudStore blob
that is not safe to write. What *is* documented and stable is the global toast
switch (`NOC_GLOBAL_SETTING_TOASTS_ENABLED`), which is the same setting the
Notifications settings page flips. So Windows gets exactly one mode, "Do Not
Disturb". It suppresses toasts; it does not suppress app sounds, taskbar
badges, or the Windows 11 focus timer. Reported as
`capabilities.focusModes: 'single'`.

**Chrome URL recovery misses sometimes.** A page that has not been flushed to
the `History` database yet, or a page that never commits a title, will not
match. This is expected and is not an error: the row still captures, it just
opens the browser without a target URL. The same class of gap exists on macOS
(brand-new URLs missing from History), so the failure mode is familiar.

**No Slack / VS Code state probes.** The macOS backend shells out to
`slack_state.py` and `vscode_state.py` to recover workspace and channel. The
Windows equivalents are not written; `win32.js`'s `enrich()` is a pass-through.
Both apps store their state in the same LevelDB/JSON shapes on Windows, so this
is a straightforward addition rather than a blocked one.

**No Accessibility permission flow.** Windows grants window enumeration to any
process in the same session, so there is no TCC equivalent and no permission to
request. The Accessibility settings row is hidden on Windows rather than being
shown permanently reading "Granted".

---

## Security notes

These matter more on Windows than on macOS and were deliberate:

- **`powershell.exe` is invoked by absolute path**, built from `%SystemRoot%`.
  Resolving `powershell` through `PATH` would let anything writable earlier in
  `PATH` answer instead of the system shell.
- **Executables must end in `.exe`** (`isSafeExePath` in `main.js`). Handing
  `spawn()` a `.bat` or `.cmd` re-enters `cmd.exe` and reintroduces shell
  parsing of the arguments — CVE-2024-27980.
- **The Windows path validator rejects `" | < > * ?`** and control characters,
  which also blocks wildcard injection into PowerShell's wildcard-aware
  parameters.
- **`close.ps1` compares process names with `-eq`, not `Get-Process -Name`.**
  `-Name` is a wildcard parameter, so a process name containing `[ ]` would
  silently widen the match.
- **Title matching uses `StartsWith`, not `-like`**, because window titles
  legitimately contain `*`, `?` and `[ ]`.
- **A title filter that matches nothing closes nothing.** Chrome runs every
  profile under one browser process, so a "close everything as a fallback"
  branch would tear down the user's other profiles. `close.ps1` reports and
  stops instead.
- **Teardown uses `WM_CLOSE`, never `TerminateProcess`.** `WM_CLOSE` is the
  message the title-bar X sends, so an app with unsaved work shows its own save
  prompt. macOS presses Cmd+S before quitting editors; the Windows path
  deliberately does not simulate keystrokes, because injecting Ctrl+S into
  whatever happens to be focused is a good way to corrupt an unrelated
  document.

---

## Building

```bash
npm install
npm run menu-bar:win     # dev
npm run pack:win         # NSIS installer + portable exe into dist/
                         # requires Developer Mode — see the next section
```

### Prerequisite for `pack:win`: Developer Mode, or an elevated shell

`pack:win` cannot complete on a normal, non-elevated Windows account.
electron-builder unpacks its `winCodeSign` toolchain before every Windows
build, and that archive contains macOS `.dylib` **symlinks**. Creating a
symlink needs `SeCreateSymbolicLinkPrivilege`, which a standard user does not
hold unless Developer Mode is on. Confirmed on Windows 10 22H2, unelevated,
Developer Mode off; `menu-bar:win` is unaffected — this is packaging only.
The build retries four times, then fails:

```
ERROR: Cannot create symbolic link : A required privilege is not held by the client.
  : ...\winCodeSign\227697207\darwin\10.12\lib\libcrypto.dylib
ERROR: Cannot create symbolic link : A required privilege is not held by the client.
  : ...\winCodeSign\227697207\darwin\10.12\lib\libssl.dylib
  • Above command failed, retrying 3 more times
```

Either of these fixes it:

- **Enable Developer Mode** — Settings → Update & Security → For developers →
  Developer Mode. It grants the privilege to the signed-in user and persists
  across reboots. Preferred, because the build itself stays unelevated.
- **Run `pack:win` from an elevated shell** — an Administrator PowerShell
  already holds the privilege.

Last resort, if neither is available: extract the `winCodeSign` archive into
electron-builder's cache by hand
(`%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\`) with a tool that
tolerates the failed symlinks, then re-run the build — it finds the cache
populated and skips the unpack. This is per-machine state that the repo does
not carry, and it has to be redone whenever electron-builder bumps the
toolchain version. It is how the 1.0.3 Windows build was produced on the test
machine; a build done this way has never been reproduced on a machine with
Developer Mode on.

Separately, some `windows-10\*.dll` files in the same archive fail to extract
with `Access is denied`. That looks like antivirus rather than privilege, and
it does not block the build — signing is skipped while the binaries are
unsigned, so nothing reads those files.

`pack:win` also needs `bash`, for the release audit hook. Git for Windows
supplies one; `after-artifact-build.js` looks for it in the usual install
locations rather than relying on `PATH`, which a stock machine does not have it
on.

`pack:win` produces:

- `Helm-<version>-x64-setup.exe` and `Helm-<version>-arm64-setup.exe` (NSIS,
  per-user install, no UAC prompt — this matters while the binary is unsigned)
- `Helm-<version>-x64-portable.exe` (no installer; **does not auto-update**)

The NSIS build is the auto-update path.

**Building from macOS mostly does not work.** electron-builder needs `wine` to
run `rcedit` when stamping the icon and version resources into the Windows
executable. Build on Windows, or in a Windows CI runner.

`native/profile-probe` is macOS-only Objective-C++, and getting `npm install` to
survive on Windows takes more than a `binding.gyp` condition. node-gyp searches
for Visual Studio during *configure*, before it parses `binding.gyp` at all, so
a Windows install fails with `Could not find any Visual Studio installation to
use` no matter what the gyp targets say. The skip therefore lives in
`native/profile-probe/install.js`, which exits 0 off macOS and shells out to
`node-gyp rebuild` on it. `binding.gyp`'s `OS!='mac'` condition is kept as
belt-and-braces for any tool that does reach it.

For the same reason `pack:win` and `release:win` pass
`-c.npmRebuild=false`. electron-builder's rebuild step finds native modules by
looking for `binding.gyp`, so it would walk straight into the same wall. Nothing
Helm depends on is native on Windows, so there is nothing for it to do.

`darwin.js` `require`s the module in a `try`/`catch`, so an absent binary is a
supported state. On macOS a build failure stays loud on purpose — it silently
disables Accessibility-based Chrome profile attribution.

---

## Code signing

**Decided against.** Helm ships unsigned on Windows. No certificate, no Azure
Trusted Signing subscription, no purchase of any kind. The reasoning is in the
limits section below; what replaces it is the free reputation path, built on
the `get-helm.app` domain.

This is a deliberate trade, not an omission. The rest of this section is the
playbook that makes it survivable.

### What SmartScreen actually gates

Narrower than it first appears. The "Windows protected your PC" interstitial
fires on **Mark-of-the-Web** — the alternate data stream a browser attaches to
a file it downloaded. Two consequences decide the whole strategy:

- **Only the first, manual install hits the wall.** The user downloads the
  installer in a browser, the file carries MOTW, SmartScreen challenges it.
- **Auto-updates are exempt.** electron-updater fetches the new installer over
  HTTP itself and writes it to disk without MOTW, so no interstitial appears.
  A user who gets past the first install never sees SmartScreen again, however
  many releases ship.

So the cost of shipping unsigned is paid exactly once per user, at the worst
possible moment — the first run of a paid product — and never again.

Reputation accrues along two axes: **per file hash** and **per download
URL/domain**. Every new release is a new hash and starts from nothing. The
domain reputation persists, which is why the download URL matters more than
any individual build.

### The per-release routine

1. **Build and upload to the stable URL.** `npm run pack:win` on Windows, then
   `bash scripts/upload-release.sh`. The installers must be served from
   `updates.get-helm.app` — a stable HTTPS custom domain on the existing
   `helm-updates` R2 bucket — rather than from a fresh link each time.
   Domain reputation is the only reputation that carries between releases.
   *Blocked until the custom domain is bound; see Distribution below.*
2. **Submit the exe to Microsoft.** The software-developer file submission
   portal — <https://www.microsoft.com/en-us/wdsi/filesubmission> — takes each
   release binary directly. It clears Defender false positives and seeds
   reputation for that hash ahead of the first real download. Free, and worth
   doing on every release rather than only when something goes wrong.
3. **Update the winget manifest.** `winget` installs bypass the SmartScreen
   shell prompt entirely, so a user who runs `winget install Helm.Helm` never
   meets it. Manifests live in `winget/` in this repo; the submission steps and
   the current blockers are in `winget/README.md`.
4. **Release infrequently.** Every release resets file-hash reputation. A
   steady trickle of builds keeps every download permanently unknown.

The download page should show the *More info → Run anyway* flow rather than
pretending it does not happen — a user who is told what to expect clicks
through; one who is ambushed closes the tab. That copy is public-facing and
requires founder review, so it is not written here.

### What to expect

The wall shows for new file hashes and fades as installs accumulate. There is
no threshold Microsoft publishes and no way to query current standing; the only
signal is whether the interstitial still appears on a clean machine. Expect the
first weeks of any release to be worse than the last.

The interstitial is a click-through, not a block. The button under *More info*
says **Run anyway**. Nothing is quarantined, nothing is deleted, and the
installer itself is untouched — this is a reputation prompt, not a malware
verdict.

Two things make it worse than the baseline and are worth avoiding: a download
URL that changes between releases, and a build that trips a Defender heuristic
and never gets submitted for review. Step 1 and step 2 exist for those.

### The honest limits

- **No free certificate exists for closed-source commercial software.** The
  free signing services — SignPath's OSS tier, Certum's open-source
  certificate — are open-source only. Helm is a paid, closed-source product and
  does not qualify for any of them.
- **A self-signed certificate does not help.** It satisfies nothing SmartScreen
  checks. An unsigned binary and a self-signed binary get the same treatment.
- **Reputation cannot be bought on the free path, only earned.** Every lever
  above is a nudge. None of them removes the first-install interstitial for a
  brand-new build; they shorten how long it lasts.
- **The first-install conversion cost is real.** It is being accepted, not
  solved.

> **If this is ever revisited:** the paid routes are Azure Trusted Signing
> (cheapest, and individual validation exists — the old note here claiming a
> 3+ year organisation requirement was out of date), an OV certificate from a
> CA (reputation still accrues per certificate, so warnings continue for a
> while), or an EV certificate on a hardware token (expensive, immediate
> SmartScreen reputation). Whichever is chosen, electron-builder reads
> `CSC_LINK` and `CSC_KEY_PASSWORD` from the environment, matching the existing
> macOS pattern.

---

## Distribution

The auto-updater metadata for Windows is `latest.yml`, a sibling of the
existing `latest-mac.yml`, in the same `helm-updates` R2 bucket.
`scripts/upload-release.sh` pins its uploads to the `package.json` version
rather than globbing `dist/`, and its list was extended to cover the Windows
setups, their blockmaps and `latest.yml`. Files it does not find are skipped,
so a Windows-only `dist/` uploads only what it built — but the Windows
artifacts still have to be built on Windows and copied into `dist/` before it
runs.

**No Windows artifact has been uploaded yet.** No release has run since the
script was extended, so the bucket currently holds macOS files only. Two things
are queued behind that: the winget submission, which needs the installer live
at a stable URL before its hash can be validated, and the domain reputation
described under Code signing, which cannot start accruing until downloads are
actually served from `updates.get-helm.app`. The bucket is still reachable only
at the rate-limited `https://pub-ec64f4f5098d43328a5073456b0d41ab.r2.dev`;
binding the custom domain is item 4 on the roadmap in `CLAUDE.md`.

---

## Verified on hardware (2026-08-19, Windows 10 22H2)

Evidence for each of these is in `WINDOWS_FINDINGS.md`.

- The three PowerShell scripts parse, and the embedded C# compiles via
  `Add-Type`.
- **Chrome window titles match `History` titles exactly** — the assumption the
  whole port rests on. 4 of 4 browser windows recovered both URL and profile,
  including a Gmail caption carrying a live unread count. No regex change
  needed.
- `SKIP_PROCESSES` suppresses the shell surfaces, and Helm filters its own
  windows out of capture.
- Launch works bare, with a URL, and with a Chrome profile.
- Teardown is fail-closed for browsers: a title filter matching nothing closes
  nothing. Targeted close hits only the intended window.
- Focus mode drives the toast registry value both ways.
- `backgroundMaterial: 'acrylic'` degrades to opaque Abyss on Windows 10.
- Tray placement math is correct against real `tray.getBounds()`, including from
  the overflow tray.
- `pack:win` produces NSIS and portable builds carrying the right scripts.

Two capture/teardown bugs were found and fixed: suspended Store apps were
invisible to capture and immune to teardown, because Windows 10 detaches a
backgrounded app's `CoreWindow` from its `ApplicationFrameWindow`.

---

## Still unverified

**Nothing requiring mouse or keyboard input has ever been exercised** — the
session that ran the tests could not inject either.

1. **The tray icon has never been clicked.** Nor has the right-click menu been
   opened.
2. **The entire renderer path.** Capture rows in the popover, mode toggles, the
   profile picker, saving and running a workflow. The backend is covered; the
   route from `index.html` through `preload.js` to the IPC handlers is not.
3. **Global hotkeys.** Never registered, never pressed. `Super`-based
   accelerators may collide with reserved Windows shortcuts.
4. **Teardown against genuinely unsaved work** — the case `WM_CLOSE` exists for.
   No app has yet raised its own save prompt.
5. **Cold-start deep links** (`helm://activate?key=`) through `process.argv`.
6. **Edge.** Read correctly from `Local State`, but never running during a
   capture, so the caption regex — the one tolerating a zero-width space — has
   never met a real Edge caption.
7. **`SKIP_TITLES`.** No window it targets ever appeared.
8. **The SmartScreen interstitial.** The NSIS installer itself has now been run
   (2026-08-22, `/S`, exit 0, per-user, no UAC), but from a local path with no
   Mark-of-the-Web, which skips SmartScreen entirely. Nobody has yet downloaded
   the installer in a browser and seen what Windows says.
9. **Auto-update on Windows.**
10. **`backgroundMaterial: 'acrylic'` on Windows 11.** Only the Windows 10
    fallback has been seen.
11. **Multi-monitor, and any taskbar edge other than bottom.** The placement
    math was checked against synthetic bounds; the taskbar was never moved.

---

## The overflow tray — onboarding guidance shipped, effectiveness unproven

On a stock Windows 10 desktop the tray icon goes to the **overflow** flyout
behind the chevron, not the visible notification area. Windows decides this per
new icon and defaults new arrivals to overflow; there is no API to promote one.

For a menu-bar app this is close to fatal. The macOS model assumes the icon is
always visible. On Windows a first-run user dismisses the welcome window and the
app becomes invisible — no dock icon, no window, no taskbar button
(`skipTaskbar: true`). Options, all requiring product work in `main.js` and the
welcome flow:

1. Have onboarding walk the user through pinning it, deep-linking to
   `ms-settings:taskbar`.
2. Make relaunch from the Start menu reliably show something.
3. Open the popover once on first run, so the user sees where it lives.

**Option 1 is implemented** (`6fa840e`). The welcome window shows a
Windows-only card that names the ship's-wheel icon, explains that Windows
files new icons into the overflow menu behind the chevron, and offers an
**Open Taskbar settings** button. The card is gated by `data-platform` in
`public/welcome.html` — the four macOS cards carry `data-platform="darwin"`,
the new one `data-platform="win32"`, and the default view stays macOS. The
button calls `openTaskbarSettings` across the preload bridge, into an
`open-taskbar-settings` IPC handler in `electron/main.js` that opens
`ms-settings:taskbar` via `shell.openExternal`. The handler returns
immediately off Windows; no existing handler was touched.

**Options 2 and 3 are not implemented.** Relaunch from the Start menu still
runs through to `win.show()` with nobody having watched what that looks like,
and the popover does not open itself on first run.

The open question is whether the card actually works. Every line of it is a
guess until someone who has not seen it before deletes the `welcomed` marker,
launches, and tries to follow it to a visible tray icon. That needs a human —
see `WINDOWS_FINDINGS.md`, item 1 of the manual test list.
