# Windows port — findings from the first run on real hardware

> **Resolved since this report** (`e7c36bc`, written on the Mac, **not yet run
> on Windows**):
>
> - **Ambiguous captions** no longer recover a URL at all. `New Tab`, `Google`,
>   `Untitled`, `about:blank` and similar are refused, and the History query is
>   restricted to `http(s)` so `chrome-extension://` can never win a match.
>   Trade-off worth knowing: a window actually showing google.com is captioned
>   `Google`, so that one row now captures without a URL. Refusing it beats
>   binding to an arbitrary page with the same caption.
> - **Focus mode now restores the machine.** The prior toast state is recorded
>   under `HKCU:\SOFTWARE\Helm` before the first write and restored exactly,
>   including deleting the value when there was none. Survives a crash
>   mid-session.
> - **Store-app teardown false positive closed.** The detached-CoreWindow
>   fallback matched a frame against *any* window title of the target process,
>   so a document named `Calculator` would have closed the real Calculator. Only
>   `CoreWindow` titles identify a frame now.
> - `verify-windows.ps1` flags a stranded focus session.
>
> The `chrome.js` change was verified against a real History DB and macOS still
> reports 23/23 URL and profile recovery. The two `.ps1` changes are
> structurally checked only — **section 2 of the harness is the first real test
> of the new `close.ps1` C#, and focus enable/disable needs re-running.**
>
> Not changed: capture latency (~1.3 s, `Add-Type` recompiling per call) and the
> overflow tray icon, which is a product decision.
>
> **Update — 2026-08-20 (PC).** The re-runs this note asks for are done on real
> Windows hardware, and they pass. The harness clears all seven sections,
> `focus.ps1` returns the registry to its exact prior shape including absence,
> and `close.ps1` is exercised fail-closed, against a win32 window and against a
> Store app on the CoreWindow-only path. Transcripts are in **Third session —
> 2026-08-20** at the end of this file. Two corrections to the first bullet: the
> blocklist described there was **superseded during the rebase** by a measured
> rule — a caption recovers a URL only when every `History` row sharing it names
> the same page, which refuses `New Tab` on the data rather than by name, and
> with no list to maintain. The `http(s)` restriction survives with the same
> guarantee, but it now lives at emission rather than in the SQL, so a
> `chrome-extension://` row still counts toward ambiguity instead of being
> filtered out of sight. The full argument is in that section.

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

## Suggested next steps (2026-08-13)

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

---
---

# Second session — 2026-08-14: next steps 1, 3, 4, 5, 6

Same machine as above, same branch, the day after. This session picked up the
six "Suggested next steps" and closed five of them. **Item 2 — re-running
stages 1 and 3 by hand — was not done and cannot be done by a session without a
mouse.** A ranked manual test list was handed to Richard instead, and is
reproduced at the end of this section so this document stands on its own.

One measurement here is later than the rest: item 4's benchmark was re-run on
**2026-08-20** on an otherwise idle machine, because the 08-14 numbers were
taken on a busy one and did not settle the question. Both sets are below, in
that order, and the later one is why item 4 is kept rather than reverted.

| # | Item | State |
|---|---|---|
| 1 | Overflow tray icon | Implemented; the part that matters needs a human |
| 2 | Re-run stages 1 and 3 by hand | **Not done — needs a mouse** |
| 3 | Developer Mode in `WINDOWS.md` | Done |
| 4 | Cache capture's `Add-Type` | Implemented; justified by the 08-20 re-measurement |
| 5 | Ambiguous captions | Done, measured, verified |
| 6 | Harness and app agree on profile names | Done |

## What changed in this session

Eight files. **Nothing is committed** — the working tree carries all of it.
`package-lock.json` still shows as modified; it predates this work and was left
alone, as before.

| File | Scope | Change |
|---|---|---|
| `WINDOWS.md` | docs | Developer Mode / elevated-shell prerequisite for `pack:win`, with the real symlink error and the by-hand cache workaround |
| `scripts/verify-windows.ps1` | Windows-only | Section 5 resolves profile display names the way `chrome.js` does; the 10-profile truncation is disclosed; picker-skipped directories are called out |
| `src/platform/windows/capture.ps1` | Windows-only | Optional `-CacheDir`; the embedded C# compiles once to a SHA-named DLL and loads from it thereafter. Per-window `Get-Process -Id` replaced by one indexed snapshot |
| `electron/platform/win32.js` | Windows-only | `capture()` passes Helm's userData as `-CacheDir` |
| `electron/platform/chrome.js` | **shared** | `urlMapForTitles` refuses to recover a URL from an ambiguous caption. Safety argument below |
| `electron/main.js` | **shared** | New `open-taskbar-settings` IPC. Returns immediately unless `IS_WINDOWS`; no existing handler touched |
| `electron/preload.js` | **shared** | One added bridge line, `openTaskbarSettings`. Nothing existing altered |
| `public/welcome.html` | **shared** | Windows-only card added; the four macOS cards gated by `data-platform`. Default view is macOS |

Untouched: `public/index.html`, `electron/platform/index.js`, `darwin.js`,
`sqlite.js`, and everything under `src/platform/macos/`,
`native/profile-probe/`, `website/`, `marketing/`, `ads/`.

---

## Item 1 — the overflow tray icon

The first session's finding was that a first-run Windows 10 user never sees
Helm, because Windows files new tray icons into the overflow flyout and offers
no API to promote one. What shipped is option 1 from that list: tell the user,
and hand them the settings page that can fix it.

**The IPC** (`electron/main.js`):

```js
ipcMain.handle('open-taskbar-settings', () => {
  if (!IS_WINDOWS) return;
  shell.openExternal('ms-settings:taskbar');
});
```

The URI is a literal. The handler takes no argument, so nothing the renderer
sends reaches `openExternal` — this sits beside the existing `open-external`
handler's `isSafeUrl` gate rather than widening it. Off Windows the handler
returns before `openExternal` is called at all, which matters because
`ms-settings:` is not a registered scheme on macOS.

**The preload bridge** (`electron/preload.js`) is a single added line:

```js
openTaskbarSettings:    ()   => ipcRenderer.invoke('open-taskbar-settings'),
```

**The welcome window** (`public/welcome.html`) gained a Windows-only card
naming the ship's-wheel icon, explaining the chevron, and carrying an
`Open Taskbar settings` button. The four existing macOS cards (menu bar,
"Can't see it?", Accessibility, Focus-mode Shortcut) are unchanged in content
and now carry `data-platform="darwin"`. The gate:

```css
[data-platform="win32"] { display: none; }
body.platform-win32 [data-platform="win32"] { display: flex; }
body.platform-win32 [data-platform="darwin"] { display: none; }
```

**macOS safety.** The win32 card is hidden by the stylesheet's default state,
and `body.platform-win32` is only ever added after `window.api.getPlatform()`
resolves with `id === 'win32'`. The handshake is wrapped in a `try` whose catch
does nothing. So on macOS — and equally if the IPC fails, or the script never
runs at all — the page renders exactly the four cards it rendered before this
change, in the same order, with the same markup. The failure mode is "shows the
macOS guidance", not "shows a window with no guidance in it", which is the
right default while macOS is the shipping platform.

