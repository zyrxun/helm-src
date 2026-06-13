// In dev, load .env for build-only secrets that some code paths reference.
// In a packaged app, .env is NOT shipped (see package.json build.files), and
// runtime config comes from electron/runtime-config.js instead.
if (!require('electron').app.isPackaged) {
  try { require('dotenv').config({ path: require('path').join(__dirname, '../.env') }); } catch (_) {}
}

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, systemPreferences, globalShortcut } = require('electron');
const { autoUpdater } = require('electron-updater');
const runtimeConfig = require('./runtime-config');

const Sentry = require('@sentry/electron/main');
if (runtimeConfig.sentryDsn) {
  Sentry.init({
    dsn: runtimeConfig.sentryDsn,
    environment: app.isPackaged ? 'production' : 'development',
    // Privacy: "workflows live on your machine." No perf tracing, and drop every
    // breadcrumb so captured URLs / window titles / Chrome profile names / emails
    // that pass through console logs never ride along on a crash event.
    tracesSampleRate: 0,
    beforeBreadcrumb() { return null; },
    beforeSend(event) {
      // Strip request context and any stray PII the SDK may attach by default.
      delete event.request;
      delete event.user;
      delete event.server_name;
      return event;
    },
  });
}
const { execFile } = require('child_process');
const path    = require('path');

// In a packaged .app, .jxa files live in Contents/Resources/jxa/.
// In dev, they live in src/platform/macos/.
function jxaPath(filename) {
  const packed = path.join(process.resourcesPath ?? '', 'jxa', filename);
  const dev    = path.join(__dirname, '../src/platform/macos', filename);
  return require('fs').existsSync(packed) ? packed : dev;
}

function profileProbePath() {
  const packed = path.join(process.resourcesPath ?? '', 'bin', 'chrome-profile-probe');
  const dev    = path.join(__dirname, '../scripts/chrome-profile-probe/bin/chrome-profile-probe');
  return require('fs').existsSync(packed) ? packed : dev;
}
const storage = require('./storage');
const license = require('./license');

const FREE_LIMIT = 2;

// ── Focus mode list ───────────────────────────────────────────────────────────
async function getFocusModes() {
  const fs = require('fs').promises;
  const os = require('os');
  const dbPath = path.join(os.homedir(), 'Library/DoNotDisturb/DB/ModeConfigurations.json');
  try {
    const raw = await fs.readFile(dbPath, 'utf8');
    const parsed = JSON.parse(raw);
    const modesConfig = parsed.data?.[0]?.modeConfigurations;
    if (!modesConfig) return ['Do Not Disturb'];
    const modes = Object.values(modesConfig)
      .map(entry => entry?.mode?.name)
      .filter(name => typeof name === 'string' && name.trim().length > 0);
    return modes.length > 0 ? modes.sort() : ['Do Not Disturb'];
  } catch(e) {
    return ['Do Not Disturb'];
  }
}

// ── VS Code open-file resolver ────────────────────────────────────────────────
// Reads each open workspace's state.vscdb to get actual editor tabs, not just folder paths.
function enrichCodeApps(apps) {
  const hasCode = apps.some(a => a.name === 'Code');
  if (!hasCode) return Promise.resolve(apps);

  return new Promise(resolve => {
    const scriptPath = jxaPath('vscode_state.py');
    execFile('python3', [scriptPath], { timeout: 4000 }, (err, stdout) => {
      if (err || !stdout) return resolve(apps);
      try {
        const files = JSON.parse(stdout.trim());
        if (!Array.isArray(files) || files.length === 0) return resolve(apps);
        // Replace the single Code stub with one entry per open file
        const withoutCode = apps.filter(a => a.name !== 'Code');
        const codeEntries = files.map(f => ({ name: 'Code', filePath: f.filePath, folderPath: f.filePath, label: f.label }));
        resolve([...withoutCode, ...codeEntries]);
      } catch(e) {
        resolve(apps);
      }
    });
  });
}

// ── Slack deep-link resolver ──────────────────────────────────────────────────
// Reads Slack's LevelDB local storage via slack_state.py — no API token needed.
// Works across all workspaces the user is signed into.
function enrichSlackApps(apps) {
  const hasSlack = apps.some(a => a.name === 'Slack');
  if (!hasSlack) return Promise.resolve(apps);

  return new Promise(resolve => {
    const scriptPath = jxaPath('slack_state.py');
    execFile('python3', [scriptPath], { timeout: 3000 }, (err, stdout) => {
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
      } catch(e) {
        resolve(apps);
      }
    });
  });
}

// Native AX module previously used for window→profile mapping. Kept loaded for
// possible future use but no longer required — title-based matching covers all
// windows across Spaces without needing Accessibility permission.
let nativeProfileProbe = null;
try { nativeProfileProbe = require('../native/profile-probe'); }
catch (e) { console.error('[profile-probe] native module unavailable:', e.message); }

async function chromeWindowProfilesViaTitle() {
  // Build {windowTitle: profileDir} by enumerating live Chrome windows + parsing titles.
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
      try { resolve(JSON.parse(String(stdout).trim())); } catch(_) { resolve([]); }
    });
  });
  const map = {};
  for (const t of titles) {
    const dir = profileDirFromWindowTitle(t, byName);
    if (dir) map[t] = dir;
  }
  return map;
}

