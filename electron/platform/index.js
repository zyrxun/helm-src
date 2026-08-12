// Platform dispatcher. main.js talks only to this module, never to osascript
// or powershell directly, so adding a platform means adding a backend here
// rather than threading conditionals through the IPC layer.
//
// Every backend exports the same contract:
//
//   id                          'darwin' | 'win32'
//   capabilities                what this platform can actually do (below)
//   capture()                   → {ok, apps} | {ok:false, error}
//   enrich(apps)                → apps, with app-specific detail filled in
//   launch(target)              → {ok}
//   prepareCloseContext(targets)→ opaque ctx handed to each close()
//   close(target, ctx)          → void
//   listFocusModes()            → string[]
//   setFocusMode(mode, enable)  → {ok}
//   openFocusHelp()             → void
//   listChromeProfiles()        → [{dir, name}]
//   hasAutomationPermission()   → boolean
//   requestAutomationPermission()
//   windowOptions()             → partial BrowserWindow options
//   trayIcon()                  → NativeImage
//   hideFromTaskbar()
//
// `capabilities` exists so the renderer can hide controls that cannot work
// rather than offering them and failing. Claiming a feature the platform
// cannot deliver is worse than not shipping it.

const UNSUPPORTED = {
  id: process.platform,
  capabilities: {
    perTabCapture: false,
    perTabClose: false,
    focusModes: false,
    chromeProfiles: false,
    needsPermissionGrant: false,
  },
  capture: () => Promise.resolve({ ok: false, error: `Helm does not support ${process.platform} yet` }),
  enrich: (apps) => Promise.resolve(apps),
  launch: () => Promise.resolve({ ok: false }),
  prepareCloseContext: () => Promise.resolve({}),
  close: () => Promise.resolve(),
  listFocusModes: () => Promise.resolve([]),
  setFocusMode: () => Promise.resolve({ ok: false }),
  openFocusHelp: () => {},
  listChromeProfiles: () => Promise.resolve([]),
  hasAutomationPermission: () => true,
  requestAutomationPermission: () => {},
  windowOptions: () => ({ backgroundColor: '#0A1628' }),
  trayIcon: () => require('electron').nativeImage.createEmpty(),
  hideFromTaskbar: () => {},
};

function loadBackend() {
  if (process.platform === 'darwin') return require('./darwin');
  if (process.platform === 'win32') return require('./win32');
  return UNSUPPORTED;
}

module.exports = loadBackend();
