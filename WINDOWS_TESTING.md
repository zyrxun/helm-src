# Brief: verifying the Helm Windows port on real hardware

You are running on Richard's Windows PC. This document is your task.

Read `CLAUDE.md` first for what Helm is and its conventions, then `WINDOWS.md`
for how the port is built and why. This file covers only what those two cannot:
what has and has not been tested, and what you are here to do.

---

## The situation

The Windows port was written entirely on a Mac. Every line of it — three
PowerShell scripts, a Win32 P/Invoke capture layer, a platform abstraction, an
ICO tray icon — was written without ever executing on Windows. As of this
writing exactly one thing has been proven on real hardware: `npm install` failed
because node-gyp went looking for Visual Studio, and that is now fixed
(`fcbce0e`).

**You are on the only Windows machine this project has.** Everything in the
"Unverified" list at the bottom of `WINDOWS.md` is unverified because nobody
could run it, not because it was skipped.

---

## The constraint that matters most

**macOS is the shipping revenue path. You cannot test it. Do not change it.**

Helm sells today, on macOS, to paying users. The Windows port was deliberately
built as a refactor rather than a fork, which means some files are now shared
between both platforms — and a change you make to fix Windows can break macOS
silently, where you will not see it and neither will the next test run.

This has already happened once. During the refactor, a shared SQLite helper
started returning `null` for every query that touched Chrome's
`last_visit_time` column, because the value exceeds `Number.MAX_SAFE_INTEGER`
and `node:sqlite` throws rather than truncating. It looked like a Windows bug.
It silently disabled Chrome profile detection on macOS too. It was caught by
luck.

So:

| Files | Rule |
|---|---|
| `src/platform/windows/*.ps1`, `electron/platform/win32.js`, `scripts/verify-windows.ps1`, `WINDOWS.md` | Windows-only. Edit freely. |
| `electron/platform/chrome.js`, `electron/platform/sqlite.js`, `electron/platform/index.js`, `electron/main.js`, `public/index.html`, `electron/preload.js` | **Shared.** You may edit, but every change must be behind a platform check or provably neutral on macOS. Call out each one explicitly in your findings. |
| `electron/platform/darwin.js`, `src/platform/macos/*`, `native/profile-probe/*.mm` | Do not touch. If one of these looks wrong, write it down instead. |
| `website/`, `marketing/`, `ads/`, `public/brand/brand.md` | Unrelated to this task. Leave alone. |

Do not push to `master`. Pushing `master` triggers a live Cloudflare Pages
deploy of get-helm.app. Work on `windows-port` or a branch off it.

---

## Setup

```
git checkout windows-port
git pull
npm install
```

`npm install` should now complete without Visual Studio. If it still tries to
compile `profile-probe`, delete `node_modules` and retry — npm caches whether a
package has an install script.

---

## Run these in order

Order matters. Each stage fails cheaper than the one after it.

### 1. `powershell -ExecutionPolicy Bypass -File scripts\verify-windows.ps1`

Standalone, no dependencies, read-only. Never closes a window, never writes the
DND registry value. Seven sections: PowerShell parse, embedded C# compile via
`Add-Type`, live capture, browser title matching, Chromium profile catalog, DND
registry read, environment.

Section 4 is the important one. See "Riskiest assumptions" below.

### 2. `npx electron scripts\smoke-platform.js`

Runs the real backend under Electron — the same code the app uses, not a
reimplementation. Read-only. The last three lines are the score: how many
browser rows recovered a URL and got a profile attributed.

For reference, on macOS this prints `browser rows 17`, `recovered a URL 17/17`,
`attributed a profile 15/17`. Windows will be lower by design — it can only see
the foreground tab of each window — but a `0/N` on URL recovery means the
title→History matching scheme is broken, which is a design problem, not a bug.

### 3. `npm run menu-bar:win`

The actual app. Work through, roughly in this order:

- Tray icon appears and is legible on the taskbar. Right-click menu works.
- Popover opens, positioned correctly relative to the taskbar. Test with the
  taskbar bottom-docked and top-docked, and on a second monitor if there is one.
- Capture state — do the rows match what is actually open? Are shell surfaces
  (Start menu, search, widgets) filtered out?
- Save a workflow, close the apps manually, run the workflow. Do the right apps
  open, with the right URLs, in the right Chrome profile?