function profileDirFromWindowTitle(title, profilesByName) {
  if (!title) return null;
  // Chrome appends " – <display name>" (em-dash) to window titles when 2+ profiles run.
  const emDash = title.lastIndexOf(' – ');
  if (emDash === -1) return null;
  const suffix = title.slice(emDash + 3).trim();
  // Try full suffix, then suffix with parenthetical stripped.
  const base = suffix.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return profilesByName.get(suffix) || profilesByName.get(base) || null;
}

function loadChromeProfileCatalog() {
  // Read Chrome's Local State and return a Map of every display form Chrome
  // might put in a window title → profile directory.
  const byKey = new Map();
  const add = (key, dir) => {
    if (key && dir && !byKey.has(key)) byKey.set(key, dir);
  };
  try {
    const localStatePath = require('path').join(
      require('os').homedir(),
      'Library/Application Support/Google/Chrome/Local State'
    );
    const raw = require('fs').readFileSync(localStatePath, 'utf8');
    const data = JSON.parse(raw);
    const cache = (data.profile && data.profile.info_cache) || {};
    for (const [dir, info] of Object.entries(cache)) {
      if (!info) continue;
      const name = info.name;
      const gaiaName = info.gaia_given_name || info.gaia_name;
      const userName = info.user_name;
      add(name, dir);
      if (gaiaName) add(gaiaName, dir);
      if (userName) add(userName, dir);
      // Chrome's disambiguated title format combines display name + descriptor.
      // Observed format: "{gaia_given_name} ({name})" when multiple profiles share gaia name.
      // Also handles "{name} ({user_name})" and "{gaia_name} ({name})".
      if (gaiaName && name && gaiaName !== name) add(`${gaiaName} (${name})`, dir);
      if (name && userName) add(`${name} (${userName})`, dir);
      if (name && gaiaName && gaiaName !== name) add(`${name} (${gaiaName})`, dir);
    }
  } catch (e) {
    console.error('[profile-probe] Local State read failed:', e.message);
  }
  return byKey;
}

function tabTitleToProfileMapFromAX() {
  // Use the native AX module to get full window titles (with profile suffix),
  // then build a map of tabTitle → profileDir. Only sees current-Space windows.
  const out = new Map();
  if (!nativeProfileProbe || !nativeProfileProbe.windowsRaw) return out;
  let raw;
  try { raw = nativeProfileProbe.windowsRaw(); } catch (_) { return out; }
  if (!Array.isArray(raw)) return out;
  const catalog = loadChromeProfileCatalog();
  if (catalog.size === 0) return out;
  for (const w of raw) {
    if (!w || !w.title) continue;
    const dir = profileDirFromWindowTitle(w.title, catalog);
    if (!dir) continue;
    // Strip " - Google Chrome – …" from full title to recover the tab title.
    const tabTitle = w.title.replace(/\s+-\s+Google Chrome\s+[–-]\s+.*$/, '').trim();
    if (tabTitle) out.set(tabTitle, dir);
  }
  return out;
}

async function buildHistoryProfileMap(urls) {
  // For each Chrome profile, look up which URLs it has visited and when. The
  // profile with the most-recent visit for each URL wins. Reads each profile's
  // History SQLite via the system sqlite3 CLI (no new deps).
  if (!urls.length) return new Map();
  const path = require('path');
  const fs = require('fs');
  const os = require('os');
  const catalog = loadChromeProfileCatalog();
  if (catalog.size === 0) return new Map();
  const profileDirs = Array.from(new Set(catalog.values()));
  const chromeRoot = path.join(os.homedir(), 'Library/Application Support/Google/Chrome');

  // Copy each History DB into a fresh private temp dir rather than a predictable
  // path, so a same-user process can't pre-seed a symlink at our target filename.
  let tmpRoot;
  try { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-hist-')); }
  catch (e) { return new Map(); }

  const byUrl = new Map(); // url → {dir, time}
  for (const dir of profileDirs) {
    const src = path.join(chromeRoot, dir, 'History');
    if (!fs.existsSync(src)) continue;
    const tmp = path.join(tmpRoot, `${dir.replace(/\s+/g, '_')}.db`);
    try {
      fs.copyFileSync(src, tmp);
    } catch (e) { continue; }
    const inClause = urls.map(u => "'" + String(u).replace(/'/g, "''") + "'").join(',');
    const sql = `SELECT url, MAX(last_visit_time) FROM urls WHERE url IN (${inClause}) GROUP BY url;`;
    const out = await new Promise(resolve => {
      execFile('/usr/bin/sqlite3', [tmp, sql], { timeout: 4000, maxBuffer: 1024 * 1024 * 4 },
        (err, stdout) => resolve(err ? '' : String(stdout)));
    });
    for (const line of out.split('\n')) {
      const idx = line.indexOf('|');
      if (idx < 0) continue;
      const url = line.slice(0, idx);
      const t = parseInt(line.slice(idx + 1), 10);
      if (!url || !Number.isFinite(t)) continue;
      const prev = byUrl.get(url);
      if (!prev || t > prev.time) byUrl.set(url, { dir, time: t });
    }
  }

  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}

  const flat = new Map();
  for (const [url, { dir }] of byUrl) flat.set(url, dir);
  return flat;
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
  try { historyMap = await buildHistoryProfileMap(chromeUrls); }
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

let tray      = null;
let win       = null;
let isPro     = false;
let proEmail  = null;
let isOffline = false;

function isUserAuthorized() {
  return isPro;
}

function createTrayIcon() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '../public/brand/menubar-icon.png'));
  // Provide @2x for Retina — Electron picks it up automatically when suffixed
  const icon2x = nativeImage.createFromPath(path.join(__dirname, '../public/brand/menubar-icon@2x.png'));
  const merged = icon2x.isEmpty() ? icon : icon2x;
  merged.setTemplateImage(true);
  return merged;
}