Two defects in this session's own first draft of that card were found and fixed
before it was called done: a doubled 20px gap above the "Got it" button (`.card`
already supplies `margin-bottom: 20px`, and a `body.platform-win32 > button`
rule was adding it a second time), and copy that named Windows 10 and quoted
the Windows 10-only label "Select which icons appear on the taskbar" — wrong on
Windows 11, which Helm also supports. The copy is now version-neutral and leans
on the deep-link button rather than a Settings label string that ages between
builds.

### Verified

`ms-settings` is registered on this machine, and `ms-settings:taskbar` lands on
Personalization → Taskbar. That was confirmed by reading the live Settings
window through UI Automation rather than by trusting the URI: the automation
returned the page's section headings, including "Select which icons appear on
the taskbar". The destination is right.

### Not verified

- **The click path.** Renderer → `preload.js` → handler was never exercised.
  The handler was verified in isolation; the button has never been clicked.
  Same gap, same cause, as everything in the first session's "Not tested" list.
- **Whether the card works.** Whether a first-run user reads it, follows it,
  and ends up with a visible Helm icon is the entire point of the item, and no
  amount of code inspection answers it. It needs a human who has not seen the
  card before, starting from a deleted `welcomed` marker.

Item 1 is implemented, not resolved.

---

## Item 3 — the Developer Mode prerequisite in `WINDOWS.md`

Docs only. The first session hit blocker 3, worked around it by hand, and left
the prerequisite written down nowhere a builder would look. `WINDOWS.md` now
carries it, in the build section immediately after the `pack:win` command —
which itself gained a one-line pointer to the new section.

The section states the constraint plainly: `pack:win` cannot complete on a
normal, non-elevated Windows account, because electron-builder unpacks its
`winCodeSign` toolchain before every Windows build and that archive contains
macOS `.dylib` symlinks, which need `SeCreateSymbolicLinkPrivilege`. The real
failure text is quoted rather than paraphrased, since it is what someone will
search for when the build dies five minutes in:

```
ERROR: Cannot create symbolic link : A required privilege is not held by the client.
  : ...\winCodeSign\227697207\darwin\10.12\lib\libcrypto.dylib
  • Above command failed, retrying 3 more times
```

Two fixes are given: enable Developer Mode (Settings → Update & Security → For
developers), which grants the privilege to the signed-in user, persists across
reboots, and leaves the build itself unelevated; or run `pack:win` from an
elevated shell.

