// macOS platform backend. Everything here was previously inline in main.js;
// the logic is unchanged, only relocated behind the shared platform contract
// so the Windows backend can stand beside it. This is the shipping path —
// treat behaviour changes here as release-blocking.

const { execFile, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, systemPreferences, nativeImage, shell } = require('electron');
const chrome = require('./chrome');

const CHROME_ROOT = path.join(os.homedir(), 'Library/Application Support/Google/Chrome');

// In a packaged .app, .jxa files live in Contents/Resources/jxa/.
// In dev, they live in src/platform/macos/.
function jxaPath(filename) {
  const packed = path.join(process.resourcesPath ?? '', 'jxa', filename);
  const dev = path.join(__dirname, '../../src/platform/macos', filename);
  return fs.existsSync(packed) ? packed : dev;
}

function profileProbePath() {
  const packed = path.join(process.resourcesPath ?? '', 'bin', 'chrome-profile-probe');
  const dev = path.join(__dirname, '../../scripts/chrome-profile-probe/bin/chrome-profile-probe');
  return fs.existsSync(packed) ? packed : dev;
}

// Native AX module previously used for window→profile mapping. Kept loaded for
// possible future use but no longer required — title-based matching covers all
// windows across Spaces without needing Accessibility permission.
let nativeProfileProbe = null;
try { nativeProfileProbe = require('../../native/profile-probe'); }
catch (e) { console.error('[profile-probe] native module unavailable:', e.message); }

function callProfileProbe(action) {
  return new Promise(resolve => {
    const bin = profileProbePath();
    if (!fs.existsSync(bin)) {
      console.error('[profile-probe] binary missing at', bin);
      return resolve(null);
    }
    execFile(bin, [action], { timeout: 5000, maxBuffer: 1024 * 1024 * 4 },
      (err, stdout, stderr) => {
        if (err) {
          console.error('[profile-probe]', action, 'error:', err.message, 'stderr:', stderr);
          return resolve(null);
        }
        try { resolve(JSON.parse(String(stdout || 'null'))); }
        catch (e) { resolve(null); }
      });
  });
}

// ── Permissions ───────────────────────────────────────────────────────────────

// 30s cache so a tight burst of run/teardown/get-accessibility IPCs doesn't
// run a 3s blocking osascript on every call and freeze the tray.
let _axCache = { result: null, at: 0 };

function hasAutomationPermission() {
  const now = Date.now();
  if (_axCache.result !== null && now - _axCache.at < 30_000) return _axCache.result;
  let result = false;
  try {
    execFileSync('osascript', ['-l', 'JavaScript', '-e',
      'Application("System Events").processes.whose({backgroundOnly:false}).name()'],
      { timeout: 3000, stdio: 'pipe' });
    result = true;
  } catch (e) {}
  _axCache = { result, at: now };
  return result;
}

function requestAutomationPermission() {
  systemPreferences.isTrustedAccessibilityClient(true);
}

// ── Capture ───────────────────────────────────────────────────────────────────

function capture() {
  return new Promise(resolve => {
    execFile(
      'osascript', ['-l', 'JavaScript', jxaPath('capture.jxa')],
      { maxBuffer: 1024 * 1024 * 10, timeout: 8000 },
      (err, stdout) => {
        if (err) {
          const isTimeout = err.killed || err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT';
          return resolve({ ok: false, error: isTimeout ? 'Scan timed out' : err.message });
        }
        try {
          const data = JSON.parse(stdout.trim());
          resolve({ ok: true, apps: data.apps || [] });
        } catch (e) {
          resolve({ ok: false, error: 'Failed to parse capture output' });
        }
      }
    );
  });
}

// ── Enrichment ────────────────────────────────────────────────────────────────

// Reads each open workspace's state.vscdb to get actual editor tabs, not just
// folder paths.
function enrichCodeApps(apps) {
  const hasCode = apps.some(a => a.name === 'Code');
  if (!hasCode) return Promise.resolve(apps);

  return new Promise(resolve => {
    execFile('python3', [jxaPath('vscode_state.py')], { timeout: 4000 }, (err, stdout) => {
      if (err || !stdout) return resolve(apps);
      try {
        const files = JSON.parse(stdout.trim());
        if (!Array.isArray(files) || files.length === 0) return resolve(apps);
        const withoutCode = apps.filter(a => a.name !== 'Code');
        const codeEntries = files.map(f => ({ name: 'Code', filePath: f.filePath, folderPath: f.filePath, label: f.label }));
        resolve([...withoutCode, ...codeEntries]);
      } catch (e) {
        resolve(apps);
      }
    });
  });
}