// 30s cache so a tight burst of run/teardown/get-accessibility IPCs doesn't
// run a 3s blocking osascript on every call and freeze the tray.
let _axCache = { result: null, at: 0 };
function hasAccessibility() {
  const now = Date.now();
  if (_axCache.result !== null && now - _axCache.at < 30_000) return _axCache.result;
  let result = false;
  try {
    const { execFileSync } = require('child_process');
    execFileSync('osascript', ['-l', 'JavaScript', '-e',
      'Application("System Events").processes.whose({backgroundOnly:false}).name()'],
      { timeout: 3000, stdio: 'pipe' });
    result = true;
  } catch (e) {}
  _axCache = { result, at: now };
  return result;
}

function requestAccessibility() {
  // Prompts macOS to show the Accessibility permission dialog
  systemPreferences.isTrustedAccessibilityClient(true);
}

// Defense-in-depth: the renderer only ever loads bundled local files and routes
// every external link through the openExternal IPC. Deny all window.open calls and
// any navigation away from the loaded file, so a future content-injection bug can't
// spawn windows or redirect the renderer to attacker content.
function hardenNavigation(bw) {
  bw.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  bw.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });
}

function getWindowPosition() {
  const trayBounds   = tray.getBounds();
  const windowBounds = win.getBounds();
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2);
  const y = Math.round(trayBounds.y + trayBounds.height + 4);
  return { x, y };
}

function toggleWindow() {
  if (win.isVisible()) {
    win.hide();
  } else {
    const { x, y } = getWindowPosition();
    win.setPosition(x, y, false);
    win.show();
    win.focus();
  }
}

async function activateLicense(key) {
  const result = await license.activate(key);
  if (result.valid) {
    // result.receipt: string on a fresh online activation, undefined on the
    // offline-grace path (preserve the stored one). save() handles both.
    license.save(key, result.receipt);
    isPro     = true;
    proEmail  = result.email;
    isOffline = result.offline || false;
    if (win) win.webContents.send('license-activated', { email: result.email });
  }
  return result;
}

app.setAsDefaultProtocolClient('helm');

app.on('open-url', (event, url) => {
  event.preventDefault();
  try {
    const u   = new URL(url);
    const key = u.searchParams.get('key');
    if (u.hostname === 'activate' && key) {
      // A deep link is attacker-triggerable from any web page. Never silently
      // overwrite an already-valid license — that would let a page swap a paying
      // user's key for a junk/attacker key (drive-by deactivation/hijack).
      if (isPro) {
        if (win && !win.webContents.isDestroyed()) {
          win.webContents.send('workflow-warning', { type: 'DEEPLINK_ACTIVATE_IGNORED' });
        }
        return;
      }
      activateLicense(key).catch(err => console.error('[deep-link] activate failed:', err));
    }
  } catch (e) { /* malformed URL */ }
});

