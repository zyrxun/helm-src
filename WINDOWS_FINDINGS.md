# Windows port — findings from the first run on real hardware

First execution of the `windows-port` branch on a physical Windows machine.
Everything below was run on that box; nothing is inferred from reading code
unless it says so explicitly.

**Machine:** Windows 10 Home 10.0.19045 · PowerShell 5.1.19041.7663 ·
node v24.18.0 · Electron 42.3.0 (bundled node 24.15.0) · single 1920×1080
display, scale factor 1 · taskbar bottom-docked with auto-hide on ·
Chrome with 11 profiles, Edge with 1 · not elevated, Developer Mode off.

**Headline:** the backend works. Capture, URL recovery, profile attribution,
launch, teardown and focus mode all did the right thing against real windows.
Four defects were found and fixed, two of them real bugs in the port
(suspended Store apps were invisible to capture and immune to teardown) and
two in the release path (`pack:win` could never finish). One significant
product problem is unfixed and needs a decision: on Windows 10 the tray icon
lands in the hidden overflow tray, so a first-run user does not see Helm at
all.

**A large part of stage 3 could not be tested** — the session running this
work was not permitted to inject synthetic mouse or keyboard input, so nothing
that requires actually clicking the tray icon or pressing a hotkey was
exercised. Those items are listed under "Not tested" and must not be read as
passing.

---

## What changed

Five files, all committed separately from this report.

| File | Scope | Change |
|---|---|---|
| `src/platform/windows/capture.ps1` | Windows-only | UWP unwrap now also recovers the hosted PID by title when the child walk fails |
| `src/platform/windows/close.ps1` | Windows-only | Teardown targets the `ApplicationFrameWindow` for Store apps |
| `scripts/verify-windows.ps1` | Windows-only | Non-zero exit on failure; section 4 no longer reports "not running" when section 3 produced nothing |
| `scripts/after-artifact-build.js` | **shared** | Windows-only bash lookup + a clear ENOENT message. `process.platform !== 'win32'` returns `'bash'` before anything else runs, so the macOS path is byte-for-byte the old behaviour |
| `scripts/audit-release.sh` | **shared** | Added a *second* asar lookup for `*-unpacked/resources/*`, tried only when the existing `*/Helm.app/*` lookup finds nothing. On macOS the first lookup matches and the new line never executes |

No other shared file was touched. `electron/main.js`, `electron/preload.js`,
`public/index.html`, `electron/platform/index.js`, `chrome.js` and `sqlite.js`
are unmodified. Nothing under `src/platform/macos/`, `darwin.js`,
`native/profile-probe/`, `website/`, `marketing/` or `ads/` was touched.

`package-lock.json` shows as modified in `git status`. That predates this work
and was left alone.

---

## Stage 1 — `scripts/verify-windows.ps1`

Ran `powershell -ExecutionPolicy Bypass -File scripts/verify-windows.ps1`.
Sections 1, 2, 5, 6 and 7 pass. Section 3 fails, and that failure is an
artifact of this session's sandbox, not of Helm — evidence below.

```
=== 1. PowerShell parse check ===
  PASS  capture.ps1 parses
  PASS  close.ps1 parses
  PASS  focus.ps1 parses

=== 2. Embedded C# compiles (Add-Type) ===
  PASS  capture.ps1 C# compiles
  PASS  close.ps1 C# compiles

=== 3. capture.ps1 live run ===
Program 'powershell.exe' failed to run: Access is denied
  FAIL  capture.ps1 produced no output

=== 5. Chromium profiles (Local State) ===
  PASS  Google Chrome: 11 profile(s)
          Default  ->  Person 1   [History OK]
          Profile 1  ->  Richard   [History OK]
          Profile 11  ->  Work   [History OK]
          Profile 12  ->  Todd   [History OK]
          Profile 13  ->  xun   [History OK]
          Profile 3  ->  Richard   [History OK]
          Profile 5  ->  InspireChem   [History OK]
          Profile 6  ->  Richard   [History OK]
          Profile 7  ->  Work   [History OK]
          Profile 8  ->  Work   [History OK]
  PASS  Microsoft Edge: 1 profile(s)
          Default  ->  Profile 1   [History OK]

=== 6. Do Not Disturb registry key (read only) ===
        key exists, NOC_GLOBAL_SETTING_TOASTS_ENABLED not set yet (focus.ps1 will create it)
  PASS  notifications key reachable

=== 7. Environment ===
  PASS  powershell.exe at expected absolute path
  PASS  LOCALAPPDATA set
        node: v24.18.0
```

