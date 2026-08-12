# Helm on Windows

Status: **the port builds and the architecture is complete; nothing here has
been run on a Windows machine yet.** Everything below is written from the
implementation, not from a test session. Treat the "Unverified" section as the
first job for whoever gets a Windows box in front of them.

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
```

`pack:win` produces:

- `Helm-<version>-x64-setup.exe` and `Helm-<version>-arm64-setup.exe` (NSIS,
  per-user install, no UAC prompt — this matters while the binary is unsigned)
- `Helm-<version>-x64-portable.exe` (no installer; **does not auto-update**)

The NSIS build is the auto-update path.

**Building from macOS mostly does not work.** electron-builder needs `wine` to
run `rcedit` when stamping the icon and version resources into the Windows
executable. Build on Windows, or in a Windows CI runner.

`native/profile-probe` is macOS-only Objective-C++. Its `binding.gyp` now
declares `type: none` off macOS, so the Windows packaging run skips it instead
of dying trying to compile a `.mm` file. `darwin.js` already `require`s it in a
`try`/`catch`, so an absent binary is a supported state.

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

## Unverified — do these first on a real Windows machine

Nothing in this port has executed on Windows. In rough priority order:

1. **The three PowerShell scripts parse and run.** They have been checked
   structurally (balanced here-strings, braces) but never parsed by PowerShell,
   and the embedded C# has never been compiled by `Add-Type`.
2. **`capture.ps1` returns sane rows** — and, specifically, that the
   `SKIP_PROCESSES` / `SKIP_TITLES` lists actually suppress the shell surfaces.
   That list was written from knowledge of Windows internals, not from reading
   a real capture, so expect to add entries.
3. **Chrome window titles match `History` titles exactly.** The whole URL
   recovery scheme rests on this. If Chrome truncates or decorates titles in
   the window caption, `urlMapForTitles` needs a fuzzier match.
4. **Edge's title suffix.** The regex tolerates a zero-width space inside
   "Microsoft Edge" because some builds emit one. Confirm against a real Edge.
5. **`backgroundMaterial: 'acrylic'`** renders as intended on Windows 11 and
   degrades to solid Abyss on Windows 10.
6. **Tray positioning.** `getWindowPosition()` computes `opensDownward` from
   the tray icon's Y coordinate, which should place the popover *above* a
   bottom-docked taskbar and below a top-docked one. Test both, plus a
   secondary monitor.
7. **Global hotkeys register.** `Super`-based accelerators may collide with
   reserved Windows shortcuts.
8. **The DND registry write takes effect** without a sign-out, and Explorer
   picks it up live.
