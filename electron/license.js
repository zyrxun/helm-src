const fs     = require("fs");
const path   = require("path");
const os     = require("os");
const crypto = require("crypto");
const { execSync } = require("child_process");
const { app } = require("electron");

const DIR  = path.join(app.getPath("userData"), "Helm");
const FILE = path.join(DIR, "license.key");

// Set this to your Val.town endpoint once deployed
const ACTIVATION_ENDPOINT = process.env.HELM_ACTIVATION_ENDPOINT || null;

function getMachineId() {
  try {
    const out  = execSync(
      "ioreg -rd1 -c IOPlatformExpertDevice | awk '/IOPlatformUUID/ { print $4 }'"
    ).toString();
    const uuid = out.replace(/"/g, "").trim();
    return crypto.createHash("sha256").update(uuid).digest("hex").slice(0, 16);
  } catch (e) {
    return crypto.createHash("sha256").update(os.homedir()).digest("hex").slice(0, 16);
  }
}

function validateLocalHmac(key) {
  try {
    const [prefix, encodedEmail, nonce, signature] = key.split("-");
    if (prefix !== "HLM" || !encodedEmail || !nonce || !signature) return { valid: false };
    const email    = Buffer.from(encodedEmail, "base64url").toString("utf8");
    const secret   = process.env.HELM_LICENSE_SECRET;
    if (!secret) return { valid: false };
    const message  = `HLM:${encodedEmail}:${nonce}`;
    const expected = crypto.createHmac("sha256", secret).update(message).digest("hex");
    if (signature.length !== expected.length) return { valid: false };
    const isValid  = crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected,  "hex")
    );
    return { valid: isValid, email: isValid ? email : null };
  } catch (e) {
    return { valid: false };
  }
}

async function activate(key) {
  const localCheck = validateLocalHmac(key);
  if (!localCheck.valid) return { valid: false, reason: "invalid_key" };

  // No endpoint configured — offline-only mode (dev / pre-deploy)
  if (!ACTIVATION_ENDPOINT) {
    return { valid: true, email: localCheck.email, offline: true };
  }

  const machineId = getMachineId();
  try {
    const res  = await fetch(ACTIVATION_ENDPOINT, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ key, machineId }),
      signal:  AbortSignal.timeout(8000),
    });
    const data = await res.json();
    if (res.ok && data.ok) return { valid: true, email: data.email, offline: false };
    return { valid: false, reason: data.reason || "denied" };
  } catch (err) {
    // Network failure — approve on local HMAC, flag offline
    return { valid: true, email: localCheck.email, offline: true };
  }
}

function load() {
  if (!fs.existsSync(FILE)) return { key: null, machineId: null };
  const raw = fs.readFileSync(FILE, "utf8").trim();
  if (!raw.includes("|")) return { key: raw, machineId: getMachineId() }; // legacy migration
  const [key, machineId] = raw.split("|");
  return { key: key.trim(), machineId: machineId.trim() };
}

function save(key) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(FILE, `${key.trim()}|${getMachineId()}`, "utf8");
}

function deactivate() {
  if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
}

module.exports = { getMachineId, validateLocalHmac, activate, load, save, deactivate };
