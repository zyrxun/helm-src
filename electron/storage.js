const fs   = require("fs");
const path = require("path");
const { app } = require("electron");

const DIR  = path.join(app.getPath("userData"), "Helm");
const FILE = path.join(DIR, "workflows.json");

const DEFAULT_WORKFLOWS = [];

function load() {
  if (!fs.existsSync(FILE)) {
    try {
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(DEFAULT_WORKFLOWS, null, 2));
    } catch (e) {
      console.error('[storage] init failed:', e);
    }
    return DEFAULT_WORKFLOWS;
  }
  const raw = fs.readFileSync(FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    const backup = path.join(DIR, `workflows.corrupted.${Date.now()}.json`);
    console.error('[storage] corrupted workflows.json — backing up to', backup);
    try {
      fs.writeFileSync(backup, raw);
      fs.writeFileSync(FILE, JSON.stringify(DEFAULT_WORKFLOWS, null, 2));
    } catch (writeErr) {
      console.error('[storage] backup/reset failed:', writeErr);
    }
    return DEFAULT_WORKFLOWS;
  }
}

function save(workflows) {
  const tmp = `${FILE}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(workflows, null, 2));
  fs.renameSync(tmp, FILE);
}

module.exports = { load, save };