app.whenReady().then(async () => {
  // Phase 1: fast local Ed25519 signature check — unblocks UI immediately
  const cached = license.load();
  if (cached.key) {
    // Phase 1: local grant. With receipts enforced this requires a valid
    // unexpired receipt; otherwise it's the legacy signature-only check.
    const local = license.localAuthorize(cached);
    if (local.valid) { isPro = true; proEmail = local.email; isOffline = !!local.offline; }

    // Phase 2: background server re-verify — never blocks startup, fails safe.
    // On success it refreshes the receipt; on a hard denial it downgrades.
    license.activate(cached.key).then(result => {
      if (result.valid && !result.offline) {
        isPro = true; proEmail = result.email; isOffline = false;
        license.save(cached.key, result.receipt);
      } else if (!result.valid && (result.reason === 'limit_reached' || result.reason === 'activation_required')) {
        isPro = false; proEmail = null;
        if (win) win.webContents.send('license-status-changed', { isPro: false, reason: result.reason });
      }
    }).catch(() => {}); // network failures are intentionally ignored
  }

  tray = new Tray(createTrayIcon());
  tray.setToolTip('Helm');
  tray.on('click', toggleWindow);
  tray.on('right-click', () => {
    tray.popUpContextMenu(Menu.buildFromTemplate([
      { label: 'Open Helm', click: toggleWindow },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]));
  });

  win = new BrowserWindow({
    width: 320,
    height: 480,
    show: false,
    frame: false,
    resizable: false,
    transparent: true,
    vibrancy: 'popover',
    visualEffectState: 'followsWindowActiveState',
    webPreferences: {
      backgroundThrottling: true,
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  win.loadFile(path.join(__dirname, '../public/index.html'));
  hardenNavigation(win);
  win.on('blur', () => win.hide());

  win.on('show', () => {
    if (!win.webContents.isDestroyed()) win.webContents.send('window-visibility', 'visible');
  });
  win.on('hide', () => {
    if (!win.webContents.isDestroyed()) win.webContents.send('window-visibility', 'hidden');
  });
  win.on('closed', () => { win = null; });

  app.dock.hide();
  registerWorkflowShortcuts();
  const saved = loadAppSettings();
  if (saved.modeToggleHotkey) registerModeToggleHotkey(saved.modeToggleHotkey);
  updateTrayModeIndicator();

  // Show welcome window on first ever launch
  const fs = require('fs');
  const welcomedPath = path.join(app.getPath('userData'), 'welcomed');
  if (!fs.existsSync(welcomedPath)) {
    fs.writeFileSync(welcomedPath, '1');
    const welcome = new BrowserWindow({
      width: 480, height: 680,
      resizable: true, minimizable: false, maximizable: false,
      titleBarStyle: 'hiddenInset',
      backgroundColor: '#0A1628',
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        preload: path.join(__dirname, 'preload.js'),
      },
    });
    welcome.loadFile(path.join(__dirname, '../public/welcome.html'));
    hardenNavigation(welcome);
    welcome.show();
  }

  if (app.isPackaged) {
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: 'https://pub-ec64f4f5098d43328a5073456b0d41ab.r2.dev',
    });
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('update-available', (info) => {
      if (win && !win.webContents.isDestroyed()) {
        win.webContents.send('update-available', { version: info.version });
      }
    });
    autoUpdater.on('update-downloaded', (info) => {
      if (win && !win.webContents.isDestroyed()) {
        win.webContents.send('update-downloaded', { releaseName: info.version });
      }
    });
    autoUpdater.on('error', (err) => {
      console.error('Auto-updater error:', err);
    });
    autoUpdater.checkForUpdates().catch(err => console.error('Update check failed:', err));
  }
});

// ── Input validation ──────────────────────────────────────────────────────────