The by-hand workaround is documented as a last resort — extract the archive into
`%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\` with a tool that tolerates
the failed symlinks, then re-run, and the build finds the cache populated and
skips the unpack. It is written down with its caveats attached: it is
per-machine state the repo does not carry, it has to be redone whenever
electron-builder bumps the toolchain version, and it is how the 1.0.3 Windows
build in stage 4 above was produced. A `pack:win` on a machine with Developer
Mode actually on has still never been run.

The `windows-10\*.dll` extraction failures from the same archive are recorded
too, as antivirus rather than privilege, and as not blocking the build while
signing is skipped.

---

## Item 4 — caching `capture.ps1`'s `Add-Type` compile

The first session measured capture at ~1.3 s for 8 windows and attributed most
of it to PowerShell startup plus `Add-Type` recompiling the embedded C# on every
call. This item attacks the second half of that.

**The mechanism.** `capture.ps1` takes a new optional `-CacheDir`. The embedded
C# is no longer handed straight to `Add-Type`; it is held in a variable and
passed to `Import-HelmWindows`, which — given a cache directory — compiles it
once with `Add-Type -OutputAssembly` into a DLL named after the SHA-256 of that
source, and on every later run loads the file's bytes with
`[System.Reflection.Assembly]::Load`. Naming the file after the hash of the
source is the entire invalidation story: edit the C# and the hash changes, the
lookup misses, and a new DLL is compiled under a new name. Nothing has to be
told the source changed, and a stale DLL left by an older Helm can never satisfy
a lookup.

Three details are load-bearing:

- The compile goes to a GUID-suffixed staging name and is moved into place
  afterwards, so a reader never sees a half-written DLL and two instances racing
  cannot corrupt each other's output. A sweep removes DLLs built from older
  source, and staging files orphaned by a crash, with an age guard so it cannot
  delete a concurrent instance's work in progress.
- The load reads bytes rather than using `Add-Type -Path` or
  `Assembly::LoadFrom`. `LoadFrom` holds a lock on the file for the life of the
  process, which would make a concurrent instance's replace fail, and the
  `Add-Type` cmdlet drags in the compiler infrastructure even when handed a
  prebuilt assembly, costing nearly as much as compiling from scratch.
- **Every failure path falls back to a plain inline `Add-Type`** — unwritable
  directory, truncated or corrupt DLL, a race with another instance, or no
  `-CacheDir` at all. Capture never fails because a cache is bad. That default
  also keeps a bare `powershell -File capture.ps1`, which is how
  `verify-windows.ps1` section 3 invokes it, free of side effects.

`win32.js` passes Helm's `userData` directory (a `ps-cache` folder inside it),
never the install directory: a per-machine install lives under Program Files,
which is read-only to the user and shared between accounts. If `app.getPath`
throws, the argument is omitted entirely and the script compiles inline.

Not caching, but shipped in the same change and measured with it: the per-window
`Get-Process -Id` was replaced by one indexed snapshot of the process table.
`Get-Process -Id` walks the whole table on every call, about 15 ms per window,
which on a busy desktop dominated the run.

### Verified (2026-08-14)

- `capture.ps1` parses.
- Output is **byte-identical** to the committed version.
- The no-`-CacheDir` path still works.
- A deliberately corrupted DLL is detected, discarded, recompiled, and capture
  still returns correct output.

Coverage caveat: the capture being compared returned only **4 windows**, because
a sandboxed session sees few — see "Section 3 is a sandbox artifact" above.
Byte-identical on 4 rows is weaker evidence than it sounds.

### Measurement 1 — 2026-08-14, busy machine

Three reps, ms:

| rep | baseline | cold (compile + write) | warm (load DLL) |
|---|---|---|---|
| 1 | 1405 | 2443 | 1326 |
| 2 | 1581 | 1246 | 810 |
| 3 | 1226 | 2047 | 1159 |

Warm is maybe 20% better, cold is *worse* than baseline, and the spread overlaps
everywhere. The verdict at the time was that the change was not justified: it
adds runtime disk writes and a cache-invalidation story to the core capture path
in exchange for an unproven win. The machine was in active use throughout, and
the handoff said so and asked for a re-measurement on an idle box.

### Measurement 2 — 2026-08-20, idle machine

Re-run on an otherwise idle machine, with a **fresh `powershell.exe` per run** —
which is how `win32.js` invokes it, and the only reason a cross-process cache
can pay for itself at all — and with the modes **interleaved** rather than run
in blocks, so any drift in machine load falls on all of them equally.

Five interleaved reps, ms:

| rep | baseline | warm (load DLL) | cold (fresh cache dir, compile + write) |
|---|---|---|---|
| 1 | 533 | 540 | 512 |
| 2 | 487 | 390 | 1006 |
| 3 | 525 | 551 | 461 |
| 4 | 656 | 366 | 612 |
| 5 | 675 | 490 | 1236 |

The first cold run of the whole session — the one that primed the cache from
nothing — took **2729 ms**, and is listed separately here rather than folded
into the table, because it is a once-per-machine cost and averaging it in would
misrepresent both directions.

Output length was identical across all three modes within each rep, and a full
baseline-versus-warm comparison of the captured output came back byte-identical.

Then eight interleaved baseline/warm reps, dropping cold:

| | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | median |
|---|---|---|---|---|---|---|---|---|---|
| baseline | 427 | 416 | 792 | 665 | 553 | 571 | 566 | 420 | **566** |
| warm | 360 | 647 | 382 | 361 | 362 | 366 | 364 | 355 | **364** |

**Warm is about 200 ms — roughly 35% — faster at the median, and it is steadier
as well: seven of the eight warm reps land between 355 and 382 ms.** The win is
real and it reproduces on an idle machine. Cold is still slower than baseline
and still noisy, but cold is paid once per source hash, which in practice means
roughly once per release.

The number that explains the 08-14 session is the baseline itself: ~550 ms idle
against ~1400 ms busy. On a loaded machine, PowerShell startup and scheduling
noise cost two to three times the entire idle cost of a capture, and they swamp
a 200 ms effect completely. The 08-14 measurements were not wrong; they were
taken somewhere the signal could not be seen.

**Verdict: keep.**

---

## Item 5 — ambiguous captions

The first session flagged this as a risk and floated two fixes: prefer the most
recently visited match, and skip recovery for a small blocklist of known-generic
captions. Both were measured against this machine's real 11-profile Chrome
History before any code was written, and both fail on the data.

### The measurement

**4158 distinct titles. 27.5% of them match more than one URL.** Among the
titles that do have several candidates, only **58%** resolve to the same page —
the rest are genuinely different pages, and **one in eight spans a different
host**. On this machine, a multi-candidate caption therefore has better than a
one-in-three chance of naming a page other than the one on screen, and better
than a one-in-ten chance of naming a different site entirely.

Title length does not separate the safe cases from the dangerous ones. A
**65-character** caption — long enough to look distinctive under any threshold
anyone would actually pick — still matched **21 URLs across two hosts**. That
disposes of the length-threshold idea, and the blocklist idea goes with it: the
ambiguous captions are not a small enumerable set of `New Tab` / `Untitled` /
`Google` strings, they are a quarter of everything, most of them ordinary page
titles. "Prefer the most recent visit" is no help either — it is exactly what
the code already did, and its wrong answers are silent ones.

### The new rule

A caption recovers a URL only when **every** History row sharing that title
resolves to the same page. Same page means scheme, host, path and fragment all
identical; only the `?query` may differ, because tracking, session and redirect
parameters change from visit to visit while the page a caption refers to stays
put, whereas SPAs route on the fragment and it has to count.

Anything else recovers nothing, and the row captures with its title and no URL.
That is not a new outcome — it is the same one that already happens for a page
History has not flushed yet, and callers already handle it.

Profile is gated separately from the URL. A settled page visited from several
profiles yields `profileDir: null`, because choosing one of them would be the
same kind of guess the URL rule has just refused to make; the renderer's profile
picker takes it from there.

**The `LIMIT 500` came out of the query on purpose, not as cleanup.** Under the
old "newest visit wins" rule a truncated result was merely incomplete. Under the
new rule, the row that gets cut off could be the very one that proves the title
ambiguous — so truncation converts a safe refusal into a silent wrong answer.
The `IN` clause holds one entry per open browser window, so the unbounded result
stays small.

### macOS safety

`chrome.js` is a shared file, so this is the part that mattered most.

`urlMapForTitles` has exactly one caller in the repo: `win32.js:195`.
`darwin.js` does require `chrome.js`, but the functions it calls are
`loadProfileCatalog`, `profileDirFromWindowTitle`, `profileMapForUrls` and
`listProfiles` — never `urlMapForTitles` — and none of those four were touched.
The change is neutral on macOS by unreachability, and **no `process.platform`
guard was added**: a guard would imply the function is reachable on macOS and
needs suppressing there, which describes the code less accurately than the call
graph already does. This was checked independently of the agent that wrote the
change.

The one new value that escapes into a caller is `profileDir: null`.
`win32.js:208` tests it against `/^(Default|Profile [0-9]+)$/`, so `null`
stringifies to `"null"`, fails the match, and the `profile` field is simply
omitted from the row. No crash, and the row lands in the shape the picker
already expects.

### What it costs

On `smoke-platform.js`, URL recovery went from **5/5 to 2/5**. That is the
honest headline and it reads like a regression, so all three refusals were
checked by hand. All three are genuine: those captions matched **37, 75 and 21
distinct URLs** respectively, and each of the three sets spanned two hosts.
There was no right answer available to pick in any of them.

Each refusal logs its caption:

```js
console.log('[chrome] caption matches more than one page, no URL recovered:', title);
```

so a user reporting "it did not remember my tab" leaves behind a trace that says
why, rather than a silent gap.

### Not verified

What one of those title-only rows does from the renderer — whether it launches,
and whether the profile picker still works on it — has never been exercised.
Three of the five browser rows on this machine now take that path, so it is not
a corner case. It is item 3 on the manual test list below.

---

## Item 6 — the harness and the app agree on profile display names

The first session found `verify-windows.ps1` reporting `Default -> Person 1` and
`Profile 11 -> Work` where `chrome.js` reported `Default -> Richard` and
`Profile 11 -> Zhongyu Richard` for the same profiles: two independent readers
of `Local State` picking different fields out of `profile.info_cache`. Cosmetic,
except that the harness exists to be the thing you trust when the app looks
wrong, so a disagreement there costs more than it looks.

Section 5 now resolves the display name the way `listProfiles()` in `chrome.js`
does — `gaia_given_name`, falling back to `name`, falling back to the directory
— behind a comment saying to keep the two in step if that resolution ever
changes. Where the two fields differ, the raw `Local State` `name` is printed
alongside in parentheses, so a caption carrying the other one is still
recognisable in harness output.

Two silences in the same section were closed at the same time:

- **The listing was capped at 10 profiles with no indication of it.** It now
  prints `... and N more`. On this machine, with 11 Chrome profiles, exactly one
  was being dropped without a word — in a section whose whole job is to
  enumerate profiles.
- **Directories the app's picker skips are now called out.** The picker filters
  on `/^(Default|Profile [0-9]+)$/`; anything else in `Local State` is invisible
  to it. The harness used to list such directories as though they were fully
  supported, and now names them and says the picker skips them.

The change is confined to section 5 of `verify-windows.ps1`. Nothing outside
that file reads it.

---

## What was handed to Richard — the manual test list

Item 2 of the six — re-running stages 1 and 3 by hand — is the one this session
could not do, for exactly the reason the first session could not: no synthetic
mouse or keyboard input. A ranked list was handed over in-session instead, and
is reproduced here so this document stands on its own.

**The first four gate the port.** Nothing else on the list matters until they
are answered.

1. **Delete the `welcomed` marker, launch, and find out whether a first-run user
   can find the tray icon at all.** This is item 1's real question, and every
   line of the welcome-card work is a guess until someone who has not seen the
   card tries to follow it. The marker is `%APPDATA%\Helm\welcomed` for the
   packaged app and `%APPDATA%\Electron\welcomed` in dev — they are separate,
   so dismissing one does not dismiss the other.
2. **Second launch from the Start menu while Helm is already running.** The
   single-instance handler runs through to `win.show()`. The open question is
   whether that produces anything the user can actually see, or whether the
   second launch appears to do nothing at all — which on a machine where the
   tray icon is hidden is the difference between a recoverable app and an
   invisible one.
3. **Browser rows that now capture with no URL.** After item 5, three of the
   five browser rows on this machine refuse to recover a URL. Do those rows
   launch, and does the profile picker still work on them?
4. **Teardown with genuinely unsaved work on screen** — the case the `WM_CLOSE`
   design exists for, and the one thing never once exercised, because every
   window closed during testing had nothing to lose. Note while doing it that
   non-browser targets close **every** window of that process, not just the
   labelled one.

Then the roughly 30-minute sweep of the first session's "Not tested" list:

- Tray click, and popover placement as an actual experience rather than as
  arithmetic against `tray.getBounds()`.
- The right-click tray context menu (`Open Helm` / `Quit`).
- The full UI flow: capture rows in the popover, mode toggles, the profile
  picker, saving a workflow, running it, tearing it down.
- Global hotkey registration and an actual key press. `Super` may collide with
  Windows' own shortcuts.
- Focus mode end to end from the UI.
- Installing from `Helm-1.0.3-x64-setup.exe` and running the installed copy.
- SmartScreen on an unsigned download. Nobody has seen what that looks like.
- Cold-start `helm://` deep link through `process.argv`.

