// Chrome profile intelligence shared by macOS and Windows.
//
// Everything here is filesystem + SQLite only — no Apple Events, no Win32 —
// because Chrome stores the same `Local State` JSON and per-profile `History`
// DB on both platforms. Only the root directory differs, so callers inject it.
//
// Windows leans on this harder than macOS does: macOS can ask Chrome for a
// tab's URL directly over Apple Events, Windows cannot, so on Windows the
// History DB is the only way to turn a window title back into a URL.

const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite = require('./sqlite');

function localStatePath(root) {
  return path.join(root, 'Local State');
}

// Every display form Chrome might put in a window title → profile directory.
function loadProfileCatalog(root) {
  const byKey = new Map();
  const add = (key, dir) => {
    if (key && dir && !byKey.has(key)) byKey.set(key, dir);
  };
  try {
    const raw = fs.readFileSync(localStatePath(root), 'utf8');
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
      if (gaiaName && name && gaiaName !== name) add(`${gaiaName} (${name})`, dir);
      if (name && userName) add(`${name} (${userName})`, dir);
      if (name && gaiaName && gaiaName !== name) add(`${name} (${gaiaName})`, dir);
    }
  } catch (e) {
    console.error('[chrome] Local State read failed:', e.message);
  }
  return byKey;
}

// Flat [{dir, name}] for the renderer's profile picker.
function listProfiles(root) {
  try {
    const raw = fs.readFileSync(localStatePath(root), 'utf8');
    const data = JSON.parse(raw);
    const cache = (data.profile && data.profile.info_cache) || {};
    return Object.entries(cache)
      .filter(([dir]) => /^(Default|Profile [0-9]+)$/.test(dir))
      .map(([dir, info]) => ({
        dir,
        name: String((info && (info.gaia_given_name || info.name)) || dir),
      }));
  } catch (e) {
    return [];
  }
}

function profileDirFromWindowTitle(title, profilesByName) {
  if (!title) return null;
  // Chrome appends " – <display name>" (en-dash) to window titles when 2+
  // profiles are running.
  const dash = title.lastIndexOf(' – ');
  if (dash === -1) return null;
  const suffix = title.slice(dash + 3).trim();
  const base = suffix.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return profilesByName.get(suffix) || profilesByName.get(base) || null;
}