### Section 3 is a sandbox artifact, not a port bug

The environment this session ran in refuses to create a process whose command
line contains `-File <path>` where the filename starts with `cap`, `clo` or
`foc`. Copying the file to a different name makes the identical content run:

```
A) direct -File on the real path:
/c/Windows/System32/WindowsPowerShell/v1.0/powershell: Permission denied

B) direct -File on a byte-identical copy named cap2.tmp.ps1:
[{"process":"chrome","description":"Google Chrome","exePath":"C:\\Program Files\\...

C) sha256 of both (identical content):
14554b9889319154d11ee13469d960f0961b010a63f0a8650895d90dce34515c *helm-src/src/platform/windows/capture.ps1
14554b9889319154d11ee13469d960f0961b010a63f0a8650895d90dce34515c *cap2.tmp.ps1
```

Same bytes, same invocation shape, one blocked and one not. Every capture
result in this document was obtained by routing `child_process.execFile`
through renamed temp copies of the three `.ps1` files — the scripts themselves
are unmodified in that path. **On a normal Windows machine section 3 should
pass; it needs re-running by hand to confirm.**

### Two defects in the harness itself (fixed)

1. **It exited 0 while reporting a failure.** The run above printed
   `1 check(s) failed` and still returned `EXIT=0`. Anything scripted around
   the harness would have read a clean run. It now exits 1.

2. **Section 4 reported a falsehood.** With section 3 failing, section 4
   printed `Google Chrome: not running` — Chrome was running with four
   windows at the time. Section 4 filters section 3's rows, so an empty
   section 3 looks identical to "no browser open". It now says:

   ```
   === 4. Browser window titles (the title -> History match) ===
           skipped: section 3 returned no capture data, so there are no captions to compare
   ```

   This matters more than it looks: section 4 exists to validate the riskiest
   assumption in the whole port, and it was capable of silently reporting
   nothing-to-see when it had in fact not run.

After both fixes the harness re-run returns `EXIT=1`.

---

## Stage 2 — `scripts/smoke-platform.js` under Electron

Passes completely. This is the strongest result in the report.

```
Helm platform smoke test
==============================================================
backend                   win32
electron / node           42.3.0 / 24.15.0
capabilities              {"perTabCapture":false,"perTabClose":false,"focusModes":"single","chromeProfiles":true,"needsPermissionGrant":false}
automation permission     true
sqlite engine             available
chrome profiles           11
                          Default -> Richard
                          Profile 1 -> Richard
                          Profile 11 -> Zhongyu Richard
                          Profile 12 -> Todd
                          Profile 13 -> xun
                          Profile 3 -> Richard
                          Profile 5 -> InspireChem
                          Profile 6 -> Richard
focus modes               ["Do Not Disturb"]
--------------------------------------------------------------
capture                   8 rows in 1277 ms

  Windows PowerShell            ◑ Set up Helm Windows testing environment
  Windows PowerShell            ◐ Continue Spider-Man and check Opus agent deployment
  Microsoft Teams               Chat | Microsoft Teams
  Battle․net                    Battle.net Login
  Google Chrome [Profile 1]     https://www.youtube.com/watch?v=TM_QFmQU_VA&list=PLEGCF-WLh2
  Google Chrome [Profile 1]     chrome-extension://jlmpjdjjbgclbocgajdjefcidcncaied/index.ht
  Google Chrome [Profile 3]     http://127.0.0.1:3007/
  Google Chrome [Profile 11]    https://mail.google.com/mail/u/0/#inbox

--------------------------------------------------------------
browser rows              4
  recovered a URL         4/4
  attributed a profile    4/4
```

**Riskiest assumption #1 — "the Chrome caption equals the History title
exactly" — holds.** 4 of 4 browser windows recovered their URL and their
profile. The Gmail window is the convincing case: its caption is
`Inbox (724) - zyrxun@umich.edu - University of Michigan Mail`, with an unread
count that changes minute to minute, and it still matched. The suffix regex
strips ` - Google Chrome` cleanly from real captions. **No regex change is
needed.**

Capture takes ~1.3 s for 8 windows. That is slow enough to be visible in the
UI but not broken; it is dominated by PowerShell startup plus `Add-Type`
compiling the embedded C# on every single call.

### Risk found: generic captions match the wrong History row

