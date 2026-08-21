// In dev, load .env for build-only secrets that some code paths reference.
// In a packaged app, .env is NOT shipped (see package.json build.files), and
// runtime config comes from electron/runtime-config.js instead.
if (!require('electron').app.isPackaged) {
  try { require('dotenv').config({ path: require('path').join(__dirname, '../.env') }); } catch (_) {}
}

const { app, BrowserWindow, Tray, Menu, ipcMain, shell, globalShortcut } = require('electron');
const { autoUpdater } = require('electron-updater');
const runtimeConfig = require('./runtime-config');

const path    = require('path');

// All OS automation goes through this. Backends live in electron/platform/;
// see that index.js for the contract they implement.
const platform = require('./platform');

const storage = require('./storage');
const license = require('./license');

const FREE_LIMIT = 2;
const IS_WINDOWS = process.platform === 'win32';

let tray      = null;
let win       = null;
let isPro     = false;
let proEmail  = null;
let isOffline = false;

function isUserAuthorized() {
  return isPro;
}

function hasAccessibility() {
  return platform.hasAutomationPermission();
}

function requestAccessibility() {
  platform.requestAutomationPermission();
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
  const { screen } = require('electron');
  const windowBounds = win.getBounds();

  // Windows tray-icon bounds are unreliable — an icon in the overflow flyout
  // reports the flyout's position, not the taskbar slot, so the tray-anchored
  // maths below can land the popover partly off-screen or behind the taskbar,
  // where a frameless blur-to-hide window can't be dragged back into view.
  // Anchor to the work-area corner nearest the cursor instead: the user just
  // clicked the tray, so the cursor is over the right monitor, and workArea
  // already excludes the taskbar so the popover is always fully clickable.
  if (IS_WINDOWS) {
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const margin = 8;
    const x = area.x + area.width - windowBounds.width - margin;
    const y = area.y + area.height - windowBounds.height - margin;
    return { x, y };
  }

  const trayBounds   = tray.getBounds();
  const display = screen.getDisplayMatching(trayBounds).workArea;

  let x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2);
  // The Windows tray sits at the bottom of the screen, so the popover has to
  // open upward from the icon instead of downward as it does on the Mac menu
  // bar. Decide from where the tray actually is, not from the platform, since
  // Windows users move the taskbar.
  const opensDownward = trayBounds.y < display.y + display.height / 2;
  let y = opensDownward
    ? Math.round(trayBounds.y + trayBounds.height + 4)
    : Math.round(trayBounds.y - windowBounds.height - 4);

  // Keep the popover on screen when the tray icon is near a corner.
  x = Math.max(display.x, Math.min(x, display.x + display.width - windowBounds.width));
  y = Math.max(display.y, Math.min(y, display.y + display.height - windowBounds.height));
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

// Registering the scheme from a dev run on Windows needs the interpreter plus
// the script path; a packaged build is its own executable and needs neither.
if (IS_WINDOWS && !app.isPackaged) {
  app.setAsDefaultProtocolClient('helm', process.execPath, [path.resolve(process.argv[1] ?? '')]);
} else {
  app.setAsDefaultProtocolClient('helm');
}

function handleDeepLink(url) {
  try {
    const u   = new URL(url);
    const key = u.searchParams.get('key');
    if (u.hostname !== 'activate' || !key) return;
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
  } catch (e) { /* malformed URL */ }
}

// macOS delivers deep links as an event to the running app. Windows launches a
// second copy of the executable with the URL in argv, so the first instance has
// to hold a lock and read the relaunch arguments.
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