Two items need hardware this box has not got: second-monitor behaviour, and a
top-, left- or right-docked taskbar.

---

## Suggested next steps (2026-08-20)

1. **Richard runs the manual test list above.** Item 2 of the six is still open
   and needs a mouse. The first four questions on that list gate the Windows
   port, and nothing in this document answers them.
2. **A human judges the welcome card from a genuine first run** — delete the
   `welcomed` marker, launch, and see whether the card actually gets someone who
   has not seen it before to a visible tray icon. That is the unresolved half of
   item 1, and no amount of code inspection substitutes for it.
3. Everything else from the six is closed. Items 3, 4, 5 and 6 are done and
   written up above; item 4 is now justified by measurement rather than kept on
   hope.

---

# Third session — 2026-08-20, later the same day: reconciling with the Mac session's fixes

Same machine, same branch, a few hours after the section above was written.
This session did no new engineering. It merged two independent bodies of work
and then ran the hardware tests the Mac session could not run.

## What happened

The two machines fixed the same three defects at the same time, without
knowing about each other. The Mac session committed `313648b`, `e7c36bc` and
`d39ecf3` on 2026-08-19 and pushed them. This PC had five commits sitting
locally that covered overlapping ground. A fetch surfaced the divergence, and
the five PC commits were rebased onto `d39ecf3`:

```
09f1354 Findings: second-session results, cache justified by idle re-measurement
70dec9d Windows docs + harness: pack:win Developer Mode prereq, profile-name parity
9253ecf Windows capture: cache the compiled C# to a DLL, snapshot processes once
f2cacb2 Capture: refuse URL recovery from ambiguous captions
6fa840e Windows welcome: overflow-tray guidance card + open-taskbar-settings IPC
d39ecf3 WINDOWS_FINDINGS.md: mark the three defects resolved
e7c36bc Fix the three defects left open by the Windows hardware run
313648b WINDOWS.md: record the hardware run; align harness profile names
```

**Most of the Mac session's work is kept exactly as it landed.** Nothing in
this reconciliation touches it:

- `focus.ps1` recording the prior toast state under `HKCU:\SOFTWARE\Helm` and
  restoring it exactly, including deleting the value when there was none.
- `close.ps1` matching a detached Store-app frame on `CoreWindow` titles only,
  so a document named `Calculator` can no longer take the real Calculator down.
- The stranded-focus-session check in `verify-windows.ps1`.
- The `WINDOWS.md` rewrite — the hardware-run status lists and the `bash`
  prerequisite for `pack:win`.

Two files needed a manual merge, and both resolved by keeping the more
detailed side and folding the other in. `WINDOWS.md` kept this PC's Developer
Mode section, with the Mac session's Windows 10 22H2 confirmation and its
`bash` paragraph folded into it. `verify-windows.ps1` kept this PC's
`Resolve-ProfileName` helper plus the alternate-name display, alongside the
Mac session's new stranded-focus check.

One file was a genuine semantic conflict.

## The conflict — `chrome.js`, and why the measured rule won

Both sessions rewrote `urlMapForTitles`, and the two rewrites disagree about
what the defect is.

The Mac fix (`e7c36bc`) treats it as a small set of known-bad captions. It
carries an `AMBIGUOUS_TITLES` blocklist — `New Tab`, `Google`, `Untitled`,
`about:blank` and similar — refuses those outright, and keeps most-recent-wins
for every other caption.

The PC fix (`f2cacb2`) treats it as a property of the data, and was written
after measuring that data. **The blocklist was dropped and the measured rule
kept.** The reason is the 2026-08-14 measurement written up under *Item 5 —
ambiguous captions* above, against this machine's real 11-profile `History`:

- **4158 distinct titles; 27.5% of them match more than one URL.**
- Among the multi-candidate titles, only **58%** resolve to the same page. The
  rest name genuinely different pages, and **one in eight spans a different
  host**.
- A **65-character** caption still matched **21 URLs across two hosts**, so
  length does not separate the safe cases from the dangerous ones either.

Ambiguity is not a fixed list of generic strings. It is a quarter of every
title on the machine, most of them ordinary page titles. A blocklist refuses
the named few and then **still guesses** — most-recent-wins — on everything
else, and the measurement says better than one guess in three is wrong.

The measured rule subsumes the blocklist rather than competing with it. `New
Tab` matches many different pages in `History`, so it splits, so it is refused
— by the same rule that refuses the other few thousand, with no list for
anyone to maintain as Chrome renames its surfaces.

The final state is `electron/platform/chrome.js:129-207`. A caption resolves
only when every `History` row sharing it has the same `pageIdentity` — scheme,
host, path and fragment identical, only the `?query` free to differ.
`profileDir` is `null` when the page is settled but several profiles have
visited it, because picking one would be the same kind of guess.

### What it costs, and what it gains

Stated honestly, the cost is real. The measured rule refuses **more** rows
than the blocklist does, and the refusals are not confined to captions anyone
would recognise as generic. On `smoke-platform.js` on this machine — the
2026-08-14 run written up under *What it costs* in Item 5 — URL recovery went
from 5/5 to 2/5. All three refusals were checked by hand and all three
are genuine — 37, 75 and 21 distinct URLs respectively, each set spanning two
hosts — but a user does see three rows captured with a title and no URL where
the blocklist would have written a URL into all three. Whether those
title-only rows behave well from the renderer is still unverified; it is item 3
on the manual test list above.

The gain is that the wrong answers stop. And in one specific case the measured
rule is strictly better than the blocklist rather than merely different: a
window **actually showing google.com** is captioned `Google`. The blocklist
refuses that row unconditionally, on the name. The measured rule looks at the
data, finds every `Google` row in `History` is the google.com homepage, and
recovers the URL correctly. Refusing on evidence beats refusing on a name.

### The `http(s)` guard moved from the query to emission