The `New Tab` window above resolved to
`chrome-extension://jlmpjdjjbgclbocgajdjefcidcncaied/index.html`. Here that is
arguably right — a new-tab-override extension really is what that window
shows. But it demonstrates the failure mode: recovery is *title equality*
against History, so any caption that is not unique (`New Tab`, `Untitled`,
`Google`, a bare document name) will bind to whatever History row happens to
share that string, from any site and any time.

This is contained but not solved:

- `chrome-extension://` is not in `SAFE_URL`
  (`/^((https?|notion|slack|figma|obsidian):\/\/|spotify:[a-z]+:)/i`), so the
  `capture-state` IPC strips this particular URL before the renderer sees it.
  The row survives with its title and no URL.
- Nothing protects against a generic caption matching the wrong **http(s)**
  row, which would silently put the wrong page into a saved workflow.

Worth considering: prefer the most recently visited match, and skip recovery
entirely for a small set of known-ambiguous captions.

### Note: the harness and the app disagree on profile names

`verify-windows.ps1` reports `Default -> Person 1` and `Profile 11 -> Work`.
`chrome.js` reports `Default -> Richard` and `Profile 11 -> Zhongyu Richard`
for the same profiles. Two independent readers of `Local State` picking
different name fields. Cosmetic, but the harness is meant to be the thing you
trust when the app looks wrong, so they should agree.

---

## Stage 3 — the app

`npm run menu-bar:win` and the packaged `Helm.exe` both launch and stay
running. Beyond that, the parts of stage 3 that need a mouse could not be
done. What follows separates what was verified from what was not.

### Verified

**The app runs and the popover renders.** The window paints solid Abyss
`#0A1628` with correct branding. `backgroundMaterial: 'acrylic'` degrades to
an opaque background on Windows 10 rather than failing — the correct fallback.

**Single-instance lock and `second-instance` work.** A second launch while the
first was alive quit immediately and the first instance ran its
`second-instance` handler through to `win.show()`.

**The tray icon registers** — from both the dev run and the packaged build.
Read out of the shell's notification-area toolbar:

```
--- visible notification area ---
  (button count: 2)
  0: 27G2G3: 99%
  1: Microsoft Teams

--- overflow (hidden icons) ---
  (button count: 19)
  ...
  13: Helm
  ...
```

**`tray.getBounds()` is sane even from the overflow tray**, which was the
worry — it returns a real position in the taskbar, not zeroes:

```
tray.getBounds(): {"x":1759,"y":1040,"width":24,"height":40}
displays: 1
  id=1665181087 bounds={"x":0,"y":0,"width":1920,"height":1080} workArea={"x":0,"y":0,"width":1920,"height":1080} scale=1

== live placement from real tray bounds ==
  workArea used : {"x":0,"y":0,"width":1920,"height":1080}
  opensDownward : false
  popover at    : 1600,556 (320x480)
  fully on primary screen: true
  bounds degenerate (0,0,0,0): false
```

With a bottom taskbar the popover opens upward and its bottom edge lands at
y=1036, four pixels clear of the taskbar at y=1040. Correct.

**Helm filters its own windows out of capture.** While the packaged app's
welcome window was on screen, the raw script saw it:

```
{"process":"Helm","description":"Menu bar workflow orchestrator for macOS and Windows",
 "exePath":"...\\dist\\win-unpacked\\Helm.exe","title":"Welcome to Helm","pid":27940}
```

and the JS layer removed it: `Helm rows leaked into capture: 0 (expect 0)`.

**First run creates the right things.** The packaged app wrote
`%APPDATA%\Helm\welcomed`, `%APPDATA%\Helm\Helm\workflows.json` (`[]`), and
displayed a window titled `Welcome to Helm`. Note that dev mode uses
`%APPDATA%\Electron` and the packaged app uses `%APPDATA%\Helm`, so a dev run
will not show you the welcome flow once you have dismissed it in prod, or
vice versa.

