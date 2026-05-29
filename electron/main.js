require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { app, BrowserWindow, Tray, ipcMain, nativeImage, shell, autoUpdater } = require('electron');
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

let tray      = null;
let win       = null;
let isPro     = false;
let proEmail  = null;
let isOffline = false;

function isUserAuthorized() {
  return isPro;
}

function createTrayIcon() {
  const iconPath = path.join(__dirname, '../public/brand/menubar-icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  icon.setTemplateImage(true);
  return icon;
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

  if (app.isPackaged) {
    const feedUrl = `https://update.electronjs.org/zyrxun/helm-releases/darwin-${process.arch}/${app.getVersion()}`;
    try {
      autoUpdater.setFeedURL({ url: feedUrl });
      autoUpdater.checkForUpdates();
    } catch (err) {
      console.error('Auto-updater error:', err);
    }
    autoUpdater.on('update-downloaded', (_, releaseNotes, releaseName) => {
      if (win && !win.webContents.isDestroyed()) {
        win.webContents.send('update-downloaded', { releaseName });
      }
    });
    autoUpdater.on('error', (err) => {
      console.error('Auto-updater error:', err);
    });
  }
});

// ── Input validation ──────────────────────────────────────────────────────────

const SAFE_STRING = /^[^\x00-\x1f\x7f"\\`$!|;&<>(){}[\]]*$/; // no shell metacharacters
const SAFE_URL    = /^https?:\/\//i;

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
  if (!Array.isArray(w.apps) || w.apps.length > 20) return false;
  for (const app of w.apps) {
    if (!app || typeof app !== 'object')         return false;
    if (!isSafeString(app.name, 128))            return false;
    if (app.urlToOpen !== undefined && app.urlToOpen !== null &&
        !isSafeUrl(app.urlToOpen))               return false;
  }
  return true;
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('get-workflows', () => storage.load());

ipcMain.handle('run-workflow', (_, workflowId) => {
  if (!isSafeId(workflowId)) return { ok: false, error: 'Invalid workflow id' };

  const workflows = storage.load();
  const workflow  = workflows.find(w => w.id === workflowId);
  if (!workflow) return { ok: false, error: 'Workflow not found' };

  workflow.apps.forEach(appTarget => {
    // Validate stored data before passing to shell — defense in depth
    if (!isSafeString(appTarget.name, 128)) return;
    const url = (appTarget.urlToOpen && isSafeUrl(appTarget.urlToOpen))
      ? appTarget.urlToOpen : '';
    // execFile avoids shell interpretation entirely — no injection possible
    execFile(
      'osascript',
      ['-l', 'JavaScript', jxaPath('launch.jxa'), appTarget.name, url],
      { maxBuffer: 1024 * 1024 * 10 },
      () => {}
    );
  });
  return { ok: true };
});

ipcMain.handle('capture-state', () => {
  return new Promise(resolve => {
    execFile(
      'osascript', ['-l', 'JavaScript', jxaPath('capture.jxa')],
      { maxBuffer: 1024 * 1024 * 10 },
      (err, stdout) => {
        if (err) return resolve({ ok: false, error: err.message });
        try {
          const data = JSON.parse(stdout.trim());
          resolve({ ok: true, apps: data.apps });
        } catch (e) {
          resolve({ ok: false, error: 'Failed to parse capture output' });
        }
      }
    );
  });
});

ipcMain.handle('save-workflow', (_, workflow) => {
  if (!validateWorkflow(workflow)) return { ok: false, reason: 'invalid_input' };

  const workflows = storage.load();
  const idx = workflows.findIndex(w => w.id === workflow.id);
  const isNew = idx < 0;

  if (isNew && !isUserAuthorized() && workflows.length >= FREE_LIMIT) {
    return { ok: false, reason: 'upgrade' };
  }

  // Store only the fields we expect — strip any extra keys
  const safe = {
    id:   workflow.id,
    name: workflow.name,
    apps: workflow.apps.map(a => ({
      name:      a.name,
      ...(a.urlToOpen ? { urlToOpen: a.urlToOpen } : {}),
      ...(a.spotifyUri ? { spotifyUri: String(a.spotifyUri).slice(0, 256) } : {}),
    })),
  };

  if (idx >= 0) workflows[idx] = safe;
  else workflows.push(safe);
  storage.save(workflows);
  return { ok: true };
});

ipcMain.handle('delete-workflow', (_, id) => {
  if (!isSafeId(id)) return { ok: false, reason: 'invalid_input' };
  const workflows = storage.load().filter(w => w.id !== id);
  storage.save(workflows);
  return { ok: true };
});

ipcMain.handle('get-license-status', () => ({ isPro, email: proEmail, offline: isOffline, homedir: require('os').homedir() }));

ipcMain.handle('validate-license', async (_, key) => {
  if (typeof key !== 'string' || key.length > 512 || key.length < 10) {
    return { ok: false, reason: 'invalid_key' };
  }
  const result = await activateLicense(key.trim());
  return { ok: result.valid, email: result.email, offline: result.offline || false, reason: result.reason };
});

ipcMain.handle('open-external', (_, url) => {
  if (!isSafeUrl(url)) return;
  shell.openExternal(url);
});

ipcMain.handle('get-free-limit', () => FREE_LIMIT);

ipcMain.handle('install-update', () => autoUpdater.quitAndInstall());

ipcMain.handle('get-stripe-url', () => process.env.HELM_STRIPE_URL ?? null);

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
