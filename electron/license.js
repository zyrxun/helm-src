const fs     = require("fs");
const path   = require("path");
const os     = require("os");
const crypto = require("crypto");
const { execSync } = require("child_process");
const { app } = require("electron");

const DIR  = path.join(app.getPath("userData"), "Helm");
const FILE = path.join(DIR, "license.key");

const ACTIVATION_ENDPOINT = require('./runtime-config').activationEndpoint || null;

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

// Verify a license key locally using the Ed25519 public key. The matching
// private key lives only on the server (Val.town `helmActivate`), so seeing
// this code does not let an attacker mint valid keys.
//
// Key format: HLM.<base64url email>.<nonce>.<base64url signature>
// '.' is not a base64url character, so split is unambiguous.
function verifyLocalSignature(key) {
  try {
    if (typeof key !== "string") return { valid: false };
    const parts = key.split(".");
    if (parts.length !== 4 || parts[0] !== "HLM") return { valid: false };
    const [, encodedEmail, nonce, signature] = parts;
    if (!encodedEmail || !nonce || !signature) return { valid: false };
    const publicKeyPem = require('./runtime-config').licensePublicKey;
    if (!publicKeyPem) return { valid: false };
    const message  = Buffer.from(`HLM:${encodedEmail}:${nonce}`);
    const sigBytes = Buffer.from(signature, "base64url");
    const isValid  = crypto.verify(null, message, publicKeyPem, sigBytes);
    if (!isValid) return { valid: false };
    const email = Buffer.from(encodedEmail, "base64url").toString("utf8");
    return { valid: true, email };
  } catch (e) {
    return { valid: false };
  }
}

async function activate(key) {
  const localCheck = verifyLocalSignature(key);
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
    // Network failure — approve on the local Ed25519 signature check, flag offline.
    // NOTE: this is the offline-grace path. It cannot be forged (no private key
    // client-side) but it does mean the server-side device cap is unenforceable
    // while offline. See SECURITY_REVIEW.md SF-2 / AF-1.
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

module.exports = { getMachineId, verifyLocalSignature, activate, load, save, deactivate };