const SAFE_STRING = /^[^\x00-\x1f\x7f"\\`$!|;&<>(){}[\]]*$/; // no shell metacharacters
// NOTE: this validates the URL *scheme* only, not the rest of the string. It is
// safe because every shell sink (launch.jxa) single-quote-escapes the value before
// doShellScript. If you ever interpolate a URL into a shell without that escaping,
// this check is NOT sufficient — escape at the sink.
const SAFE_URL    = /^((https?|notion|slack|figma|obsidian):\/\/|spotify:[a-z]+:)/i;

function isSafeString(s, maxLen = 256) {
  return typeof s === 'string' && s.length > 0 && s.length <= maxLen && SAFE_STRING.test(s);
}

// Display-only fields (labels, window titles) — these are stored as data and
// rendered as text, never passed to a shell. Reject only control chars and
// require a reasonable length.
const SAFE_DISPLAY = /^[^\x00-\x1f\x7f]*$/;
function isSafeDisplayString(s, maxLen = 256) {
  return typeof s === 'string' && s.length > 0 && s.length <= maxLen && SAFE_DISPLAY.test(s);
}

function isSafeUrl(u, maxLen = 2048) {
  return typeof u === 'string' && u.length <= maxLen && SAFE_URL.test(u);
}

function isSafeId(s) {
  return typeof s === 'string' && /^[\w-]{1,128}$/.test(s);
}

function validateWorkflow(w) {
  if (!w || typeof w !== 'object')                  return { ok: false, field: 'workflow' };
  if (!isSafeId(w.id))                              return { ok: false, field: 'id' };
  if (!isSafeString(w.name, 128))                   return { ok: false, field: 'name' };
  if (!Array.isArray(w.apps))                       return { ok: false, field: 'apps' };
  if (w.apps.length > 100)                          return { ok: false, field: 'apps', reason: 'too_many', count: w.apps.length, limit: 100 };
  for (let i = 0; i < w.apps.length; i++) {
    const app = w.apps[i];
    const at = (f) => ({ ok: false, field: f, index: i, appName: app && app.name });
    if (!app || typeof app !== 'object')            return at('app');
    if (!isSafeDisplayString(app.name, 128))        return at('app.name');
    if (app.urlToOpen !== undefined && app.urlToOpen !== null &&
        !isSafeUrl(app.urlToOpen))                  return at('app.urlToOpen');
    if (app.folderPath !== undefined &&
        !isSafeString(app.folderPath, 512))         return at('app.folderPath');
    if (app.labelFallback !== undefined &&
        !isSafeDisplayString(app.labelFallback, 256)) return at('app.labelFallback');
    if (app.filePath !== undefined &&
        !isSafeString(app.filePath, 512))           return at('app.filePath');
    if (app.profile !== undefined && app.profile !== null && app.profile !== '' &&
        !/^(Default|Profile [0-9]+)$/.test(app.profile)) return at('app.profile');
    if (app.label !== undefined &&
        !isSafeDisplayString(app.label, 256))       return at('app.label');
  }
  if (w.focusMode !== undefined && !isSafeString(w.focusMode, 128)) return { ok: false, field: 'focusMode' };
  if (w.closeApps !== undefined) {
    if (!Array.isArray(w.closeApps))                return { ok: false, field: 'closeApps' };
    if (w.closeApps.length > 50)                    return { ok: false, field: 'closeApps', reason: 'too_many', count: w.closeApps.length, limit: 50 };
    for (let i = 0; i < w.closeApps.length; i++) {
      const a = w.closeApps[i];
      const at = (f) => ({ ok: false, field: f, index: i, appName: a && a.name });
      if (!a || typeof a !== 'object')              return at('closeApp');
      if (!isSafeDisplayString(a.name, 128))        return at('closeApp.name');
      if (a.urlToOpen !== undefined && !isSafeUrl(a.urlToOpen)) return at('closeApp.urlToOpen');
    }
  }
  return { ok: true };
}

// ── Hotkey helpers ────────────────────────────────────────────────────────────

function validateHotkeyStr(hotkey) {
  if (!hotkey) return true;
  if (typeof hotkey !== 'string' || hotkey.length > 60) return false;
  const hasModifier = ['Command','Control','Alt','Shift'].some(m => hotkey.includes(m));
  if (!hasModifier) return false;
  if (hotkey.endsWith('+')) return false;
  return /^[A-Za-z0-9+]+$/.test(hotkey);
}

let isTeardownModeActive = false;
let activeExecutionGuard = false;
let modeToggleHotkey = null;

function settingsPath() {
  return path.join(app.getPath('userData'), 'Helm', 'settings.json');
}
function loadAppSettings() {
  try {
    const raw = require('fs').readFileSync(settingsPath(), 'utf8');
    return JSON.parse(raw);
  } catch (e) { return {}; }
}
function saveAppSettings(patch) {
  const fs = require('fs');
  const dir = path.dirname(settingsPath());
  try { fs.mkdirSync(dir, { recursive: true }); } catch(e) {}
  const cur = loadAppSettings();
  fs.writeFileSync(settingsPath(), JSON.stringify({ ...cur, ...patch }, null, 2));
}

function updateTrayModeIndicator() {
  if (!tray) return;
  try { tray.setTitle(isTeardownModeActive ? ' ⊠' : ''); } catch(e) {}
  try { tray.setToolTip(isTeardownModeActive ? 'Helm — Teardown mode' : 'Helm'); } catch(e) {}
}

function setTeardownMode(on, broadcast) {
  // Teardown is a Pro feature. The renderer hides the UI behind isPro, but the
  // hotkey + IPC paths reach here too — gate enforcement at the source so a
  // free user can't toggle into teardown by binding the mode-toggle shortcut.
  const next = !!on && (!on || isUserAuthorized());
  isTeardownModeActive = next;
  updateTrayModeIndicator();
  if (broadcast && win && !win.webContents.isDestroyed()) {
    win.webContents.send('mode-changed', isTeardownModeActive);
  }
}

function registerModeToggleHotkey(accelerator) {
  if (modeToggleHotkey) {
    try { globalShortcut.unregister(modeToggleHotkey); } catch(e) {}
  }
  modeToggleHotkey = accelerator || null;
  if (!accelerator) return true;
  try {
    return globalShortcut.register(accelerator, () => {
      setTeardownMode(!isTeardownModeActive, true);
    });
  } catch(e) { return false; }
}

async function teardownWorkflowById(workflowId) {
  if (!isSafeId(workflowId)) return { ok: false, error: 'Invalid workflow id' };
  if (!hasAccessibility()) return { ok: false, error: 'accessibility_denied' };
  const workflows = storage.load();
  const workflow  = workflows.find(w => w.id === workflowId);
  if (!workflow) return { ok: false, error: 'Workflow not found' };
  const targets = (workflow.apps || [])
    .filter(a => a && isSafeDisplayString(a.name, 128))
    .map(a => ({
      name: a.name,
      urlToOpen: a.urlToOpen,
      profile: a.profile,
    }));

  // If any Chrome target carries a profile, fetch the live window→profile
  // map once so close.jxa can filter by exact window title (the only way to
  // pin a tab to its profile on modern Chrome).
  let chromeWinMap = null;
  if (targets.some(t => t.name === 'Google Chrome' && t.profile)) {
    chromeWinMap = await chromeWindowProfilesViaTitle();
  }

  await Promise.all(targets.map(a =>
    new Promise(resolve => {
      const closeArgs = ['-l', 'JavaScript', jxaPath('close.jxa'), a.name];
      if (a.urlToOpen && isSafeUrl(a.urlToOpen)) {
        closeArgs.push(a.urlToOpen);
        if (a.profile && /^(Default|Profile [0-9]+)$/.test(a.profile)) {
          closeArgs.push(a.profile);
          // 4th arg: \x1f-joined window titles in this profile (best-effort).
          // close.jxa splits this on \x1f (String.fromCharCode(31)).
          if (chromeWinMap && typeof chromeWinMap === 'object') {
            const matching = Object.keys(chromeWinMap)
              .filter(t => chromeWinMap[t] === a.profile);
            if (matching.length) closeArgs.push(matching.join(String.fromCharCode(31)));
          }
        }
      }
      execFile('osascript', closeArgs, { timeout: 5000 }, () => resolve());
    })
  ));

  if (workflow.focusMode && isSafeString(workflow.focusMode, 128)) {
    execFile('osascript',
      ['-l', 'JavaScript', jxaPath('focus.jxa'), workflow.focusMode, 'disable'],
      { timeout: 3000 }, (err) => {
        if (err && win) {
          win.webContents.send('workflow-warning', {
            type: 'FOCUS_DISABLE_SHORTCUT_MISSING',
            mode: workflow.focusMode
          });
        }
      });
  }

  return { ok: true };
}

async function runWorkflowById(workflowId) {
  if (!isSafeId(workflowId)) return { ok: false, error: 'Invalid workflow id' };
  if (!hasAccessibility()) return { ok: false, error: 'accessibility_denied' };

  const workflows = storage.load();
  const workflow  = workflows.find(w => w.id === workflowId);
  if (!workflow) return { ok: false, error: 'Workflow not found' };

  // 1. Close apps — fully resolved before any launch begins
  if (Array.isArray(workflow.closeApps) && workflow.closeApps.length > 0) {
    const closeTargets = workflow.closeApps.filter(a => a && isSafeDisplayString(a.name, 128));
    await Promise.all(closeTargets.map(closeTarget =>
      new Promise(resolve => {
        const closeArgs = ['-l', 'JavaScript', jxaPath('close.jxa'), closeTarget.name];
        if (closeTarget.urlToOpen && isSafeUrl(closeTarget.urlToOpen)) closeArgs.push(closeTarget.urlToOpen);
        execFile('osascript', closeArgs, { timeout: 5000 }, () => resolve());
      })
    ));
  }

  // 2. Open apps
  workflow.apps.forEach(appTarget => {
    if (!isSafeDisplayString(appTarget.name, 128)) return;
    // Re-validate folderPath at execution like every other field — workflows.json
    // is editable on disk, so don't trust the save-time check alone.
    const folderPath = (appTarget.folderPath && isSafeString(appTarget.folderPath, 512))
      ? appTarget.folderPath : '';
    const url = folderPath
      ? folderPath
      : (appTarget.urlToOpen && isSafeUrl(appTarget.urlToOpen) ? appTarget.urlToOpen : '');
    const args = ['-l', 'JavaScript', jxaPath('launch.jxa'), appTarget.name, url];
    const fp = (appTarget.filePath && isSafeString(appTarget.filePath, 512)) ? appTarget.filePath : '';
    const profile = (appTarget.profile && /^(Default|Profile [0-9]+)$/.test(appTarget.profile))
      ? appTarget.profile : '';
    // Always push slot 3 so slot 4 (profile) stays positionally stable.
    if (fp || profile) args.push(fp);
    if (profile) args.push(profile);
    execFile('osascript', args, { maxBuffer: 1024 * 1024 * 10 }, (err) => {
      if (err && win && !win.webContents.isDestroyed()) {
        win.webContents.send('workflow-warning', {
          type: 'LAUNCH_FAILED',
          appName: appTarget.name,
        });
      }
    });
  });

  // 3. Trigger Focus mode concurrently — non-zero exit sends warning to renderer
  if (workflow.focusMode && isSafeString(workflow.focusMode, 128)) {
    execFile('osascript', ['-l', 'JavaScript', jxaPath('focus.jxa'), workflow.focusMode],
      { timeout: 3000 }, (err) => {
        if (err && win) {
          win.webContents.send('workflow-warning', {
            type: 'FOCUS_SHORTCUT_MISSING',
            mode: workflow.focusMode
          });
        }
      });
  }

  return { ok: true };
}

function registerWorkflowShortcuts() {
  globalShortcut.unregisterAll();
  storage.load().forEach(w => {
    if (!w.hotkey) return;
    try {
      globalShortcut.register(w.hotkey, async () => {
        if (activeExecutionGuard) return;
        activeExecutionGuard = true;
        try {
          isTeardownModeActive
            ? await teardownWorkflowById(w.id)
            : await runWorkflowById(w.id);
        } finally {
          activeExecutionGuard = false;
        }
      });
    } catch (e) {
      console.error('[shortcut] failed to register', w.hotkey, e.message);
    }
  });
  if (modeToggleHotkey) {
    try {
      globalShortcut.register(modeToggleHotkey, () => {
        setTeardownMode(!isTeardownModeActive, true);
      });
    } catch(e) {}
  }
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('get-workflows',   () => storage.load());
ipcMain.handle('get-focus-modes', () => getFocusModes());

ipcMain.handle('run-workflow', async (_, workflowId) => {
  if (activeExecutionGuard) return { ok: false, error: 'busy' };
  activeExecutionGuard = true;
  try { return await runWorkflowById(workflowId); }
  finally { activeExecutionGuard = false; }
});

ipcMain.handle('teardown-workflow', async (_, id) => {
  if (activeExecutionGuard) return { ok: false, error: 'busy' };
  activeExecutionGuard = true;
  try { return await teardownWorkflowById(id); }
  finally { activeExecutionGuard = false; }
});
ipcMain.handle('set-teardown-mode', (_, on) => { setTeardownMode(on, false); return isTeardownModeActive; });
ipcMain.handle('get-teardown-mode', ()       => isTeardownModeActive);
ipcMain.handle('get-mode-toggle-hotkey', () => modeToggleHotkey);
ipcMain.handle('set-mode-toggle-hotkey', (_, accelerator) => {
  if (accelerator !== null && !validateHotkeyStr(accelerator)) return { ok: false, error: 'invalid' };
  const ok = registerModeToggleHotkey(accelerator);
  if (ok) saveAppSettings({ modeToggleHotkey: accelerator });
  return { ok };
});

ipcMain.handle('capture-state', () => {
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
          // Strip any URLs that aren't safe schemes — Spotify track IDs, chrome://, etc.
          let apps = (data.apps || [])
            .filter(a => a && typeof a.name === 'string' && a.name.trim().length > 0)
            .map(a => {
              if (a.urlToOpen && !isSafeUrl(a.urlToOpen)) {
                const { urlToOpen, ...rest } = a;
                return rest;
              }
              return a;
            });
          // Enrich Slack (channel deep link) and Code (open files) via local app state
          enrichSlackApps(apps)
            .then(enrichCodeApps)
            .then(enrichChromeProfiles)
            .then(enriched => resolve({ ok: true, apps: enriched }))
            .catch(() => resolve({ ok: true, apps }));
        } catch (e) {
          resolve({ ok: false, error: 'Failed to parse capture output' });
        }
      }
    );
  });
});