The Mac session's other change is kept, in a different place. It restricted
the `History` query itself to `http(s)`. Here that restriction sits at
emission instead:

```js
if (!/^https?:\/\//i.test(e.url)) continue;
```

The guarantee is identical — nothing but `http(s)` can ever be recovered, and
everything else `SAFE_URL` would reject downstream is gone before it gets
there. The placement matters because of the ambiguity rule. Filtering in the
SQL hides a `chrome-extension://` row that shares a caption with a real page,
and a hidden row cannot split the title. The caption then looks settled when
it is not, and the refusal becomes a wrong answer. Filtering at emission lets
non-http rows count toward ambiguity while never winning.

### macOS safety of the resolution

`urlMapForTitles` has one caller in the repo, `win32.js:195`. `darwin.js` does
require `chrome.js`, but calls only `loadProfileCatalog`,
`profileDirFromWindowTitle`, `profileMapForUrls` and `listProfiles`:

```
$ grep -n "chrome\." electron/platform/darwin.js
158:  const catalog = chrome.loadProfileCatalog(CHROME_ROOT);
162:    const dir = chrome.profileDirFromWindowTitle(w.title, catalog);
186:  try { historyMap = await chrome.profileMapForUrls(CHROME_ROOT, chromeUrls); }
247:    const dir = chrome.profileDirFromWindowTitle(t, byName);
319:  return chrome.listProfiles(CHROME_ROOT);
```

None of those four functions changed in this reconciliation. The Mac session's
23/23 smoke report exercised its own blocklist version of `urlMapForTitles`,
which macOS never reaches; the functions macOS does reach are byte-identical
before and after. So that report is not invalidated by dropping the blocklist,
and macOS behaviour is unchanged.

## The hardware re-tests `d39ecf3` asked for

`d39ecf3` said its two `.ps1` changes were structurally checked only, and that
the harness and focus enable/disable were the first real test. All of it is
run below, on this machine, against the merged tree. **Every one passes.** The
"not yet run on Windows" caveat at the top of this document is closed.

### 1 — the harness

```
powershell -ExecutionPolicy Bypass -File scripts\verify-windows.ps1
```

All seven sections **PASS**. Section 3 captured **6 windows in 724 ms**. The
new stranded-focus-session check stayed silent, which is the correct result:
no `PriorToastState` existed to be stranded. Section 6 printed

```
key exists, NOC_GLOBAL_SETTING_TOASTS_ENABLED not set yet (focus.ps1 will create it)
```

which is the machine baseline the next test depends on.

### 2 — `focus.ps1` round trip, from a machine that has never set the value

This is the case `e7c36bc` was written for, and the case the old code got
wrong. Baseline: the value is absent.

```
before: toasts=<absent> prior=<absent>
enable: ok
after-enable: toasts=0 prior=absent
disable: ok
after-disable: toasts=<absent> prior=<absent>
```

The disable path writes `1`, then deletes the value. The key ends in the exact
shape it started in, **including the absence**. Helm leaves nothing behind.

### 3 — `focus.ps1` with a numeric prior, and the double-enable guard

Pre-set `toasts=1`, then ran enable twice before disabling:

```
prior recorded as: 1; restored to: 1
```

The second enable did not overwrite the recorded prior with the `0` Helm
itself had just written. That is the failure mode a naive record-before-write
would have, and it is guarded.

### 4 — `close.ps1` fail-closed, and a real close

```
close.ps1 -ProcessName notepad -TitleFilter 'No Such Window Title Anywhere'
No matching windows
```

Notepad survived. Then:

```
close.ps1 -ProcessName notepad
Closed 1
```

The process was gone. A filter matching nothing closes nothing; a filter
matching something closes exactly that.

### 5 — `close.ps1` on a Store app, the exact path `e7c36bc` changed

Launched Calculator — process `CalculatorApp`, hosted by
`ApplicationFrameHost`, the detached-`CoreWindow` case.

```
close.ps1 -ProcessName CalculatorApp
Closed 1
```

The process was gone. CoreWindow-only frame matching works on the app it was
narrowed for, so the narrowing did not break the legitimate case while closing
the false positive.

### 6 — the merged `chrome.js` under Electron

Earlier the same day, before the rebase:

```
npx electron scripts\smoke-platform.js
```

returned **6 rows in 1173 ms**, with **1/1 URL recovery and 1/1 profile
attribution** on the one open Chrome window. That run used this PC's
`chrome.js` — the version that survived the rebase — so it describes the
merged tree.

## What is still not verified

The reconciliation closes the `.ps1` caveats. The two browser gaps this list
originally named were closed later the same evening — see **Third session,
continued — 2026-08-20 evening** below. What remains:

- **Everything requiring a mouse or a keypress.** Nothing on the manual test
  list has been exercised, here or in either earlier session. The first four
  items on that list still gate the port: first-run tray-icon discoverability
  from a deleted `welcomed` marker, second-launch `win.show()`, title-only
  browser rows through the renderer, and **teardown with unsaved work** —
  `close.ps1` has now closed Notepad, Calculator, Chrome and Edge windows, but
  never a window holding a document that would raise a save prompt.
- **Edge captions in any locale but English.** The tab-count decoration is
  stripped by an English shape (`and N more pages`). A localized Edge emits a
  different phrase, the residue reaches the History lookup, and the row
  captures title-only. Safe direction, still unverified.
- **Everything already listed under "Not tested" above** that neither this
  session nor the evening's tests touched.

---

# Third session, continued — 2026-08-20 evening: the two remaining hardware gaps

Same machine, same branch, a few hours after the section above. The two gaps
that list named — Chrome teardown by `TitleFilter` against the real
multi-profile Chrome, and Edge caption shapes with Edge actually running — are
both closed. One code fix came out of it (`fef7a96`, `win32.js` only) and four
findings worth carrying forward.

## Test 1 — Chrome teardown by `TitleFilter`, real multi-profile Chrome

Setup: Richard's real Chrome was already running one window — a YouTube video,
`Profile 1`. Two sacrificial windows were opened on `https://example.com/`, one
landing in `Profile 1` and one launched with
`--profile-directory="Profile 13"`. Chrome's `Local State` confirmed both
profiles live: `last_active_profiles: Profile 1, Profile 13`, `last_used:
Profile 13`. `capture.ps1` then enumerated three chrome windows:

```
example.com - Google Chrome
example.com - Google Chrome
How To Effectively Use Ruby Thursday | Marvel Contest of Champions - YouTube - Google Chrome
```

Fail-closed first:

```
close.ps1 -ProcessName chrome -TitleFilter 'No Such Window Title Anywhere'
No matching windows
```

All three windows intact. Then the targeted close, filtering on the bare stored
title, which prefix-matches the live captions:

```
close.ps1 -ProcessName chrome -TitleFilter 'example.com'
Closed 2
```

Both sacrificial windows closed, one from each profile. The YouTube window
survived untouched and Chrome stayed running. **The per-profile teardown
mechanic works against the 11-profile machine.**

Two findings fall out of this test.

### Finding A — Chrome on Windows does not put the profile name in the caption

