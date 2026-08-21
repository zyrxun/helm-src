// Windows platform backend.
//
// The shape of the problem is different from macOS and the code reflects that.
// macOS asks applications what they are holding, over Apple Events: Chrome
// will list every tab in every window, Preview will name its open document.
// Windows has no equivalent channel. What Windows gives is the window list —
// process, executable, title — and everything else has to be reconstructed
// from that plus files the apps leave on disk.
//
// Two consequences run through this file:
//   1. A window title is the primary key. Chrome tab URLs are recovered by
//      matching the title against the profile History DBs (see chrome.js).
//   2. Teardown operates on windows, not tabs. Chrome exposes no way to close
//      one tab from outside the process, so a browser target closes the window
//      that is showing it. This is a real capability gap, not an oversight —
//      it is surfaced through `capabilities.perTabClose`.

const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { app, nativeImage, shell } = require('electron');
const chrome = require('./chrome');

// Absolute path, never bare "powershell": resolving through PATH would let
// anything writable earlier in PATH answer instead of the system shell.
const POWERSHELL = path.join(
  process.env.SystemRoot || 'C:\\Windows',
  'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'
);

const LOCAL_APP_DATA = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');

function scriptPath(filename) {
  const packed = path.join(process.resourcesPath ?? '', 'win', filename);
  const dev = path.join(__dirname, '../../src/platform/windows', filename);
  return fs.existsSync(packed) ? packed : dev;
}

// Where capture.ps1 caches the assembly it compiles from its embedded C#.
// userData, never the install directory: a per-machine install lives under
// Program Files, which is read-only to the user and shared between accounts.
// An unavailable path is not an error — capture.ps1 compiles inline instead.
function psCacheDir() {
  try {
    return path.join(app.getPath('userData'), 'ps-cache');
  } catch (e) {
    return '';
  }
}

function runPowerShell(file, args = [], { timeout = 8000, maxBuffer = 1024 * 1024 * 10 } = {}) {
  return new Promise(resolve => {
    // -ExecutionPolicy Bypass is per-process and needs no admin rights; without
    // it a default-configured machine refuses to run the bundled .ps1 at all.
    const psArgs = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file, ...args];
    execFile(POWERSHELL, psArgs, { timeout, maxBuffer, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        const isTimeout = err.killed || err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT';
        return resolve({ ok: false, timedOut: isTimeout, error: err.message, stderr: String(stderr || '') });
      }
      resolve({ ok: true, stdout: String(stdout || '') });
    });
  });
}

// ── Browser families ──────────────────────────────────────────────────────────

// Chromium browsers all keep the same `Local State` + per-profile `History`
// schema, so profile and URL recovery is identical across them — only the
// user-data root and the window-title suffix differ.
const BROWSERS = [
  {
    process: 'chrome',
    appName: 'Google Chrome',
    titleSuffix: /\s+[-–—]\s+Google Chrome$/,
    root: path.join(LOCAL_APP_DATA, 'Google', 'Chrome', 'User Data'),
  },
  {
    process: 'msedge',
    appName: 'Microsoft Edge',
    // Some Edge builds emit a zero-width space inside the product name.
    titleSuffix: /\s+[-–—]\s+Microsoft\s*\u200b?\s*Edge$/,
    root: path.join(LOCAL_APP_DATA, 'Microsoft', 'Edge', 'User Data'),
  },
];

function browserFor(processName) {
  const p = String(processName || '').toLowerCase();
  return BROWSERS.find(b => b.process === p) || null;
}

function browserForAppName(appName) {
  return BROWSERS.find(b => b.appName === appName) || null;
}

// ── Capture ───────────────────────────────────────────────────────────────────

// Shell surfaces that own real, visible, titled windows but are not apps a
// user would ever put in a workflow.
const SKIP_PROCESSES = new Set([
  'explorer',                  // re-admitted below when a folder path resolves
  'textinputhost',
  'shellexperiencehost',
  'searchhost',
  'searchapp',
  'startmenuexperiencehost',
  'lockapp',
  'peopleexperiencehost',
  'widgets',
  'widgetboard',
  'systemsettings',
  'applicationframehost',
  'helm',
  'electron',
]);

const SKIP_TITLES = new Set([
  'Program Manager',
  'Windows Input Experience',
  'Windows Shell Experience Host',
  'Setup',
]);

function stripBrowserSuffix(title, browser) {
  return String(title || '').replace(browser.titleSuffix, '').trim();
}

// Edge decorates its caption beyond the product name: the active tab title may
// be followed by "and N more pages" and by the profile's display label, e.g.
// "example.com and 2 more pages - Personal - Microsoft Edge". Both must go
// before the History lookup, which is keyed on the bare tab title. The profile
// label is stripped only when it matches a display name Edge's own Local State
// declares (the caption uses shortcut_name, which loadProfileCatalog does not
// collect) — stripping on shape alone would eat tab titles that happen to end
// in " - <word>".
function edgeProfileLabels(root) {
  const labels = new Set();
  try {
    const data = JSON.parse(fs.readFileSync(path.join(root, 'Local State'), 'utf8'));
    const cache = (data.profile && data.profile.info_cache) || {};
    for (const info of Object.values(cache)) {
      if (!info) continue;
      for (const f of ['shortcut_name', 'name', 'gaia_given_name', 'gaia_name']) {
        if (typeof info[f] === 'string' && info[f].trim()) labels.add(info[f].trim());
      }
    }
  } catch (_) {}
  return labels;
}