ipcMain.handle('save-workflow', (_, workflow) => {
  try {
    const v = validateWorkflow(workflow);
    if (!v.ok) {
      if (v.field === 'apps' && v.reason === 'too_many') {
        return { ok: false, reason: 'too_many_apps', limit: v.limit, count: v.count };
      }
      if (v.field === 'closeApps' && v.reason === 'too_many') {
        return { ok: false, reason: 'too_many_close_apps', limit: v.limit, count: v.count };
      }
      let badValue;
      try {
        if (v.index !== undefined && workflow.apps && workflow.apps[v.index]) {
          const k = v.field.split('.')[1];
          badValue = k ? workflow.apps[v.index][k] : workflow.apps[v.index];
        }
      } catch(_) {}
      return { ok: false, reason: 'invalid_input', field: v.field, index: v.index, appName: v.appName, badValue: JSON.stringify(badValue)?.slice(0, 200) };
    }

    const workflows = storage.load();
    const idx = workflows.findIndex(w => w.id === workflow.id);
    const isNew = idx < 0;

    if (isNew && !isUserAuthorized() && workflows.length >= FREE_LIMIT) {
      return { ok: false, reason: 'upgrade' };
    }

    // Store only the fields we expect — strip any extra keys
    const existing = idx >= 0 ? workflows[idx] : null;
    const safe = {
      id:   workflow.id,
      name: workflow.name,
      apps: workflow.apps.map(a => ({
        name:      a.name,
        ...(a.urlToOpen ? { urlToOpen: a.urlToOpen } : {}),
        ...(a.folderPath ? { folderPath: String(a.folderPath).slice(0, 512) } : {}),
        ...(a.labelFallback ? { labelFallback: String(a.labelFallback).slice(0, 256) } : {}),
        ...(a.filePath ? { filePath: String(a.filePath).slice(0, 512) } : {}),
        ...(a.profile && /^(Default|Profile [0-9]+)$/.test(a.profile) ? { profile: a.profile } : {}),
        ...(a.label ? { label: String(a.label).slice(0, 256) } : {}),
      })),
      // preserve existing hotkey — save-workflow doesn't touch it
      ...(existing?.hotkey ? { hotkey: existing.hotkey } : {}),
      ...(workflow.focusMode ? { focusMode: String(workflow.focusMode).slice(0, 128) } : {}),
      // closeApps is Pro-only — stripped server-side for free users regardless of what renderer sends
      ...(isUserAuthorized() && Array.isArray(workflow.closeApps) && workflow.closeApps.length > 0
        ? { closeApps: workflow.closeApps.map(a => ({
            name: String(a.name).slice(0, 128),
            ...(a.urlToOpen && isSafeUrl(a.urlToOpen) ? { urlToOpen: a.urlToOpen } : {}),
          })) }
        : {}),
    };

    if (idx >= 0) workflows[idx] = safe;
    else workflows.push(safe);
    storage.save(workflows);
    registerWorkflowShortcuts();
    return { ok: true };
  } catch (e) {
    console.error('[save-workflow]', e);
    return { ok: false, reason: 'internal_error' };
  }
});