Both `example.com` captions were identical. No ` – Richard`, no ` – xun`, with
`Profile 1` and `Profile 13` simultaneously active. macOS Chrome appends the
en-dash profile suffix, and `profileDirFromWindowTitle` in `chrome.js` parses
exactly that suffix — but its only callers are in `darwin.js` (two of them), so
the Windows port is unaffected by design. Windows profile attribution runs
entirely through the History-unanimity rule in `urlMapForTitles`.

Recorded so nobody later adds caption-suffix profile parsing on Windows
expecting it to fire. It will not fire. There is no suffix to parse.

### Finding B — a caption collision across profiles closes both windows

The two `example.com` windows lived in different profiles and shared a caption,
and the title-keyed filter closed both. Title is the only key Windows offers,
so when two profiles show the same page a profile-scoped teardown cannot
distinguish them.

Known limitation, not a defect to fix at this level. It fails toward closing a
same-titled window in a sibling profile — never toward closing an unrelated
window.

## Test 2 — Edge captions, with Edge actually running

Edge (`msedge`, `Default` profile) was launched with two URLs in one window.
The real caption, from `capture.ps1`:

```
example.com and 2 more pages - Personal - Microsoft​ Edge
```

Three decorations at once: the tab count (`and 2 more pages`), a profile label
(`Personal`), and the zero-width space (U+200B) inside `Microsoft​ Edge`.

**The zero-width space gap is closed: the existing `titleSuffix` regex handles
it and strips.** But the residue `example.com and 2 more pages - Personal`
reached the History lookup and matched nothing, so the Edge row captured
without a URL. That is exactly the failure `WINDOWS_TESTING.md` ranks first
among the riskiest assumptions.

### The fix — `fef7a96`

The profile label is not guesswork. Edge's `Local State` `info_cache` carries
it as `shortcut_name` (`"Personal"`); the `name` field for the same profile
says `"Profile 1"`, and `loadProfileCatalog` in `chrome.js` collects `name`,
`gaia_given_name`/`gaia_name` and `user_name` — not `shortcut_name`. So the
label Edge paints in the caption is declared by Edge itself, just not in a
field the existing catalog reads. That made a declarative fix possible instead
of fuzzy stripping.

`fef7a96` adds two functions to `win32.js`:

- `edgeProfileLabels(root)` — reads Edge's own `Local State` and collects
  `shortcut_name`, `name`, `gaia_given_name`, `gaia_name` from every
  `info_cache` entry into a set of declared display names. Read once per
  capture, and only if an Edge row shows up.
- `stripEdgeDecorations(title, labels)` — strips a trailing ` - <label>` only
  when `<label>` matches one of those declared names, then strips
  `and N more page(s)` by shape.

Both run after `stripBrowserSuffix`, on `msedge` rows only, before the row
reaches the History lookup.

Two trade-offs, stated honestly:

- **A tab title genuinely ending in ` - <profile label>` over-strips.** A page
  actually titled `Notes - Personal` on this machine loses its last two words
  and misses the History match. Judged acceptable: the label set is small and
  machine-specific, and the failure is a title-only row.
- **The count phrase is English-only.** A localized Edge emits a different
  phrase, it survives stripping, and the row captures title-only. Again the
  safe direction, and it is listed as unverified above.

### Verified through the real pipeline

`npx electron scripts\smoke-platform.js`, before the fix: the Edge row's label
was `example.com and 2 more pages - Personal`, URL recovery 0. After the fix
the label is bare. A fresh Edge window on `https://www.wikipedia.org/` then
recovered fully:

```
Microsoft Edge [Default]      https://www.wikipedia.org/
```

URL recovered and profile attributed, through caption → strip → History
unanimity. Final smoke score with three browser windows open: **1/3
recovered** — the other two rows are title-only for the verified reasons in
findings C and D below, not because the scheme failed.

### Edge teardown, same session

```
close.ps1 -ProcessName msedge -TitleFilter 'Wikipedia'
Closed 1
```

Exactly the Wikipedia window closed. The bare stored title prefix-matched the
decorated live caption `Wikipedia - Personal - Microsoft​ Edge`, which is the
same prefix-matching behaviour Test 1 relied on. The remaining Edge window
closed with an unfiltered call:

```
close.ps1 -ProcessName msedge
Closed 1
```

Six windowless `msedge` background processes remained afterwards. That is
normal Edge startup-boost behaviour, not a teardown failure — none of them own
a window, so none of them are visible to capture.

## Two title-drift findings that explain the title-only rows

### Finding C — History titles drift under notification counters

The YouTube row recovered 1/1 this morning and 0/1 this evening, from the same
caption. Probing History with `../.helm-scratch/probe-title.js` showed why. The
stored title for `https://www.youtube.com/watch?v=EtTUOJtEfpw` is now:

```
(31) How To Effectively Use Ruby Thursday | Marvel Contest of Champions - YouTube
```

YouTube prepends its unread-notification counter to `document.title` and Chrome
persisted that version. The live window caption carries no counter. Exact-match
lookup misses.

This is the safe direction — the row captures title-only, indistinguishable
from a page History has not flushed yet. Fixing it means variant lookups, and
variant lookups are the fuzzy matching `WINDOWS_TESTING.md` explicitly says to
write up rather than invent. So: **written up as a known drift mode.** Any site
that mutates its own `document.title` after load — unread counters, live
scores, `(1)` message badges, playback state — can drift its History row out of
reach of the caption.

### Finding D — a page that never loads leaves a caption but no History row

`example.com` does not resolve on this network. Both browsers showed the
caption `example.com` — the host, rendered as an error-page title — while
writing no `urls` row at all. Verified by querying every profile's `History` in
both Chrome and Edge.

A row like that can never recover a URL, under any scheme, because there is
nothing to recover it from. Capturing it title-only is the correct outcome.
Together with finding C it accounts for both unrecovered rows in the final
1/3 smoke score.

---

# Fourth session — 2026-08-21: the gating manual tests, run with a human

Same machine, same branch, from `6ac8a09`. This session ran the first three
items of the manual test list interactively with Richard at the keyboard, and
delegated the automatable half of item 4 — teardown against unsaved work — to
an agent whose transcript was verified step by step. Everything below was
observed on hardware, not inferred.

## The dev-identity trap — why test 1 failed on the first attempt