// Copies each profile's History into a fresh private temp dir before reading.
// Two reasons: Chrome holds a lock on the live file (fatal on Windows, flaky
// on macOS), and a predictable temp path would let a same-user process
// pre-seed a symlink at our target filename.
async function withHistoryCopies(root, fn) {
  const catalog = loadProfileCatalog(root);
  if (catalog.size === 0) return new Map();
  const profileDirs = Array.from(new Set(catalog.values()));

  let tmpRoot;
  try { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-hist-')); }
  catch (e) { return new Map(); }

  try {
    const copies = [];
    for (const dir of profileDirs) {
      const src = path.join(root, dir, 'History');
      if (!fs.existsSync(src)) continue;
      const tmp = path.join(tmpRoot, `${dir.replace(/[^\w.-]/g, '_')}.db`);
      try { fs.copyFileSync(src, tmp); } catch (e) { continue; }
      copies.push({ dir, db: tmp });
    }
    return await fn(copies);
  } finally {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
  }
}

// url → profileDir, deciding ties by most-recent visit.
async function profileMapForUrls(root, urls) {
  if (!urls.length) return new Map();
  if (!sqlite.available()) return new Map();

  return withHistoryCopies(root, async (copies) => {
    const byUrl = new Map(); // url → {dir, time}
    const inClause = urls.map(sqlite.quote).join(',');
    for (const { dir, db } of copies) {
      const rows = await sqlite.query(db,
        `SELECT url, MAX(last_visit_time) FROM urls WHERE url IN (${inClause}) GROUP BY url;`);
      if (!rows) continue;
      for (const [url, rawTime] of rows) {
        const t = parseInt(rawTime, 10);
        if (!url || !Number.isFinite(t)) continue;
        const prev = byUrl.get(url);
        if (!prev || t > prev.time) byUrl.set(url, { dir, time: t });
      }
    }
    const flat = new Map();
    for (const [url, { dir }] of byUrl) flat.set(url, dir);
    return flat;
  });
}

// Two URLs name the same page when they differ only in their query string.
// Tracking, session and redirect parameters change from visit to visit while
// the page a caption refers to stays put, so the query is the one component
// worth ignoring; the fragment is not, because SPAs route on it.
function pageIdentity(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '')}${u.hash}`;
  } catch (_) {
    return url;
  }
}

// The Windows-only direction: given tab titles scraped from window titles,
// recover each one's URL. Windows has no Apple Events, so the caption is the
// only key available — but History is keyed by URL, not by title, and captions
// are far from unique. Measured against a real 11-profile History: 27% of
// distinct titles match more than one URL, and once a title has two candidates
// only 58% of them are the same page; the rest are different pages, and one in
// eight is on a different site. Title length does not separate the two cases —
// a 65-character caption on that machine still matched 21 URLs across two
// hosts.
//
// So "newest visit wins" is a guess, and a wrong guess is written silently
// into a saved workflow and only surfaces when the workflow opens the wrong
// page. A title therefore resolves only when every History row sharing it
// names the same page. Everything else returns nothing and the row captures
// with its title and no URL — the same outcome as a page History has not
// flushed yet, which callers already handle. Non-http(s) rows count toward
// ambiguity — a caption shared with a chrome:// or extension page could name
// either window — but never win: SAFE_URL rejects those schemes downstream,
// so recovering one would only smuggle a dead link into the row.
//
// Returns title → {url, profileDir}; profileDir is null when the page is
// settled but several profiles have visited it, since picking one would be the
// same kind of guess.
async function urlMapForTitles(root, titles) {
  const lookup = titles.filter(t => typeof t === 'string' && t.trim().length);
  if (!lookup.length) return new Map();
  if (!sqlite.available()) return new Map();

  return withHistoryCopies(root, async (copies) => {
    const byTitle = new Map(); // title → {url, dir, time, identity, split, dirs}
    const inClause = lookup.map(sqlite.quote).join(',');
    for (const { dir, db } of copies) {
      // Deliberately unbounded: a row that would have been cut off is a row
      // that could have revealed the title as ambiguous, so truncating here
      // would turn a refusal into a wrong answer. The IN clause holds one
      // entry per open browser window, so the result stays small.
      const rows = await sqlite.query(db,
        `SELECT title, url, last_visit_time FROM urls
          WHERE title IN (${inClause}) AND last_visit_time > 0;`);
      if (!rows) continue;
      for (const [title, url, rawTime] of rows) {
        const t = parseInt(rawTime, 10);
        if (!title || !url || !Number.isFinite(t)) continue;
        const identity = pageIdentity(url);
        const prev = byTitle.get(title);
        if (!prev) {
          byTitle.set(title, { url, dir, time: t, identity, split: false, dirs: new Set([dir]) });
          continue;
        }
        if (identity !== prev.identity) prev.split = true;
        prev.dirs.add(dir);
        if (t > prev.time) { prev.url = url; prev.dir = dir; prev.time = t; }
      }
    }
    const flat = new Map();
    for (const [title, e] of byTitle) {
      if (e.split) {
        console.log('[chrome] caption matches more than one page, no URL recovered:', title);
        continue;
      }
      if (!/^https?:\/\//i.test(e.url)) continue;
      flat.set(title, { url: e.url, profileDir: e.dirs.size === 1 ? e.dir : null });
    }
    return flat;
  });
}

module.exports = {
  loadProfileCatalog,
  listProfiles,
  profileDirFromWindowTitle,
  profileMapForUrls,
  urlMapForTitles,
};