ipcMain.handle('delete-workflow', (_, id) => {
  if (!isSafeId(id)) return { ok: false, reason: 'invalid_input' };
  const workflows = storage.load().filter(w => w.id !== id);
  storage.save(workflows);
  registerWorkflowShortcuts();
  return { ok: true };
});

ipcMain.handle('set-hotkey', (_, workflowId, accelerator) => {
  try {
    if (accelerator && !validateHotkeyStr(accelerator)) return { ok: false, reason: 'invalid' };
    const workflows = storage.load();
    const w = workflows.find(w => w.id === workflowId);
    if (!w) return { ok: false, reason: 'not_found' };
    if (accelerator) w.hotkey = accelerator; else delete w.hotkey;
    storage.save(workflows);
    registerWorkflowShortcuts();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'internal_error' };
  }
});

ipcMain.handle('get-license-status', () => ({ isPro, email: proEmail, offline: isOffline, homedir: require('os').homedir() }));

ipcMain.handle('validate-license', async (_, key) => {
  if (typeof key !== 'string' || key.length > 512 || key.length < 10) {
    return { ok: false, reason: 'invalid_key' };
  }
  const result = await activateLicense(key.trim());
  return { ok: result.valid, email: result.email, offline: result.offline || false, reason: result.reason };
});

