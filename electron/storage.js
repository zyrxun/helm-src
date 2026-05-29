const fs   = require("fs");
const path = require("path");
const { app } = require("electron");

const DIR  = path.join(app.getPath("userData"), "Helm");
const FILE = path.join(DIR, "workflows.json");

function load() {
  if (!fs.existsSync(FILE)) {
    fs.mkdirSync(DIR, { recursive: true });
    // Seed from compiled config on first run
    const { userWorkflows } = require("../dist/config");
    fs.writeFileSync(FILE, JSON.stringify(userWorkflows, null, 2));
  }
  return JSON.parse(fs.readFileSync(FILE, "utf8"));
}

function save(workflows) {
  fs.writeFileSync(FILE, JSON.stringify(workflows, null, 2));
}

module.exports = { load, save };
