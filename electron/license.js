const fs     = require("fs");
const path   = require("path");
const os     = require("os");
const crypto = require("crypto");
const { execSync } = require("child_process");
const { app } = require("electron");

const runtimeConfig = require("./runtime-config");

const DIR  = path.join(app.getPath("userData"), "Helm");
const FILE = path.join(DIR, "license.key");

const ACTIVATION_ENDPOINT = runtimeConfig.activationEndpoint || null;

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

function keyFingerprint(key) {
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 16);
}

// Verify a license key locally using the Ed25519 public key. The matching
// private key lives only on the server (Val.town `helmCheckout`), so seeing
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
    const publicKeyPem = runtimeConfig.licensePublicKey;
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

// ── Activation receipts (SF-2) ────────────────────────────────────────────────
// A valid license *signature* only proves the key was minted by us — it says
// nothing about the 2-machine cap, which is enforced server-side at activation.
// Before receipts, offline/endpoint-blocked clients granted Pro on the signature
// alone, so any user could keep a shared key working forever by blocking the
// activation endpoint (no client edit needed). A receipt closes that: the server
// issues a short-lived Ed25519-signed token only AFTER it has counted the machine
// against the cap, and the client grants *offline* Pro only while it holds a valid
// unexpired receipt bound to this key+machine. A brand-new key with no receipt
// must reach the server at least once.
//
// Rollout-safe: while `runtimeConfig.receiptPublicKey` is null (not yet
// generated/deployed), the client keeps the legacy signature-only offline grace,
// so nothing breaks until the founder turns it on (see SECURITY_REVIEW.md SF-2).
function receiptsEnforced() {
  return !!runtimeConfig.receiptPublicKey;
}

function verifyReceipt(receipt, key, machineId) {
  try {
    const pub = runtimeConfig.receiptPublicKey;
    if (!pub || typeof receipt !== "string") return { ok: false };
    const dot = receipt.indexOf(".");
    if (dot < 0) return { ok: false };
    const payloadBytes = Buffer.from(receipt.slice(0, dot), "base64url");
    const sigBytes     = Buffer.from(receipt.slice(dot + 1), "base64url");
    if (!crypto.verify(null, payloadBytes, pub, sigBytes)) return { ok: false };
    const p = JSON.parse(payloadBytes.toString("utf8"));
    if (p.k !== keyFingerprint(key)) return { ok: false, reason: "key_mismatch" };
    if (p.m !== machineId)           return { ok: false, reason: "machine_mismatch" };
    if (typeof p.exp !== "number" || p.exp * 1000 < Date.now()) return { ok: false, reason: "expired" };
    return { ok: true, exp: p.exp };
  } catch (e) {
    return { ok: false };
  }
}

// Decide whether to grant Pro locally at boot (no network). With receipts
// enforced, requires a valid unexpired receipt; otherwise falls back to the
// legacy signature-only behavior.
function localAuthorize(cached) {
  const local = verifyLocalSignature(cached && cached.key);
  if (!local.valid) return { valid: false };
  if (!receiptsEnforced()) {
    return { valid: true, email: local.email, offline: true };
  }
  const r = cached.receipt ? verifyReceipt(cached.receipt, cached.key, getMachineId()) : { ok: false };
  if (r.ok) return { valid: true, email: local.email, offline: true };
  return { valid: false, reason: "activation_required", email: local.email };
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
    if (res.ok && data.ok) {
      // data.receipt is present once the server is issuing them; undefined during
      // rollout (then we just keep whatever receipt we already had).
      return { valid: true, email: data.email, offline: false, receipt: data.receipt };
    }
    return { valid: false, reason: data.reason || "denied" };
  } catch (err) {
    // Network failure. Offline grace is allowed only with a valid receipt once
    // enforcement is on — otherwise this is the open bypass we're closing.
    if (!receiptsEnforced()) {
      return { valid: true, email: localCheck.email, offline: true };
    }
    const stored = load();
    if (stored.key === key && stored.receipt) {
      const r = verifyReceipt(stored.receipt, key, machineId);
      if (r.ok) return { valid: true, email: localCheck.email, offline: true, receipt: stored.receipt };
    }
    return { valid: false, reason: "activation_required" };
  }
}

function load() {
  if (!fs.existsSync(FILE)) return { key: null, machineId: null, receipt: null };
  const raw = fs.readFileSync(FILE, "utf8").trim();
  const parts = raw.split("|");
  if (parts.length === 1) return { key: raw, machineId: getMachineId(), receipt: null }; // legacy
  return {
    key:       (parts[0] || "").trim(),
    machineId: (parts[1] || "").trim(),
    receipt:   (parts[2] || "").trim() || null,
  };
}

// receipt: a string sets it, null clears it, undefined preserves the stored one.
function save(key, receipt) {
  fs.mkdirSync(DIR, { recursive: true });
  let r = receipt;
  if (r === undefined) {
    try { r = load().receipt; } catch (e) { r = null; }
  }
  const line = `${key.trim()}|${getMachineId()}` + (r ? `|${r}` : "");
  fs.writeFileSync(FILE, line, "utf8");
}

function deactivate() {
  if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
}

module.exports = {
  getMachineId, verifyLocalSignature, verifyReceipt, localAuthorize,
  receiptsEnforced, activate, load, save, deactivate,
};