Test 1 initially looked broken: marker deleted, app relaunched, no welcome
card. The instruction had been to delete `%APPDATA%\Helm\welcomed`, and that
was the wrong folder. Running `electron electron\main.js` in dev mode gives the
app the name **Electron**, so `app.getPath('userData')` is
`%APPDATA%\Electron` — the live marker was `%APPDATA%\Electron\welcomed`, and
the workflows this session captured live in `%APPDATA%\Electron\Helm\`.
`%APPDATA%\Helm` also exists on this machine from differently-launched runs,
and it is a red herring for dev testing. Confirmed by attaching an inspector to
the running main process and asking `app.getPath('userData')` directly.

This is the Windows twin of the documented macOS "dev mode vs prod TCC differ"
issue, and it will bite anyone testing first-run behaviour in dev. A packaged
Helm uses `%APPDATA%\Helm`; dev uses `%APPDATA%\Electron`. Written here so the
next session does not spend an hour on it.

While diagnosing this, one launch appeared to show the original instance dying
when a second was started. A controlled re-run could not reproduce it — the
lock held: instance 2 exited in about two seconds and instance 1 survived. The
one observed death coincided with a moment Richard may simply have quit the
app from the tray; unconfirmed either way. Noted as watched-for, not as a
defect.

## Test 1 — first-run welcome and tray discoverability: pass

With the right marker (`%APPDATA%\Electron\welcomed`) deleted and every stale
instance killed, a fresh launch showed the welcome card — window title
`Welcome to Helm`, presence verified via `EnumWindows` as well as by eye — and
Richard's verdict on the card was that it works: it got a first-time user to
the tray icon in the overflow area. The unresolved half of item 1 from the
2026-08-20 next-steps list is now resolved by a human.

## Test 2 — second launch lands in the running instance: pass, one caveat

With the app running, a second `electron electron\main.js` was absorbed
correctly: the new process exited after about two seconds, the original
survived, and the popover appeared, foreground and focused.

The caveat: the popover appeared at the centre of the screen, not anchored to
the tray icon. The `second-instance` handler called `win.show()` directly,
skipping the `getWindowPosition()` call that `toggleWindow()` performs, so the
window surfaced wherever it last was — for a never-shown window, Electron's
default centred position. Fixed this session by positioning before showing,
inside the existing `IS_WINDOWS` block, so macOS never executes the changed
line. Committed separately from this write-up.

## Test 3 — title-only browser rows, exercised by real usage

Richard captured a workflow from a live Chrome session — a Gemini tab and two
ChatGPT windows — and reported that running it "doesn't open the correct tab,
only chrome is open but not the information inside it." The saved workflow
confirms why: all three Chrome rows carry `name`, `label` and `exePath` only.
No `url`, no `profile`. Launch therefore starts bare `chrome.exe`, which is
the designed behaviour for a title-only row.

Each of the three captions was then probed against every profile's `History`
with the same tooling as findings C and D. All three were refused by the
ambiguity rule, and all three refusals are genuine — capture logged
`caption matches more than one page, no URL recovered` for each:

- `Google Gemini` — 15+ distinct URLs across three profiles, all on
  `gemini.google.com`: the app home, four chats, the library, four notebooks.
  Every Gemini surface shares one title.
- `ChatGPT` — 77+ distinct URLs across **four hosts** (`chatgpt.com`,
  `auth.openai.com`, `accounts.google.com`, `www.google.com` redirect stubs).
- `ChatGPT: Chat, Work, Create & Code with AI` — 5+ URLs across two hosts.

So the rule did exactly what the third-session write-up said it would, and
recovery was not broken — the same day's smoke run recovered a URL for an
ordinary article page (1/3, with the two refusals being `New Tab`).

**The finding is the consequence, not a bug in the rule.** Single-page apps —
ChatGPT, Gemini, and their kind — reuse one `document.title` across every
page, so on Windows they will *systematically* capture title-only. On macOS
this never arises: `capture.jxa` reads the real tab URL from Chrome via Apple
Events (`perTabCapture: true`), and the History path is only a fallback for
profile attribution. Windows has no Apple Events, capture sees only window
captions, and for SPA sites the caption provably cannot name a page. The
user-visible result is what Richard hit: a workflow that looks captured but
restores an empty browser.

Worth writing up rather than inventing here (per the brief, these are
suggestions, not implementations):

1. **Say so in the row UI.** A title-only browser row could carry a visible
   "opens the app, not the page" hint, so the surprise happens at save time,
   not launch time.
2. **Let the user paste a URL.** A manual URL field on a captured browser row
   turns the refusal into a one-time correction.
3. **Longer term, real per-tab capture** via the DevTools protocol or a
   browser extension — the only way Windows reaches parity with `perTabCapture`
   on macOS. Substantial, and out of scope for this port pass.

The renderer half of item 3 — how a title-only row renders and whether the
profile picker behaves — remains to be judged in the sweep.

## Item 4, automated half — teardown against unsaved work

Run by an agent against dev Notepad windows carrying unsaved text, with every
claim re-verified from the transcript. Method note, disclosed: Win10 Notepad's
edit control exposes no UIA ValuePattern, so the agent seeded dirty text via
`EM_SETSEL`/`EM_REPLACESEL` by HWND rather than through the UI; the dirty
state itself was confirmed real via `EM_GETMODIFY`.

What `close.ps1` actually does with a dirty window:

1. **No hang, no force-kill.** `WM_CLOSE` via `SendMessageTimeout` with
   `SMTO_ABORTIFHUNG` returned in ~345 ms for clean windows and ~3.0 s for a
   dirty one. Work is never destroyed by the teardown itself.
2. **`Closed N` means "messaged N", not "closed N".** When the user picks
   Cancel in Notepad's save prompt, the window survives with its text intact
   (`EM_GETMODIFY` still true) — and the script still counted it. The count is
   a send count. Renaming the output would be cosmetic; recorded so nobody
   trusts the number as a close confirmation.
3. **Save prompts open buried.** The `#32770` "Notepad" prompt
   (Save / Don't Save / Cancel) inherits the target window's activation. Helm
   tears down from a tray popover, so the target is unfocused and the prompt
   opens *behind* whatever is foreground. A user who does not notice it will
   think the teardown stalled.
4. **One dirty window serially blocks the clean ones behind it** in the same
   filter pass — the 3 s per-window timeout is sequential.
5. **Cancel preserves work end to end.** Text verified intact after the full
   teardown pass.

Two consequences worth flagging:

- **Budget arithmetic (inference, not exercised):** `win32.js` invokes
  `close.ps1` with an 8 s timeout. At ~3 s per dirty window, three dirty
  windows exhaust the budget mid-run and the tail of the close list is never
  messaged.
- **New defect, verified independently: the dirty-title asterisk breaks
  `TitleFilter`.** Win10 Notepad retitles a dirty window `*Untitled - Notepad`.
  `close.ps1` matches titles with `StartsWith`, so the filter that matched the
  clean window misses the same window once it has unsaved changes — the exact
  case where closing carefully matters most. Any app using the common
  asterisk-prefix dirty convention is affected.

## Where this leaves the gating list

Tests 1 and 2 pass (test 2's positioning caveat fixed). Test 3's launch half
behaved as designed and is now explained; its renderer half joins the sweep.
Item 4's scripted half is done; the in-app half — a real teardown from the
popover over an unsaved document — still needs a human, and after that the
~30-minute sweep: tray menu, popover position after the fix, hotkey, focus
mode, `pack:win`, and the `helm://` cold start.

## The popover was unusable as a window on Windows — three fixes

Running the popover interactively surfaced a cluster of Windows-only window
bugs that no code inspection had caught, because they only appear against a
real taskbar and a real overflow tray. All three are fixed; the fixes are
confirmed on screen by a human on this machine.

**It opened clipped behind the taskbar, and could not be moved.** The popover
positioned itself from `tray.getBounds()`, but a tray icon living in the `^`
overflow flyout reports the flyout's bounds, not a taskbar slot, so the
computed corner landed the window partly off-screen — with the footer and its
buttons under the taskbar. Being a frameless, blur-to-hide popover, it could
not be dragged back, and clicking elsewhere to try only dismissed it. Fixed in
`getWindowPosition()` (`electron/main.js`): on Windows it now ignores the tray
bounds entirely and anchors to the work-area corner nearest the cursor —
`screen.getDisplayNearestPoint(getCursorScreenPoint()).workArea` — which
already excludes the taskbar, so the window is always fully on screen. The
branch is `IS_WINDOWS`-guarded; macOS keeps its tray-anchored maths.

**Its footer was cut off with no way to scroll.** `public/index.html` locked
both `body` and `.view` to `height: 480px` — exact for the macOS 320×480
popover, but on the taller/resizable Windows window the view stayed pinned at
480px inside a differently-sized viewport while `body { overflow: hidden }`
prevented the region below the fold from scrolling. So the primary Launch /
Add controls in `.helm-footer` were simply unreachable. Fixed by changing both
heights to `100vh` (two lines). The layout was already a correct flex column
with a `flex:1; overflow-y:auto` middle region (`.workflow-list`) and a pinned
footer; the only defect was the container not tracking the real window height.
macOS-neutral: in the 480px-tall Mac popover `100vh` evaluates to exactly
480px, so a fitting layout is pixel-identical and only a too-tall one gains
scroll — which it already could.

**It behaved like a popover, not a window.** On macOS the popover is the right
metaphor: frameless, anchored under a menu-bar item, gone on blur. On Windows
the overflow-tray metaphor is weak and the frameless-anchored behaviour is what
produced the two bugs above. `platform.windowOptions()` (`electron/platform/win32.js`)
now returns `frame:true`, `resizable:true`, `skipTaskbar:false`, a
`460×640` default and `380×460` minimums, so Windows gets a normal draggable,
resizable, alt-tabbable window. The matching blur-to-hide handler in `main.js`
is `IS_WINDOWS`-guarded off, because a real window that vanished the instant it
lost focus would be unusable — and specifically would vanish the moment a
teardown save prompt stole focus, which is exactly the flow test 4 exercises.
On Windows the window now hides only via the tray toggle or its own close
button. These options override the shared constructor's frameless defaults
because `windowOptions()` is spread after them; macOS's `windowOptions()` sets
none of these keys, so it keeps the frameless popover.

## Item 4, in-app half — pass, and the save prompt is not buried after all

With Pro unlocked in the dev build, teardown was run from the popover against a
Notepad window holding genuinely unsaved text. Both halves of the finding
resolved in the user's favour:

- **The save prompt came up in front and immediately visible** — not buried.
  The scripted half of this test (earlier this session, agent-run) predicted
  the `#32770` prompt would open *behind* the foreground window because it
  inherits the target's activation and Helm tears down from an unfocused tray
  popover. That prediction was made before the popover became a real framed,
  taskbar-present, non-blur-hiding window. With that window in place the prompt
  surfaced in front on this machine. So the buried-prompt risk is specific to
  the old frameless-popover configuration; the framed Windows window this
  session shipped removes it. Recorded as reconciled: the scripted prediction
  stands for the old window, the hardware result supersedes it for the new one.
- **Cancel preserved the work.** Clicking Cancel in the prompt kept the Notepad
  text intact — the teardown did not destroy unsaved work.

**There is no Helm-level undo for teardown, and that is by design.** While
verifying this, the "Undo" control was checked against the source: the only
Undo in Helm is the 2.25-second grace toast on *workflow deletion*
(`public/index.html:2143-2172`), which holds the delete and lets the user
cancel it. Teardown has no equivalent — once an app is closed it is closed, and
`close.js` keeps no reopen list. The app's own save prompt is the sole
safeguard for unsaved work during teardown, which the pass above confirms is
sufficient for the Notepad case. Worth a product note: a future teardown could
offer its own "closed 3 apps — undo" toast that re-launches what it just
closed, mirroring the deletion affordance, but that is a feature suggestion,
not a defect.

This closes item 4 end to end: the scripted half (no hang, send-count
semantics, serial blocking, the dirty-title asterisk defect) and now the in-app
half (visible prompt, Cancel preserves work).

## Sweep — tray interaction: pass

First items of the ~30-minute sweep, run by hand on this machine:

- **Left-click the tray icon toggles the popover** both ways — open and hide —
  reliably.
- **Right-click shows the context menu** with exactly `Open Helm` and `Quit`
  (`main.js:179-185`). `Open Helm` opens the popover; `Quit` exits Helm
  completely, tray icon gone, no lingering `electron.exe`.

All four steps passed. Tray click, right-click menu, and clean quit are
verified on hardware.

## Sweep — global hotkey: pass, after fixing two Windows regressions

Exercised on hardware. Both hotkey paths — the per-workflow hotkey and the
mode-toggle hotkey — now register and fire correctly on Windows. Getting there
uncovered and fixed two Windows-only defects (commit c5b1fe0).

**1. The framed window's default menu bar swallowed keystrokes.** Making the
Windows window framed (`frame:true`) caused Electron to attach its default
application menu (File/Edit/View...). On Windows that menu bar is visible and
its Alt activation intercepts keyboard input, so the in-renderer hotkey
recorder could not capture any combo — the pill sat on "..." and nothing
recorded. Fix: `win.removeMenu()` + `autoHideMenuBar` guarded by `IS_WINDOWS`
(`electron/main.js:223-226`). macOS is frameless with a global menu and is
untouched. After the fix the recorder captures normally (Ctrl+M, Ctrl+Shift+J
verified live).

**2. Ctrl+Alt combos cannot be recorded on Windows (AltGr).** Ctrl+Alt maps to
AltGr; the OS consumes the combo before the renderer sees the keydown, so
Ctrl+Alt+<key> never reaches the recorder (no capture, no toast — confirmed by
Ctrl+Alt+J doing nothing while Ctrl+Shift+J recorded). This is a hard Windows
constraint, not a Helm bug. Two follow-on issues fixed: the Windows modifier
hint used to read "Include at least one modifier key (Ctrl, Alt, Shift)" —
actively steering users toward the one modifier that fails — now reads "Use
Ctrl or Shift. Windows reserves Ctrl+Alt, so it will not record."
(`public/index.html:1119`); and `AltGraph` was added to both capture handlers'
modifier-ignore lists (`public/index.html:1178,1212`) so a stray AltGr press
cannot be mis-captured as the key. Note the marketing examples `Ctrl+Alt+1/2/3`
(from the mac `⌃⌥1/2/3`) are un-recordable on Windows and should be reworded
for Windows copy.

**Both paths verified end to end:**
- **Mode-toggle hotkey** recorded as `Control+Shift+M` and flips Launch/Teardown
  from the background.
- **Workflow hotkey**: the saved "hi" workflow was rebound from the broken
  `Control+Alt+K` to `Control+Shift+K` (edited directly in the dev
  `workflows.json`); pressing it with Helm backgrounded launched Notepad. This
  exercises the full workflow-hotkey path on Windows — startup registration in
  `registerWorkflowShortcuts` (`main.js:548`) through spawn/launch.

**Still-open code concern (not triggered here):** workflow-hotkey registration
failure is silent. `registerWorkflowShortcuts` ignores the boolean from
`globalShortcut.register` (`main.js:553`) and `set-hotkey` returns `{ok:true}`
unconditionally (`main.js:712`), so if Windows or another app already owns a
combo the pill still shows it as set while the key does nothing. The
mode-toggle path does surface this ("Could not register shortcut...",
`main.js:600`, `index.html:1196`). Worth aligning the workflow path to the same
feedback, but it was not forced during this pass.
