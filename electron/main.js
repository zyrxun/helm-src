require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, systemPreferences, globalShortcut } = require('electron');
const { autoUpdater } = require('electron-updater');

const Sentry = require('@sentry/electron/main');
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: app.isPackaged ? 'production' : 'development',
    tracesSampleRate: 1.0,
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
        const codeEntries = files.map(f => ({ name: 'Code', filePath: f.filePath, label: f.label }));
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

function hasAccessibility() {
  // isTrustedAccessibilityClient is unreliable for unsigned apps — it checks
  // code signatures and returns false even when TCC has granted access.
  // Instead, attempt an actual accessibility API call and treat success as granted.
  try {
    const { execFileSync } = require('child_process');
    execFileSync('osascript', ['-l', 'JavaScript', '-e',
      'Application("System Events").processes.whose({backgroundOnly:false}).name()'],
      { timeout: 3000, stdio: 'pipe' });
    return true;
  } catch (e) {
    return false;
  }
}

function requestAccessibility() {
  // Prompts macOS to show the Accessibility permission dialog
  systemPreferences.isTrustedAccessibilityClient(true);
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
    license.save(key);
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
    if (u.hostname === 'activate' && key) activateLicense(key);
  } catch (e) { /* malformed URL */ }
});

app.whenReady().then(async () => {
  // Phase 1: fast local HMAC check — unblocks UI immediately
  const cached = license.load();
  if (cached.key) {
    const local = license.validateLocalHmac(cached.key);
    if (local.valid) { isPro = true; proEmail = local.email; }

    // Phase 2: background server re-verify — never blocks startup, fails safe
    license.activate(cached.key).then(result => {
      if (!result.valid && result.reason === 'limit_reached') {
        isPro = false; proEmail = null;
        if (win) win.webContents.send('license-status-changed', { isPro: false, reason: 'limit_reached' });
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
    },
  });

  win.loadFile(path.join(__dirname, '../public/index.html'));
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
        preload: path.join(__dirname, 'preload.js'),
      },
    });
    welcome.loadFile(path.join(__dirname, '../public/welcome.html'));
    welcome.show();
  }

  if (app.isPackaged) {
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: 'https://pub-ec64f4f5098d43328a5073456b0d41ab.r2.dev',
    });
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false;
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
const SAFE_URL    = /^(https?|notion|slack|figma|obsidian):\/\//i;

function isSafeString(s, maxLen = 256) {
  return typeof s === 'string' && s.length > 0 && s.length <= maxLen && SAFE_STRING.test(s);
}

function isSafeUrl(u, maxLen = 2048) {
  return typeof u === 'string' && u.length <= maxLen && SAFE_URL.test(u);
}

function isSafeId(s) {
  return typeof s === 'string' && /^[\w-]{1,128}$/.test(s);
}

