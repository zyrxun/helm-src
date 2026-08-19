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

**Not set up.** Unsigned Windows binaries trigger a SmartScreen "Windows
protected your PC" interstitial that the user must click through via *More
info → Run anyway*. That is a serious conversion problem for a paid product and
should be solved before any Windows launch.

Options, roughly in order of cost:

1. **Azure Trusted Signing** — cheapest real option, but requires an
   organisation with a verifiable identity and 3+ years of history.
2. **OV certificate** from a CA — cheaper, but reputation accrues per
   certificate, so SmartScreen keeps warning until enough installs accumulate.
3. **EV certificate** on a hardware token — expensive, but grants SmartScreen
   reputation immediately.

Once a certificate exists, electron-builder reads `CSC_LINK` and
`CSC_KEY_PASSWORD` from the environment, matching the existing macOS pattern.

---

## Distribution

The auto-updater metadata for Windows is `latest.yml`, a sibling of the
existing `latest-mac.yml`, in the same `helm-updates` R2 bucket.
`scripts/upload-release.sh` uploads everything in `dist/`, so it needs no
change — but the Windows artifacts have to be built on Windows and copied into
`dist/` before it runs.

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
8. **The NSIS installer.** Built, never executed. SmartScreen unseen.
9. **Auto-update on Windows.**
10. **`backgroundMaterial: 'acrylic'` on Windows 11.** Only the Windows 10
    fallback has been seen.
11. **Multi-monitor, and any taskbar edge other than bottom.** The placement
    math was checked against synthetic bounds; the taskbar was never moved.

---

## Open product problem: the overflow tray

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

Undecided. Nothing has been implemented.