function stripEdgeDecorations(title, labels) {
  let t = title;
  if (labels.size) {
    const escaped = Array.from(labels, s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    t = t.replace(new RegExp(`\\s+[-–—]\\s+(?:${escaped.join('|')})$`), '');
  }
  return t.replace(/\s+and\s+\d+\s+more\s+pages?$/i, '').trim();
}

async function capture() {
  const cacheDir = psCacheDir();
  const res = await runPowerShell(
    scriptPath('capture.ps1'),
    cacheDir ? ['-CacheDir', cacheDir] : [],
    { timeout: 12000 }
  );
  if (!res.ok) {
    return { ok: false, error: res.timedOut ? 'Scan timed out' : res.error };
  }

  let rows;
  try {
    const parsed = JSON.parse(res.stdout.trim() || '[]');
    // ConvertTo-Json emits a bare object, not an array, for a single window.
    rows = Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    return { ok: false, error: 'Failed to parse capture output' };
  }

  const apps = [];
  const browserWindows = []; // resolved against History after the main pass
  let edgeLabels = null;     // read once per capture, only if an Edge row shows up

  for (const row of rows) {
    if (!row || typeof row.process !== 'string') continue;
    const proc = row.process.toLowerCase();
    const title = String(row.title || '').trim();
    if (SKIP_TITLES.has(title)) continue;

    const displayName = String(row.description || row.process || '').trim() || row.process;
    const exePath = typeof row.exePath === 'string' ? row.exePath : '';

    if (proc === 'explorer') {
      // Only real File Explorer windows carry a folder path; the desktop and
      // taskbar are explorer.exe too and must not become workflow rows.
      if (row.folderPath) {
        apps.push({ name: 'File Explorer', folderPath: String(row.folderPath), exePath, label: title || undefined });
      }
      continue;
    }

    if (SKIP_PROCESSES.has(proc)) continue;

    const browser = browserFor(proc);
    if (browser) {
      let tabTitle = stripBrowserSuffix(title, browser);
      if (tabTitle && proc === 'msedge') {
        if (!edgeLabels) edgeLabels = edgeProfileLabels(browser.root);
        tabTitle = stripEdgeDecorations(tabTitle, edgeLabels);
      }
      if (tabTitle) {
        browserWindows.push({ browser, tabTitle, exePath });
      } else {
        apps.push({ name: browser.appName, exePath });
      }
      continue;
    }

    apps.push({
      name: displayName,
      exePath,
      ...(title && title !== displayName ? { label: title.slice(0, 200) } : {}),
    });
  }

  // Recover URLs for every browser window in one pass per browser family.
  for (const browser of BROWSERS) {
    const mine = browserWindows.filter(w => w.browser === browser);
    if (mine.length === 0) continue;
    let titleMap = new Map();
    try {
      titleMap = await chrome.urlMapForTitles(browser.root, mine.map(w => w.tabTitle));
    } catch (e) {
      console.error('[capture] history lookup failed for', browser.appName, e.message);
    }
    for (const w of mine) {
      const hit = titleMap.get(w.tabTitle);
      apps.push({
        name: browser.appName,
        exePath: w.exePath,
        label: w.tabTitle.slice(0, 200),
        // A miss is expected for pages History has not flushed yet. The row
        // still captures — it just opens the browser without a target URL.
        ...(hit ? { urlToOpen: hit.url } : {}),
        ...(hit && /^(Default|Profile [0-9]+)$/.test(hit.profileDir) ? { profile: hit.profileDir } : {}),
      });
    }
  }

  return { ok: true, apps };
}

// Windows resolves everything it can during capture — there is no equivalent
// of the Slack/VS Code local-state probes yet, and Chrome profiles are already
// attributed by the History pass above.
function enrich(apps) {
  return Promise.resolve(apps);
}

// ── Launch ────────────────────────────────────────────────────────────────────

// Detached + unref'd so the launched app outlives Helm's own process tree;
// otherwise quitting Helm would take the user's whole stack down with it.
function spawnDetached(exe, args) {
  try {
    const child = spawn(exe, args, { detached: true, stdio: 'ignore', windowsHide: false });
    child.unref();
    return true;
  } catch (e) {
    console.error('[launch] spawn failed:', exe, e.message);
    return false;
  }
}

// `target` arrives pre-validated from main.js: {name, url, filePath, folderPath,
// profile, exePath}.
async function launch(target) {
  const browser = browserForAppName(target.name);

  if (browser && target.exePath && target.profile && target.url) {
    return { ok: spawnDetached(target.exePath, [`--profile-directory=${target.profile}`, target.url]) };
  }

  if (browser && target.exePath && target.profile) {
    return { ok: spawnDetached(target.exePath, [`--profile-directory=${target.profile}`]) };
  }

  if (browser && target.exePath && target.url) {
    return { ok: spawnDetached(target.exePath, [target.url]) };
  }

  if (target.url) {
    try { await shell.openExternal(target.url); return { ok: true }; }
    catch (e) { return { ok: false }; }
  }

  if (target.folderPath) {
    const explorer = path.join(process.env.SystemRoot || 'C:\\Windows', 'explorer.exe');
    return { ok: spawnDetached(explorer, [target.folderPath]) };
  }

  if (target.filePath) {
    const err = await shell.openPath(target.filePath);
    return { ok: !err };
  }

  if (target.exePath) {
    return { ok: spawnDetached(target.exePath, []) };
  }

  return { ok: false };
}

// ── Close / teardown ──────────────────────────────────────────────────────────

function processNameFor(target) {
  if (target.exePath) {
    return path.basename(target.exePath).replace(/\.exe$/i, '');
  }
  const browser = browserForAppName(target.name);
  if (browser) return browser.process;
  return null;
}

// macOS needs a live window→profile map here. Windows resolves the window
// title directly from the stored label, so there is nothing to precompute.
function prepareCloseContext() {
  return Promise.resolve({});
}

async function close(target) {
  const procName = processNameFor(target);
  if (!procName) return;

  const browser = browserForAppName(target.name);
  const args = ['-ProcessName', procName];

  // Browser targets close the window showing that page rather than the whole
  // browser — closing all of Chrome because one tab was in the workflow would
  // be far more destructive than the macOS behaviour it mirrors.
  //
  // The stored label is the bare tab title; the live window title has the
  // browser (and on Edge, the profile name and an "and N more pages" count)
  // appended. Rebuilding that suffix here would be guesswork, so close.ps1
  // matches on prefix instead.
  if (browser && target.label) {
    args.push('-TitleFilter', target.label);
  }

  await runPowerShell(scriptPath('close.ps1'), args, { timeout: 8000 });
}

// ── Focus modes ───────────────────────────────────────────────────────────────

// Windows has no per-mode focus API, so there is exactly one mode. See
// focus.ps1 for why this is the toast switch and not Focus Assist.
function listFocusModes() {
  return Promise.resolve(['Do Not Disturb']);
}

async function setFocusMode(_mode, enable) {
  const res = await runPowerShell(scriptPath('focus.ps1'), ['-Action', enable ? 'enable' : 'disable'], { timeout: 5000 });
  return { ok: res.ok };
}

function openFocusHelp() {
  shell.openExternal('ms-settings:notifications').catch(() => {});
}

// ── Chrome profiles ───────────────────────────────────────────────────────────

function listChromeProfiles() {
  return Promise.resolve(chrome.listProfiles(BROWSERS[0].root));
}

// ── Shell / window chrome ─────────────────────────────────────────────────────

function windowOptions() {
  // backgroundMaterial is mutually exclusive with transparent:true. On Win11
  // this gives the frosted popover that matches the macOS vibrancy; on Win10
  // it is ignored and the window falls back to solid Abyss, which is on-brand.
  // Windows gets a real draggable, resizable window rather than the macOS
  // frameless menu-bar popover. The overflow-tray metaphor is weak on Windows
  // and the anchored frameless popover clipped its own footer off-screen with
  // no way to drag or resize it back. A framed window with a title bar can be
  // moved, resized and alt-tabbed to. These override the constructor's
  // width/height/frame/resizable because platform.windowOptions() is spread
  // after them.
  return {
    width: 460,
    height: 640,
    minWidth: 380,
    minHeight: 460,
    frame: true,
    resizable: true,
    skipTaskbar: false,
    transparent: false,
    backgroundColor: '#0A1628',
    backgroundMaterial: 'acrylic',
    roundedCorners: true,
  };
}

function trayIcon() {
  // No template images on Windows — the tray needs a full-colour icon that
  // reads on both light and dark taskbars.
  const ico = path.join(__dirname, '../../public/brand/tray-icon.ico');
  if (fs.existsSync(ico)) return nativeImage.createFromPath(ico);
  return nativeImage.createFromPath(path.join(__dirname, '../../public/brand/tray-icon.png'));
}

function hideFromTaskbar() {
  // Handled by skipTaskbar in windowOptions; there is no dock to hide.
}

function hasAutomationPermission() {
  // Windows has nothing equivalent to TCC for window enumeration or launching.
  return true;
}

function requestAutomationPermission() {
  // Nothing to request.
}

module.exports = {
  id: 'win32',
  capabilities: {
    perTabCapture: false,
    perTabClose: false,
    focusModes: 'single',
    chromeProfiles: true,
    needsPermissionGrant: false,
  },
  capture,
  enrich,
  launch,
  prepareCloseContext,
  close,
  listFocusModes,
  setFocusMode,
  openFocusHelp,
  listChromeProfiles,
  hasAutomationPermission,
  requestAutomationPermission,
  windowOptions,
  trayIcon,
  hideFromTaskbar,
};