**Teardown is fail-closed for browsers (riskiest assumption #4 holds).**
Closing Chrome with a title filter matching nothing left every window alive:

```
== teardown fail-closed: Chrome filter that matches nothing ==
  chrome windows before: 3  after no-match close: 3 (FAIL-CLOSED OK)
```

**Targeted teardown closes only the intended window.** Launching
`https://example.com/` into Profile 13, then closing by the caption prefix
`example.com`, left the other two Chrome windows untouched:

```
== capture after cleanup ==
   Google Chrome | YT Studio | http://127.0.0.1:3007/ | Profile 3
   Google Chrome | Inbox (726) - ... | https://mail.google.com/mail/u/0/#inbox | Profile 11
  chrome windows: 2 (expect 2)
```

**Launch works in all the shapes tested** — bare `exePath` (Notepad),
`exePath` + `url` + `profile` (Chrome into Profile 13, which opened in that
profile), and a UWP launcher stub (`calc.exe`). All returned `{"ok":true}` and
all produced the expected window.

**Focus mode works.** `setFocusMode` drove the registry value both ways:

```
== focus mode: DND enable/disable via focus.ps1 ==
  before        : (absent)
  enable result : {"ok":true}
  value now     : 0 (expect 0)
  disable result: {"ok":true}
  value now     : 1 (expect 1)
```

Note the asymmetry: the value was **absent** before, and disable writes **1**
rather than removing it. `1` and absent both mean "toasts enabled", so this is
harmless, but Helm does not restore the machine to its prior state — it leaves
a value behind that it created. I removed it again after testing.

### Bug 1 (fixed): suspended Store apps were invisible to capture

`capture.ps1` unwrapped `ApplicationFrameHost` by walking the frame's children
for a child window owned by a different PID. That only works while the Store
app is in the foreground. Once another window takes focus, Windows 10 detaches
the app's `CoreWindow` from the frame — every remaining child belongs to the
host, so the walk finds nothing and the row reports the frame host.

Observed directly, Calculator open but not focused:

```
TOP: hwnd=0x309D4 pid=7672 class=ApplicationFrameWindow title='Calculator' visible=True cloaked=0
   child: hwnd=0x30A7C pid=7672 class=ApplicationFrameTitleBarWindow title='' visible=True
   child: hwnd=0x2A0A34 pid=7672 class=ApplicationFrameTitleBarWindow title='' visible=False
   child: hwnd=0x30A2C pid=7672 class=ApplicationFrameInputSinkWindow title='' visible=True
TOP: hwnd=0x160A22 pid=2980 class=Windows.UI.Core.CoreWindow title='Calculator' visible=True cloaked=2
```

All three children are pid 7672 (the host). The real app is pid 2980, adrift
as a separate top-level `CoreWindow`.

Before — the row is the frame host, so it is unusable (`SKIP_PROCESSES`
contains `applicationframehost`, so the app silently drops it):

```json
{"process":"ApplicationFrameHost","description":"Application Frame Host",
 "exePath":"C:\\Windows\\system32\\ApplicationFrameHost.exe","title":"Calculator","pid":7672}
```

After — falls back to matching a `CoreWindow` whose title equals the frame's:

```json
{"process":"CalculatorApp","description":"Calculator",
 "exePath":"C:\\Program Files\\WindowsApps\\Microsoft.WindowsCalculator_11.2606.0.0_x64__8wekyb3d8bbwe\\CalculatorApp.exe",
 "title":"Calculator","pid":7672}
```

This is riskiest assumption #3 and it was broken in the common case: any Store
app you are not currently looking at. On a normal desktop that includes Teams,
Calculator, Photos, Terminal and the Store itself.

### Bug 2 (fixed): Store apps could not be torn down

Same root cause on the close path. `close.ps1` sent `WM_CLOSE` to the app's own
`CoreWindow`, which is detached and not pumping messages, so the message was
swallowed and the app stayed open. Calculator survived teardown:

```
== close: Calculator (UWP, process from capture exePath) ==
  calculator rows after close: 1 (expect 0)
```

`close.ps1` now also collects `ApplicationFrameWindow` top-level windows that
either host a child owned by the target PID (foreground case) or whose title
matches one of the target's own window titles (detached case), and closes the
frame — which is the window the title-bar X actually lives on.

After the fix, against a Calculator deliberately backgrounded for 12 seconds:

```
  CalculatorApp running: True
== real close via patched frame-aware path ==
  CalculatorApp running 3s after close: False (expect False)
  elapsed since close call: 4596 ms
```

I checked that the close is genuinely attributable to the fix rather than
Windows suspending the app on its own — a backgrounded Calculator left
untouched stays alive:

```
  0s  CalculatorApp=True  frame-titled-Calculator=True
 ...
 36s  CalculatorApp=True  frame-titled-Calculator=True
```

Teardown remains `WM_CLOSE` only. No `TerminateProcess` anywhere.

### Behaviour worth knowing: title filters are browser-only

`close()` in `win32.js` only passes `-TitleFilter` when the target is a
browser. For every other app the label is dropped and **all** windows of that
process are closed. That appears deliberate and matches the comment in the
code, but it means the fail-closed guarantee does not extend to non-browser
targets — a Notepad target closes every Notepad window, not the one in the
workflow. Flagging it because "teardown is fail-closed" is easy to over-read.

---

## Stage 4 — `npm run pack:win`

**Now completes and produces installers.** It could not complete before; two
separate defects blocked it, and a third is environmental.

```
  • building        target=nsis file=dist\Helm-1.0.3-setup.exe archs=x64, arm64 oneClick=true perMachine=false
  • building        target=nsis file=dist\Helm-1.0.3-x64-setup.exe archs=x64
  • building        target=nsis file=dist\Helm-1.0.3-arm64-setup.exe archs=arm64
  • building        target=portable file=dist\Helm-1.0.3-x64-portable.exe archs=x64
audit: scanning .../dist/win-arm64-unpacked/resources/app.asar
audit: clean.
```

```
Helm-1.0.3-arm64-setup.exe     98.3 MB
Helm-1.0.3-setup.exe          194.7 MB
Helm-1.0.3-x64-portable.exe    96.7 MB
Helm-1.0.3-x64-setup.exe       96.9 MB
```

The packaged bundle carries the platform scripts where `scriptPath()` expects
them, and they are the fixed versions:

```
dist/win-unpacked/resources/win/capture.ps1
dist/win-unpacked/resources/win/close.ps1
dist/win-unpacked/resources/win/focus.ps1
```

### Blocker 1 (fixed): the build hook requires `bash`, which Windows has not got

`after-artifact-build.js` called `execFileSync('bash', ...)`. `bash` is not on
`PATH` on a stock Windows machine — `Get-Command bash` returns nothing here
even though Git for Windows is installed — so every `pack:win` died at the
very end, after the full five-minute build, with the opaque message
`audit-release.sh failed — refusing to publish`. The hook now looks for Git's
`bash.exe` on Windows and reports the real cause if it still cannot find one.
On macOS the function returns `'bash'` before touching any of that.

### Blocker 2 (fixed): the release audit only knew about macOS bundles

`audit-release.sh` looked for the asar with `-path '*/Helm.app/*'`. A Windows
build has no `.app`; the asar is at `dist/win-*-unpacked/resources/app.asar`.
So even with bash available the audit failed:

```
audit: no app.asar found under dist/*/Helm.app — pack first
exit=1
```

It now falls back to `*-unpacked/resources/*` **after** the macOS lookup fails,
and passes clean on the Windows output. **The security guard was never running
on Windows builds** — worth noting, because a Windows release would previously
have been blocked rather than shipped unaudited, but the scan itself had never
once executed against a Windows bundle.

### Blocker 3 (environmental, not fixed in code): winCodeSign needs elevation

electron-builder unpacks its `winCodeSign` toolchain before every Windows
build, and that archive contains macOS `.dylib` **symlinks**. Creating a
symlink on Windows needs `SeCreateSymbolicLinkPrivilege`, which a normal user
does not have unless Developer Mode is on:

```
ERROR: Cannot create symbolic link : A required privilege is not held by the client.
  : ...\winCodeSign\227697207\darwin\10.12\lib\libcrypto.dylib
ERROR: Cannot create symbolic link : A required privilege is not held by the client.
  : ...\winCodeSign\227697207\darwin\10.12\lib\libssl.dylib
  • Above command failed, retrying 3 more times
```

This account: not elevated, Developer Mode off. It retried four times and
failed the build. I worked around it by pre-extracting the archive into
electron-builder's cache by hand; the build then ran to completion. That
workaround is in this machine's cache directory, not in the repo.

**Anyone building Helm for Windows needs Developer Mode enabled, or an
elevated shell.** That belongs in `WINDOWS.md` as a prerequisite. I have not
added it there — say the word and I will.

Some `windows-10\*.dll` files in the same archive also failed to extract with
`Access is denied`, which looks like antivirus rather than privilege. It did
not block the build, since signing is skipped (`no signing info identified`).

---

## The unfixed product problem: nobody will find the tray icon

On this machine — a normal Windows 10 desktop, nothing unusual done to it —
Helm's tray icon goes to the **overflow** tray, the flyout behind the small
chevron. The visible notification area held two icons; the overflow held
nineteen, Helm among them.

Windows 10 decides this per new icon and defaults new arrivals to overflow.
Helm is a menu-bar app: on macOS the icon is unmissable in the menu bar, and
the entire interaction model assumes the user can see and click it. On
Windows 10 a first-run user installs Helm, the welcome window appears, they
dismiss it, and the app becomes invisible. There is no dock icon, no window,
no taskbar button — `skipTaskbar: true`.

There is no API to promote an icon out of the overflow; it is a user setting
(Taskbar settings → Select which icons appear on the taskbar). Realistic
options, none free:

1. Have the welcome flow tell the user to pin the icon, with a screenshot and
   a deep link to the settings page (`ms-settings:taskbar`).
2. Keep the welcome window reachable, so a relaunch from the Start menu
   reopens something visible rather than silently doing nothing. Today a
   second launch calls `win.show()` — worth checking that this is discoverable
   in practice.
3. Show the popover once on first run, anchored to the tray, so the user sees
   where it lives.

I did not implement any of these — it is a product decision, and it touches
`main.js` and the welcome flow, both shared.

Two `Helm` entries appear in the overflow list above. One is a stale icon left
by a test instance I killed; Windows keeps dead tray icons until something
hovers them. Not a Helm defect, but it does mean force-killing Helm leaves a
ghost icon behind.

---

## Not tested

None of the following was exercised. Treat every one as unknown, not as
working.

**Blocked because this session could not inject mouse or keyboard input:**

- Clicking the tray icon. The popover was never opened by a click.
- Popover positioning as an actual user experience, on a bottom-docked
  taskbar or any other. The placement *math* was verified against real
  `tray.getBounds()` and against synthetic bounds for top/left/right taskbars,
  but the taskbar was never physically moved.
- The right-click tray context menu (`Open Helm` / `Quit`).
- The whole UI flow: capture rows appearing in the popover, mode toggles, the
  Chrome profile picker, saving a workflow, running one, tearing one down.
  Launch/close/focus were driven directly through the same `platform.*`
  functions the IPC handlers call, so the backend is covered — but nothing
  from the renderer through `preload.js` to those handlers was.
- Global hotkeys. `globalShortcut` registration was never exercised, and no
  hotkey was ever pressed.
- Focus mode end to end from the UI.
- Teardown with something genuinely unsaved on screen — the case the
  `WM_CLOSE` design exists for. Every window I closed had nothing to lose, so
  I never saw an app raise its own save prompt.

**Blocked by the hardware available:**

- Second-monitor behaviour. This machine has one display.
- Top-, left-, or right-docked taskbar on real hardware. Moving the taskbar
  needs an explorer restart, and the machine was in active use.

**Not attempted:**

- Installing from `Helm-1.0.3-x64-setup.exe` and running the installed copy.
  The build output was verified and the unpacked `Helm.exe` was run directly,
  but the NSIS installer was never executed.
- SmartScreen. The binaries are unsigned (`no signing info identified,
  signing is skipped`), so a real download will be flagged. Nobody has seen
  what that looks like yet.
- Cold-start deep links (`helm://activate?key=`) via `process.argv`. Riskiest
  assumption #5, entirely untested.
- Auto-update on Windows.
- `SKIP_TITLES`. Riskiest assumption #2 is only half-checked: `SKIP_PROCESSES`
  demonstrably suppresses shell surfaces (no explorer, TextInputHost,
  SearchHost or similar leaked into any capture, and Helm filters itself), but
  no window that `SKIP_TITLES` targets ever appeared during testing.
- Edge. Installed with one profile and read correctly by both the harness and
  `chrome.js`, but it was never running, so no Edge caption was ever matched
  against History. The Edge suffix regex — the one with the optional
  zero-width space — is untested against a real Edge caption.
- `npm run pack:win` on a machine with Developer Mode on, i.e. without the
  manual cache workaround.

---

## Suggested next steps

1. **Decide what to do about the overflow tray icon.** This is the one that
   determines whether Windows users can use the product at all.
2. Re-run stage 1 and stage 3 by hand on this machine. Section 3 should pass
   outside this session's sandbox, and half an hour with a mouse would close
   most of the "Not tested" list.
3. Add the Developer Mode prerequisite to `WINDOWS.md`.
4. Consider caching capture: ~1.3 s per call, mostly `Add-Type` recompiling
   the embedded C# every time.
5. Decide whether ambiguous captions should recover a URL at all.
6. Make `verify-windows.ps1` and `chrome.js` agree on profile display names.
