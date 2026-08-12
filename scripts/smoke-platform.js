// End-to-end check of the platform backend, run under Electron so it exercises
// the same code the app does — not a reimplementation of it.
//
//   npx electron scripts/smoke-platform.js
//
// Read-only: captures and enriches, never launches, closes, or changes focus.
// On Windows the number that matters is the last line — how many browser rows
// recovered a URL. That is the title -> History match working or not.

const path = require('path');
const { app } = require('electron');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const platform = require(path.join(__dirname, '..', 'electron', 'platform'));
  const line = (k, v) => console.log(String(k).padEnd(26) + v);

  console.log('');
  console.log('Helm platform smoke test');
  console.log('='.repeat(62));
  line('backend', platform.id);
  line('electron / node', `${process.versions.electron} / ${process.versions.node}`);
  line('capabilities', JSON.stringify(platform.capabilities));
  line('automation permission', platform.hasAutomationPermission());

  const sqlite = require(path.join(__dirname, '..', 'electron', 'platform', 'sqlite'));
  line('sqlite engine', sqlite.available() ? 'available' : 'MISSING — no URL/profile recovery');

  try {
    const profiles = await platform.listChromeProfiles();
    line('chrome profiles', profiles.length);
    for (const p of profiles.slice(0, 8)) console.log('   '.padEnd(26) + `${p.dir} -> ${p.name}`);
  } catch (e) { line('chrome profiles', 'ERROR ' + e.message); }

  try {
    const modes = await platform.listFocusModes();
    line('focus modes', JSON.stringify(modes));
  } catch (e) { line('focus modes', 'ERROR ' + e.message); }

  console.log('-'.repeat(62));
  const t0 = Date.now();
  const res = await platform.capture();
  if (!res.ok) {
    console.log('CAPTURE FAILED: ' + res.error);
    return app.exit(1);
  }
  const apps = await platform.enrich(res.apps);
  line('capture', `${apps.length} rows in ${Date.now() - t0} ms`);
  console.log('');

  for (const a of apps) {
    const bits = [a.name];
    if (a.profile) bits.push(`[${a.profile}]`);
    const detail = a.urlToOpen || a.folderPath || a.filePath || a.label || a.tabTitle || '';
    console.log('  ' + bits.join(' ').padEnd(30) + String(detail).slice(0, 60));
  }

  console.log('');
  console.log('-'.repeat(62));
  const browserNames = new Set(['Google Chrome', 'Microsoft Edge']);
  const browserRows = apps.filter(a => browserNames.has(a.name));
  const withUrl = browserRows.filter(a => a.urlToOpen);
  const withProfile = browserRows.filter(a => a.profile);
  line('browser rows', browserRows.length);
  line('  recovered a URL', `${withUrl.length}/${browserRows.length}`);
  line('  attributed a profile', `${withProfile.length}/${browserRows.length}`);
  const noExe = apps.filter(a => !a.exePath && process.platform === 'win32');
  if (noExe.length) line('rows with no exePath', `${noExe.length} (cannot launch or close)`);
  console.log('');

  app.exit(0);
}).catch(e => {
  console.error('smoke test threw:', e);
  app.exit(1);
});