// Reads Slack's LevelDB local storage via slack_state.py — no API token needed.
function enrichSlackApps(apps) {
  const hasSlack = apps.some(a => a.name === 'Slack');
  if (!hasSlack) return Promise.resolve(apps);

  return new Promise(resolve => {
    execFile('python3', [jxaPath('slack_state.py')], { timeout: 3000 }, (err, stdout) => {
      if (err || !stdout) return resolve(apps);
      try {
        const { t: teamId, c: channelId, n: teamName } = JSON.parse(stdout.trim());
        const url = (teamId && channelId)
          ? `slack://channel?team=${teamId}&id=${channelId}`
          : null;
        resolve(apps.map(a => {
          if (a.name !== 'Slack') return a;
          return { ...a, urlToOpen: url || undefined, label: teamName || 'Slack' };
        }));
      } catch (e) {
        resolve(apps);
      }
    });
  });
}

// Use the native AX module to get full window titles (with profile suffix),
// then build a map of tabTitle → profileDir. Only sees current-Space windows.
function tabTitleToProfileMapFromAX() {
  const out = new Map();
  if (!nativeProfileProbe || !nativeProfileProbe.windowsRaw) return out;
  let raw;
  try { raw = nativeProfileProbe.windowsRaw(); } catch (_) { return out; }
  if (!Array.isArray(raw)) return out;
  const catalog = chrome.loadProfileCatalog(CHROME_ROOT);
  if (catalog.size === 0) return out;
  for (const w of raw) {
    if (!w || !w.title) continue;
    const dir = chrome.profileDirFromWindowTitle(w.title, catalog);
    if (!dir) continue;
    const tabTitle = w.title.replace(/\s+-\s+Google Chrome\s+[–-]\s+.*$/, '').trim();
    if (tabTitle) out.set(tabTitle, dir);
  }
  return out;
}