function validateWorkflow(w) {
  if (!w || typeof w !== 'object') return false;
  if (!isSafeId(w.id))                          return false;
  if (!isSafeString(w.name, 128))               return false;
  if (!Array.isArray(w.apps) || w.apps.length > 100) return false;
  for (const app of w.apps) {
    if (!app || typeof app !== 'object')         return false;
    if (!isSafeString(app.name, 128))            return false;
    if (app.urlToOpen !== undefined && app.urlToOpen !== null &&
        !isSafeUrl(app.urlToOpen))               return false;
    if (app.folderPath !== undefined &&
        !isSafeString(app.folderPath, 512))      return false;
    if (app.labelFallback !== undefined &&
        !isSafeString(app.labelFallback, 256))   return false;
    if (app.filePath !== undefined &&
        !isSafeString(app.filePath, 512))        return false;
  }
  if (w.focusMode !== undefined && !isSafeString(w.focusMode, 128)) return false;
  if (w.closeApps !== undefined) {
    if (!Array.isArray(w.closeApps) || w.closeApps.length > 50) return false;
    for (const a of w.closeApps) {
      if (!a || typeof a !== 'object') return false;
      if (!isSafeString(a.name, 128)) return false;
      if (a.urlToOpen !== undefined && !isSafeUrl(a.urlToOpen)) return false;
    }
  }
  return true;
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
  isTeardownModeActive = !!on;
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
    .filter(a => a && isSafeString(a.name, 128))
    .map(a => ({ name: a.name.replace(/'/g, '') }));
  await Promise.all(targets.map(a =>
    new Promise(resolve => {
      const closeArgs = ['-l', 'JavaScript', jxaPath('close.jxa'), a.name];
      if (a.urlToOpen && isSafeUrl(a.urlToOpen)) closeArgs.push(a.urlToOpen);
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
    const closeTargets = workflow.closeApps.filter(a => a && isSafeString(a.name, 128));
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
    if (!isSafeString(appTarget.name, 128)) return;
    const url = appTarget.folderPath
      ? appTarget.folderPath
      : (appTarget.urlToOpen && isSafeUrl(appTarget.urlToOpen) ? appTarget.urlToOpen : '');
    const args = ['-l', 'JavaScript', jxaPath('launch.jxa'), appTarget.name, url];
    if (appTarget.filePath && isSafeString(appTarget.filePath, 512)) args.push(appTarget.filePath);
    execFile('osascript', args, { maxBuffer: 1024 * 1024 * 10 }, () => {});
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

ipcMain.handle('run-workflow', (_, workflowId) => runWorkflowById(workflowId));

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
          let apps = (data.apps || []).map(a => {
            if (a.urlToOpen && !isSafeUrl(a.urlToOpen)) {
              const { urlToOpen, ...rest } = a;
              return rest;
            }
            return a;
          });
          // Enrich Slack (channel deep link) and Code (open files) via local app state
          enrichSlackApps(apps)
            .then(enrichCodeApps)
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
    if (!validateWorkflow(workflow)) return { ok: false, reason: 'invalid_input' };

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
        ...(a.spotifyUri ? { spotifyUri: String(a.spotifyUri).slice(0, 256) } : {}),
        ...(a.folderPath ? { folderPath: String(a.folderPath).slice(0, 512) } : {}),
        ...(a.labelFallback ? { labelFallback: String(a.labelFallback).slice(0, 256) } : {}),
        ...(a.filePath ? { filePath: String(a.filePath).slice(0, 512) } : {}),
      })),
      // preserve existing hotkey — save-workflow doesn't touch it
      ...(existing?.hotkey ? { hotkey: existing.hotkey } : {}),
      ...(workflow.focusMode ? { focusMode: String(workflow.focusMode).slice(0, 128) } : {}),
      // closeApps is Pro-only — stripped server-side for free users regardless of what renderer sends
      ...(isUserAuthorized() && Array.isArray(workflow.closeApps) && workflow.closeApps.length > 0
        ? { closeApps: workflow.closeApps.map(a => ({ name: String(a.name).slice(0, 128) })) }
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

ipcMain.handle('get-free-limit', () => FREE_LIMIT);

ipcMain.handle('install-update', () => autoUpdater.quitAndInstall());

ipcMain.handle('get-stripe-url', () => process.env.HELM_STRIPE_URL ?? null);

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

  if (process.env.SENTRY_DSN) {
    Sentry.captureMessage(`[Feedback] ${message.trim().slice(0, 120)}`, {
      level: 'info',
      extra: { body },
    });
  }

  const to = process.env.HELM_FEEDBACK_EMAIL;
  if (to && process.env.RESEND_API_KEY) {
    try {
      const https = require('https');
      const payload = JSON.stringify({
        from: 'Helm Feedback <onboarding@resend.dev>',
        to,
        subject: `Helm Beta Feedback — v${app.getVersion()}`,
        text: body,
      });
      await new Promise((resolve) => {
        const req = https.request({
          hostname: 'api.resend.com', path: '/emails', method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
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
