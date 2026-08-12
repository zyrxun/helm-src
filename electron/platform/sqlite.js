// Minimal read-only SQLite access for Chrome's History DB.
//
// Two engines, probed once at load: Node's built-in `node:sqlite` if this
// Electron ships it, otherwise a `sqlite3` CLI on PATH. macOS always has
// /usr/bin/sqlite3; Windows ships neither, so on Windows this resolves to
// node:sqlite or to nothing at all — and "nothing" is a supported state.
// Every caller must treat a null return as "no attribution available" and
// keep working, never as an error.

const { execFile } = require('child_process');
const fs = require('fs');

let engine;

function detectEngine() {
  if (engine !== undefined) return engine;
  try {
    const { DatabaseSync } = require('node:sqlite');
    if (typeof DatabaseSync === 'function') {
      engine = { kind: 'node', DatabaseSync };
      return engine;
    }
  } catch (_) { /* not built into this Electron */ }

  const candidates = process.platform === 'win32'
    ? ['sqlite3.exe', 'sqlite3']
    : ['/usr/bin/sqlite3', 'sqlite3'];
  for (const bin of candidates) {
    if (bin.includes('/') || bin.includes('\\')) {
      if (fs.existsSync(bin)) { engine = { kind: 'cli', bin }; return engine; }
    } else {
      engine = { kind: 'cli', bin };
      return engine;
    }
  }
  engine = null;
  return engine;
}

function available() {
  return detectEngine() !== null;
}

// Runs `sql` against `dbFile` and returns an array of row-value arrays
// (all values coerced to string), or null when no engine is usable.
// `sql` is built by callers from literals plus escaped values — never from
// raw user input concatenated blind.
function query(dbFile, sql) {
  const eng = detectEngine();
  if (!eng) return Promise.resolve(null);

  if (eng.kind === 'node') {
    try {
      const db = new eng.DatabaseSync(dbFile, { readOnly: true });
      try {
        const stmt = db.prepare(sql);
        // Chrome stores last_visit_time as microseconds since 1601, currently
        // ~1.3e16 — past Number.MAX_SAFE_INTEGER. Without this, node:sqlite
        // throws on the column instead of returning the row, and every caller
        // sees an empty result rather than an error. Values are stringified
        // below, so BigInt costs the callers nothing.
        stmt.setReadBigInts(true);
        const rows = stmt.all();
        return Promise.resolve(rows.map(r => Object.values(r).map(v => (v === null ? '' : String(v)))));
      } finally {
        try { db.close(); } catch (_) {}
      }
    } catch (e) {
      console.error('[sqlite] query failed:', e.message);
      return Promise.resolve(null);
    }
  }

  return new Promise(resolve => {
    execFile(eng.bin, [dbFile, sql], { timeout: 4000, maxBuffer: 1024 * 1024 * 8 },
      (err, stdout) => {
        if (err) return resolve(null);
        const rows = String(stdout)
          .split('\n')
          .filter(line => line.length > 0)
          .map(line => line.split('|'));
        resolve(rows);
      });
  });
}

// SQLite string literal escaping — doubles single quotes. Used to build the
// IN (...) clauses below; there is no parameter binding in the CLI path.
function quote(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

module.exports = { query, quote, available };