async function enrichChromeProfiles(apps) {
  const chromeRows = apps.filter(a => a.name === 'Google Chrome' && (a._windowTitle || a.urlToOpen));
  if (chromeRows.length === 0) {
    return apps.map(a => {
      if (!a._windowTitle) return a;
      const { _windowTitle, ...rest } = a;
      return rest;
    });
  }
  // AX provides high-confidence attribution for visible windows.
  const axMap = tabTitleToProfileMapFromAX();
  // History DB provides fallback attribution for all other Chrome rows.
  const chromeUrls = chromeRows
    .map(a => a.urlToOpen)
    .filter(u => typeof u === 'string' && /^https?:\/\//i.test(u));
  let historyMap = new Map();
  try { historyMap = await chrome.profileMapForUrls(CHROME_ROOT, chromeUrls); }
  catch (e) { console.error('[profile-probe] history lookup failed:', e.message); }
  console.error('[profile-probe] AX matches:', axMap.size, 'history matches:', historyMap.size);
  return apps.map(a => {
    if (a.name !== 'Google Chrome') return a;
    const { _windowTitle, ...rest } = a;
    if (_windowTitle && axMap.has(_windowTitle)) {
      rest.profile = axMap.get(_windowTitle);
    } else if (a.urlToOpen && historyMap.has(a.urlToOpen)) {
      const dir = historyMap.get(a.urlToOpen);
      if (/^(Default|Profile [0-9]+)$/.test(dir)) rest.profile = dir;
    }
    return rest;
  });
}

function enrich(apps) {
  return enrichSlackApps(apps)
    .then(enrichCodeApps)
    .then(enrichChromeProfiles)
    .catch(() => apps);
}

// ── Launch ────────────────────────────────────────────────────────────────────

// `target` arrives pre-validated from main.js: {name, url, filePath, profile}.
function launch(target) {
  return new Promise(resolve => {
    const args = ['-l', 'JavaScript', jxaPath('launch.jxa'), target.name, target.url || ''];
    // Always push slot 3 so slot 4 (profile) stays positionally stable.
    if (target.filePath || target.profile) args.push(target.filePath || '');
    if (target.profile) args.push(target.profile);
    execFile('osascript', args, { maxBuffer: 1024 * 1024 * 10 }, (err) => {
      resolve({ ok: !err });
    });
  });
}

// ── Close / teardown ──────────────────────────────────────────────────────────

// Build {windowTitle: profileDir} by enumerating live Chrome windows and
// parsing their titles, so close.jxa can pin a tab to the right profile.
async function chromeWindowProfilesViaTitle() {
  const profileList = await callProfileProbe('list');
  const byName = new Map();
  if (Array.isArray(profileList)) {
    for (const p of profileList) {
      if (p && p.name && p.dir) byName.set(String(p.name), String(p.dir));
    }
  }
  if (byName.size === 0) return {};
  const titles = await new Promise(resolve => {
    execFile('osascript', ['-l', 'JavaScript', '-e',
      "function run() { try { var c=Application('Google Chrome'); if(!c.running()) return '[]'; return JSON.stringify(c.windows().map(function(w){try{return String(w.name());}catch(e){return '';}})); } catch(e) { return '[]'; } }"
    ], { timeout: 4000 }, (err, stdout) => {
      if (err) return resolve([]);
      try { resolve(JSON.parse(String(stdout).trim())); } catch (_) { resolve([]); }
    });
  });
  const map = {};
  for (const t of titles) {
    const dir = chrome.profileDirFromWindowTitle(t, byName);
    if (dir) map[t] = dir;
  }
  return map;
}

// Resolved once per teardown so the per-target closes can share it.
async function prepareCloseContext(targets) {
  if (targets.some(t => t.name === 'Google Chrome' && t.profile)) {
    return { chromeWinMap: await chromeWindowProfilesViaTitle() };
  }
  return { chromeWinMap: null };
}

function close(target, ctx) {
  return new Promise(resolve => {
    const args = ['-l', 'JavaScript', jxaPath('close.jxa'), target.name];
    if (target.url) {
      args.push(target.url);
      if (target.profile) {
        args.push(target.profile);
        // 4th arg: \x1f-joined window titles in this profile (best-effort).
        const map = ctx && ctx.chromeWinMap;
        if (map && typeof map === 'object') {
          const matching = Object.keys(map).filter(t => map[t] === target.profile);
          if (matching.length) args.push(matching.join(String.fromCharCode(31)));
        }
      }
    }
    execFile('osascript', args, { timeout: 5000 }, () => resolve());
  });
}

// ── Focus modes ───────────────────────────────────────────────────────────────

async function listFocusModes() {
  const dbPath = path.join(os.homedir(), 'Library/DoNotDisturb/DB/ModeConfigurations.json');
  try {
    const raw = await fs.promises.readFile(dbPath, 'utf8');
    const parsed = JSON.parse(raw);
    const modesConfig = parsed.data?.[0]?.modeConfigurations;
    if (!modesConfig) return ['Do Not Disturb'];
    const modes = Object.values(modesConfig)
      .map(entry => entry?.mode?.name)
      .filter(name => typeof name === 'string' && name.trim().length > 0);
    return modes.length > 0 ? modes.sort() : ['Do Not Disturb'];
  } catch (e) {
    return ['Do Not Disturb'];
  }
}

function setFocusMode(mode, enable) {
  return new Promise(resolve => {
    execFile('osascript',
      ['-l', 'JavaScript', jxaPath('focus.jxa'), mode, enable ? 'enable' : 'disable'],
      { timeout: 3000 }, (err) => resolve({ ok: !err }));
  });
}

// The macOS focus path depends on user-created Shortcuts, so the UI offers a
// jump straight to the Shortcuts app.
function openFocusHelp() {
  shell.openExternal('shortcuts://').catch(() => {
    execFile('open', ['-a', 'Shortcuts'], () => {});
  });
}

// ── Chrome profiles ───────────────────────────────────────────────────────────

async function listChromeProfiles() {
  const fromHelper = await callProfileProbe('list');
  if (Array.isArray(fromHelper)) return fromHelper;
  return chrome.listProfiles(CHROME_ROOT);
}

// ── Shell / window chrome ─────────────────────────────────────────────────────

function windowOptions() {
  return {
    transparent: true,
    vibrancy: 'popover',
    visualEffectState: 'followsWindowActiveState',
  };
}

function trayIcon() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '../../public/brand/menubar-icon.png'));
  const icon2x = nativeImage.createFromPath(path.join(__dirname, '../../public/brand/menubar-icon@2x.png'));
  const merged = icon2x.isEmpty() ? icon : icon2x;
  merged.setTemplateImage(true);
  return merged;
}

function hideFromTaskbar() {
  app.dock.hide();
}

module.exports = {
  id: 'darwin',
  capabilities: {
    perTabCapture: true,
    perTabClose: true,
    focusModes: true,
    chromeProfiles: true,
    needsPermissionGrant: true,
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