if (IS_WINDOWS) {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
  } else {
    app.on('second-instance', (_event, argv) => {
      const link = argv.find(a => typeof a === 'string' && a.startsWith('helm://'));
      if (link) handleDeepLink(link);
      else if (win) {
        const { x, y } = getWindowPosition();
        win.setPosition(x, y, false);
        win.show();
        win.focus();
      }
    });
  }
}

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

  // A deep link that starts the app arrives in this instance's argv, not
  // through second-instance. Runs after the license phase above so isPro is
  // already known and the "never overwrite a valid license" guard applies.
  if (IS_WINDOWS) {
    const coldLink = process.argv.find(a => typeof a === 'string' && a.startsWith('helm://'));
    if (coldLink) handleDeepLink(coldLink);
  }

  tray = new Tray(platform.trayIcon());
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
    ...platform.windowOptions(),
    webPreferences: {
      backgroundThrottling: true,
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  if (IS_WINDOWS) {
    win.removeMenu();
    win.autoHideMenuBar = true;
  }

  win.loadFile(path.join(__dirname, '../public/index.html'));
  hardenNavigation(win);
  // The macOS menu-bar popover hides as soon as it loses focus. The Windows
  // build is a real draggable, resizable window, so blur-to-hide would fight
  // dragging and resizing and make it vanish the moment the user clicks a save
  // prompt behind it. On Windows it hides only via the tray toggle or its own
  // close button.
  if (!IS_WINDOWS) win.on('blur', () => win.hide());

  win.on('show', () => {
    if (!win.webContents.isDestroyed()) win.webContents.send('window-visibility', 'visible');
  });
  win.on('hide', () => {
    if (!win.webContents.isDestroyed()) win.webContents.send('window-visibility', 'hidden');
  });
  win.on('closed', () => { win = null; });

  platform.hideFromTaskbar();
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
      // hiddenInset degrades to 'hidden' on Windows, which strips the caption
      // buttons and leaves the user with no way to close this window.
      ...(IS_WINDOWS ? { title: 'Welcome to Helm' } : { titleBarStyle: 'hiddenInset' }),
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

// Filesystem paths. On macOS these end up inside doShellScript, so they keep
// the strict no-shell-metacharacter rule above.
//
// Windows paths legitimately contain backslashes and colons, which that rule
// rejects outright, so Windows gets its own filter. Relaxing it is only sound
// because the Windows backend never sends a path through a shell: it spawns
// argv arrays with shell:false. The characters still barred are the ones
// Windows itself forbids in paths, plus quotes.
const WINDOWS_PATH = /^[^\x00-\x1f\x7f"|<>*?]+$/;

function isSafePath(s, maxLen = 512) {
  if (typeof s !== 'string' || s.length === 0 || s.length > maxLen) return false;
  return IS_WINDOWS ? WINDOWS_PATH.test(s) : SAFE_STRING.test(s);
}

// Executables are spawned directly, so this is the highest-value check in the
// file. `.exe` only: handing spawn() a .bat or .cmd re-enters cmd.exe and
// reintroduces shell parsing of the arguments (CVE-2024-27980), and .lnk/.scr
// would let a workflow file point at anything at all.
function isSafeExePath(s) {
  return isSafePath(s, 512) && /\.exe$/i.test(s);
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
        !isSafePath(app.folderPath, 512))           return at('app.folderPath');
    if (app.labelFallback !== undefined &&
        !isSafeDisplayString(app.labelFallback, 256)) return at('app.labelFallback');
    if (app.filePath !== undefined &&
        !isSafePath(app.filePath, 512))             return at('app.filePath');
    if (app.exePath !== undefined && app.exePath !== '' &&
        !isSafeExePath(app.exePath))                return at('app.exePath');
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
    .map(a => closeTargetFrom(a));

  const ctx = await platform.prepareCloseContext(targets);
  await Promise.all(targets.map(t => platform.close(t, ctx)));

  if (workflow.focusMode && isSafeString(workflow.focusMode, 128)) {
    platform.setFocusMode(workflow.focusMode, false).then(res => {
      if (!res.ok && win && !win.webContents.isDestroyed()) {
        win.webContents.send('workflow-warning', {
          type: 'FOCUS_DISABLE_SHORTCUT_MISSING',
          mode: workflow.focusMode
        });
      }
    });
  }

  return { ok: true };
}

// workflows.json is editable on disk, so every field is re-validated at
// execution time rather than trusting the save-time check alone.
function closeTargetFrom(a) {
  return {
    name: a.name,
    url: (a.urlToOpen && isSafeUrl(a.urlToOpen)) ? a.urlToOpen : '',
    profile: (a.profile && /^(Default|Profile [0-9]+)$/.test(a.profile)) ? a.profile : '',
    exePath: (a.exePath && isSafeExePath(a.exePath)) ? a.exePath : '',
    label: (a.label && isSafeDisplayString(a.label, 256)) ? a.label : '',
  };
}

async function runWorkflowById(workflowId) {
  if (!isSafeId(workflowId)) return { ok: false, error: 'Invalid workflow id' };
  if (!hasAccessibility()) return { ok: false, error: 'accessibility_denied' };

  const workflows = storage.load();
  const workflow  = workflows.find(w => w.id === workflowId);
  if (!workflow) return { ok: false, error: 'Workflow not found' };

  // 1. Close apps — fully resolved before any launch begins
  if (Array.isArray(workflow.closeApps) && workflow.closeApps.length > 0) {
    const closeTargets = workflow.closeApps
      .filter(a => a && isSafeDisplayString(a.name, 128))
      .map(a => closeTargetFrom(a));
    const ctx = await platform.prepareCloseContext(closeTargets);
    await Promise.all(closeTargets.map(t => platform.close(t, ctx)));
  }

  // 2. Open apps
  workflow.apps.forEach(appTarget => {
    if (!isSafeDisplayString(appTarget.name, 128)) return;
    // Re-validated here for the same reason as teardown: the file on disk is
    // user-editable, so the save-time check is not the security boundary.
    const folderPath = (appTarget.folderPath && isSafePath(appTarget.folderPath, 512))
      ? appTarget.folderPath : '';
    const target = {
      name: appTarget.name,
      // macOS's launch.jxa takes a folder path in the URL slot; the Windows
      // backend reads folderPath directly, so send both and let it choose.
      url: folderPath || (appTarget.urlToOpen && isSafeUrl(appTarget.urlToOpen) ? appTarget.urlToOpen : ''),
      folderPath,
      filePath: (appTarget.filePath && isSafePath(appTarget.filePath, 512)) ? appTarget.filePath : '',
      profile: (appTarget.profile && /^(Default|Profile [0-9]+)$/.test(appTarget.profile))
        ? appTarget.profile : '',
      exePath: (appTarget.exePath && isSafeExePath(appTarget.exePath)) ? appTarget.exePath : '',
    };
    platform.launch(target).then(res => {
      if (!res.ok && win && !win.webContents.isDestroyed()) {
        win.webContents.send('workflow-warning', {
          type: 'LAUNCH_FAILED',
          appName: appTarget.name,
        });
      }
    });
  });

  // 3. Trigger Focus mode concurrently — failure sends a warning to the renderer
  if (workflow.focusMode && isSafeString(workflow.focusMode, 128)) {
    platform.setFocusMode(workflow.focusMode, true).then(res => {
      if (!res.ok && win && !win.webContents.isDestroyed()) {
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
ipcMain.handle('get-focus-modes', () => platform.listFocusModes());

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

ipcMain.handle('capture-state', async () => {
  const result = await platform.capture();
  if (!result.ok) return result;

  // Strip any URLs that aren't safe schemes — Spotify track IDs, chrome://, etc.
  const apps = (result.apps || [])
    .filter(a => a && typeof a.name === 'string' && a.name.trim().length > 0)
    .map(a => {
      if (a.urlToOpen && !isSafeUrl(a.urlToOpen)) {
        const { urlToOpen, ...rest } = a;
        return rest;
      }
      return a;
    });

  try {
    return { ok: true, apps: await platform.enrich(apps) };
  } catch (e) {
    return { ok: true, apps };
  }
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
        // Windows relaunches by executable path because there is no
        // Application("<name>") equivalent to resolve a name back to a binary.
        ...(a.exePath && isSafeExePath(a.exePath) ? { exePath: a.exePath } : {}),
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

ipcMain.handle('open-shortcuts-app', () => platform.openFocusHelp());

// Windows 10 files every new tray icon into the overflow flyout and offers no
// API to promote one, so the welcome flow hands the user the settings page that
// can. The URI is a literal on purpose: nothing the renderer sends reaches
// openExternal here. No-op off Windows, where the scheme does not exist.
ipcMain.handle('open-taskbar-settings', () => {
  if (!IS_WINDOWS) return;
  shell.openExternal('ms-settings:taskbar');
});

ipcMain.handle('open-external', (_, url) => {
  if (!isSafeUrl(url)) return;
  shell.openExternal(url);
});

ipcMain.handle('list-chrome-profiles', () => platform.listChromeProfiles());

// Lets the renderer hide controls this platform cannot deliver instead of
// offering them and failing at run time.
ipcMain.handle('get-platform', () => ({
  id: platform.id,
  capabilities: platform.capabilities,
}));

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

ipcMain.handle('send-feedback', async (_, { message, email, attachLogs }) => {
  if (typeof message !== 'string' || message.trim().length === 0) return { ok: false };
  message = message.slice(0, 10_000);
  const replyEmail = typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ? email.trim().slice(0, 254)
    : '';

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
    `OS: ${IS_WINDOWS ? 'Windows' : 'macOS'} ${os.release()}`,
    `Arch: ${process.arch}`,
    ``,
    message.trim(),
    attachLogs ? `\n--- Last 50 log lines ---\n${logSnippet}` : '',
  ].join('\n');

  // Forward to the Val.town feedback endpoint, which holds the Resend key
  // server-side. No credentials in the client bundle.
  if (runtimeConfig.feedbackEndpoint) {
    try {
      const https = require('https');
      const url = new URL(runtimeConfig.feedbackEndpoint);
      const payload = JSON.stringify({
        version: app.getVersion(),
        message: message.trim(),
        email: replyEmail,
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