ipcMain.handle('open-shortcuts-app', () => {
  shell.openExternal('shortcuts://').catch(() => {
    execFile('open', ['-a', 'Shortcuts'], () => {});
  });
});
ipcMain.handle('open-external', (_, url) => {
  if (!isSafeUrl(url)) return;
  shell.openExternal(url);
});

function callProfileProbe(action) {
  return new Promise(resolve => {
    const bin = profileProbePath();
    if (!require('fs').existsSync(bin)) {
      console.error('[profile-probe] binary missing at', bin);
      return resolve(null);
    }
    execFile(bin, [action], { timeout: 5000, maxBuffer: 1024 * 1024 * 4 },
      (err, stdout, stderr) => {
        if (err) {
          console.error('[profile-probe]', action, 'error:', err.message, 'stderr:', stderr);
          return resolve(null);
        }
        console.error('[profile-probe]', action, 'stdout:', String(stdout).slice(0, 200));
        try { resolve(JSON.parse(String(stdout || 'null'))); }
        catch (e) { resolve(null); }
      });
  });
}

ipcMain.handle('list-chrome-profiles', async () => {
  const fromHelper = await callProfileProbe('list');
  if (Array.isArray(fromHelper)) return fromHelper;
  // Fallback to JXA (dev before swiftc compile)
  return new Promise(resolve => {
    execFile(
      'osascript',
      ['-l', 'JavaScript', jxaPath('chrome_profiles.jxa'), 'list'],
      { timeout: 3000 },
      (err, stdout) => {
        if (err) return resolve([]);
        try { resolve(JSON.parse(String(stdout || '[]'))); }
        catch (e) { resolve([]); }
      }
    );
  });
});

ipcMain.handle('get-free-limit', () => FREE_LIMIT);

ipcMain.handle('install-update', () => autoUpdater.quitAndInstall());

ipcMain.handle('get-stripe-url', () => runtimeConfig.stripeUrl ?? null);

ipcMain.handle('get-login-item', () => app.getLoginItemSettings().openAtLogin);

ipcMain.handle('set-login-item', (_, enable) => {
  app.setLoginItemSettings({ openAtLogin: !!enable });
  return { ok: true };
});

ipcMain.handle('get-accessibility', () => hasAccessibility());

ipcMain.handle('request-accessibility', () => {
  requestAccessibility();
  return { ok: true };
});

ipcMain.handle('deactivate-license', () => {
  try {
    license.deactivate();
  } catch (err) {
    console.error('Deactivation error:', err);
  }
  isPro     = false;
  proEmail  = null;
  isOffline = false;
  if (win && !win.webContents.isDestroyed()) {
    win.webContents.send('license-status-changed', { isPro: false });
  }
  return { ok: true };
});

ipcMain.handle('send-feedback', async (_, { message, attachLogs }) => {
  if (typeof message !== 'string' || message.trim().length === 0) return { ok: false };
  message = message.slice(0, 10_000);

  const os = require('os');
  const fs = require('fs');

  let logSnippet = '';
  if (attachLogs) {
    const logPath = path.join(app.getPath('logs'), 'main.log');
    try {
      const raw = fs.readFileSync(logPath, 'utf8');
      logSnippet = raw.split('\n').slice(-50).join('\n');
    } catch (_) { logSnippet = '(no log file found)'; }
  }

  const body = [
    `Version: ${app.getVersion()}`,
    `macOS: ${os.release()}`,
    `Arch: ${process.arch}`,
    ``,
    message.trim(),
    attachLogs ? `\n--- Last 50 log lines ---\n${logSnippet}` : '',
  ].join('\n');

  // Feedback is delivered via the Val.town endpoint below (and the log attachment
  // is user-consented there). Don't duplicate the body — which can contain URLs,
  // window titles, and the user's email from the log tail — into Sentry.
  if (runtimeConfig.sentryDsn) {
    Sentry.captureMessage('[Feedback] received', { level: 'info' });
  }

  // Forward to the Val.town feedback endpoint, which holds the Resend key
  // server-side. No credentials in the client bundle.
  if (runtimeConfig.feedbackEndpoint) {
    try {
      const https = require('https');
      const url = new URL(runtimeConfig.feedbackEndpoint);
      const payload = JSON.stringify({
        version: app.getVersion(),
        message: message.trim(),
        body,
      });
      await new Promise((resolve) => {
        const req = https.request({
          hostname: url.hostname,
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
        }, (res) => { res.resume(); resolve(); });
        req.setTimeout(8000, () => { req.destroy(); resolve(); });
        req.on('error', resolve);
        req.write(payload);
        req.end();
      });
    } catch (_) {}
  }

  return { ok: true };
});

app.on('will-quit', () => globalShortcut.unregisterAll());