- Teardown. **Test this with nothing unsaved open.** It sends `WM_CLOSE`, which
  is what the title-bar X sends, so apps will prompt to save — that is intended,
  but do not risk real work on the first run.
- Global hotkey registers and fires. `Super` replaces `Command` on Windows and
  may collide with a reserved shortcut.
- Focus mode toggles the toast setting, and Windows actually honours it without
  a sign-out.

This PC is **Windows 10** (10.0.19045). `backgroundMaterial: 'acrylic'` is
Windows 11 only, so the popover will render as solid Abyss. That is the intended
fallback, not a bug — but it means the acrylic path stays untested.

### 4. Stretch: `npm run pack:win`

Produces an NSIS installer and a portable exe. Unsigned, so SmartScreen will
show "Windows protected your PC" — click through via *More info → Run anyway*.
Signing is a known unsolved problem, documented in `WINDOWS.md`.

---

## Riskiest assumptions, in order

Spend your attention here.

1. **Chrome's window title matches its History `title` column exactly.** The
   entire URL-recovery scheme rests on this. Windows offers no equivalent of
   Apple Events, so a window title is the only primary key available — Helm
   strips the browser suffix off the caption and looks the remainder up in the
   profile History databases. If Chrome truncates long titles in the caption, or
   decorates them, or Edge appends profile names and "and N more pages" in a
   shape the regex does not handle, this returns nothing and every browser row
   captures with no URL. Section 4 of the verify script prints raw caption and
   stripped result side by side so you can judge it directly. A regex fix is
   cheap. If captions strip cleanly but still find no History match, that is a
   design change — stop and write it up rather than inventing fuzzy matching.

2. **`SKIP_PROCESSES` / `SKIP_TITLES` in `win32.js` actually suppress the shell
   surfaces.** That list was written from knowledge of Windows internals, not
   from reading a real capture. Expect to add entries. Section 3 of the verify
   script flags candidates.

3. **UWP unwrapping.** Store apps are hosted by `ApplicationFrameHost.exe`;
   capture walks child windows to find the real process. Untested against a real
   UWP app — try Calculator, Settings, or Store Spotify.

4. **Teardown closes the intended window and only that window.** `close.ps1`
   matches titles with `StartsWith` rather than `-like`, because window titles
   legitimately contain `*`, `?` and `[ ]`. A filter that matches nothing must
   close nothing — Chrome runs every profile under one process, so a
   close-everything fallback would tear down the user's other profiles. Verify
   it fails closed.

5. **Cold-start deep links.** A `helm://` link that starts the app arrives in
   `process.argv`, not through `second-instance`. Both paths need testing.

---

## Reporting back

Write findings to `WINDOWS_FINDINGS.md` at the repo root, commit, and push to
`windows-port`. That file is how this reaches the Mac instance, so it needs to
stand on its own — assume the reader has no access to your terminal and cannot
reproduce anything you saw.

Include, per item tested: what you ran, what happened, and whether you changed
anything to make it work. Paste real output for anything that failed —
paraphrased errors are much less useful than the actual text. Explicitly list
every shared-file edit and why it is safe on macOS.

Record what you could **not** test and why, and do not soften a partial result
into a pass. "Capture works except UWP apps, which returned
`ApplicationFrameHost` rows" is a useful finding. "Capture works" is not, if it
does not.

Commit your code fixes separately from the findings file, so the two can be
reviewed independently.

---

## Rules worth restating

From `CLAUDE.md`, the ones most likely to come up here:

- Read files before editing. Never assume contents.
- Ask before adding dependencies. The lean stack is deliberate.
- No comments explaining what code does — only *why*, when non-obvious.
- Electron security: `contextIsolation: true`, always the preload bridge, never
  `nodeIntegration: true`.
- No UI frameworks in the renderer.
- Commit when asked; do not push to `master`.
- Voice, in any user-facing string: calm, direct, present tense, no exclamation
  points.

One more, specific to this port: **do not claim a capability Windows cannot
deliver.** Windows cannot enumerate background tabs, cannot close an individual
tab, and has no per-mode focus API. Those are reported through
`platform.capabilities` so the renderer hides the controls rather than offering
them and failing. If you find another such gap, add a capability flag and hide
the control. Do not paper over it.
