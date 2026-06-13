// Val.town: zyrxun/helmActivate
// Replace the existing val body with this content.
// Required Val.town env vars:
//   HELM_LICENSE_PUBLIC_KEY   (Ed25519 public key, PEM — verifies license keys)
//   HELM_RECEIPT_PRIVATE_KEY  (Ed25519 private key, PEM — signs activation receipts; SF-2)
// This val verifies license signatures (public key only — never the minting private
// key, which lives in helmCheckout) and, on success, signs a short-lived activation
// receipt the client needs for offline Pro. The receipt keypair is SEPARATE from the
// license keypair: helmActivate holds the receipt *private* key and the client embeds
// the matching receipt *public* key (runtime-config.js). If HELM_RECEIPT_PRIVATE_KEY
// is unset, no receipt is issued (rollout-safe; the client falls back to legacy
// offline grace until both sides are configured).
import { blob } from "https://esm.town/v/std/blob";
import {
  createHash, createPublicKey, createPrivateKey,
  verify as cryptoVerify, sign as cryptoSign, KeyObject,
} from "node:crypto";

// ── Activation receipt (SF-2) ─────────────────────────────────────────────────
// 60-day TTL; the client refreshes it on every successful online re-verify, so a
// machine that stays online keeps a fresh receipt and a machine offline longer than
// the TTL must reconnect once. Format: <base64url(JSON)>.<base64url(Ed25519 sig)>.
const RECEIPT_TTL_SEC = 60 * 24 * 60 * 60;
function issueReceipt(keyFp: string, machineId: string, priv: KeyObject): string {
  const payload = JSON.stringify({
    k: keyFp, m: machineId, exp: Math.floor(Date.now() / 1000) + RECEIPT_TTL_SEC,
  });
  const payloadBytes = Buffer.from(payload, "utf8");
  const sig = cryptoSign(null, payloadBytes, priv).toString("base64url");
  return `${payloadBytes.toString("base64url")}.${sig}`;
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
const WINDOW_MS    = 15 * 60 * 1000;
const MAX_ATTEMPTS = 15;

async function rateLimit(req: Request): Promise<Response | null> {
  const ip          = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  // Bucket key uses the same WINDOW_MS as the in-bucket sliding reset so the
  // two time constants agree — "MAX_ATTEMPTS per WINDOW_MS" means exactly that.
  const windowBucket = Math.floor(Date.now() / WINDOW_MS);
  const ipHash      = createHash("sha256").update(ip).digest("hex").slice(0, 12);
  const blobKey     = `helm_rl_${windowBucket}_${ipHash}`;
  const now         = Date.now();

  let record: { count: number; windowStart: number; v: number } =
    (await blob.getJSON(blobKey)) ?? { count: 0, windowStart: now, v: now };

  if (now - record.windowStart > WINDOW_MS) {
    record = { count: 0, windowStart: now, v: now };
  }

  if (record.count >= MAX_ATTEMPTS) {
    return Response.json({ ok: false, reason: "rate_limited" }, { status: 429 });
  }

  record.count++;
  const fresh: typeof record | null = await blob.getJSON(blobKey);

  if (fresh && fresh.v !== record.v) {
    const freshCount = fresh.count ?? 0;
    if (freshCount >= MAX_ATTEMPTS) {
      return Response.json({ ok: false, reason: "rate_limited" }, { status: 429 });
    }
    await blob.setJSON(blobKey, { count: freshCount + 1, windowStart: fresh.windowStart ?? now, v: Date.now() });
  } else {
    await blob.setJSON(blobKey, { count: record.count, windowStart: record.windowStart, v: Date.now() });
  }

  return null;
}

// ── PEM normalization ─────────────────────────────────────────────────────────
// Env-var UIs (Val.town included) often flatten a multi-line PEM into one line
// or insert literal "\n" — both of which createPublicKey rejects. Rebuild a
// canonical PEM from whatever survived, so the key loads regardless of mangling.
function normalizePem(raw: string, label: string): string {
  const body = String(raw)
    .replace(/\\[nrt]/g, "")
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/[^A-Za-z0-9+/=]/g, "");
  const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----\n`;
}

// ── Key verification ──────────────────────────────────────────────────────────
// Key format: HLM.<base64url email>.<nonce>.<base64url Ed25519 signature>.
// '.' is not a base64url character, so split is unambiguous.
function verifyKey(key: string, publicKey: KeyObject): { valid: boolean; email: string | null } {
  try {
    const parts = key.split(".");
    if (parts.length !== 4 || parts[0] !== "HLM") return { valid: false, email: null };
    const [, encodedEmail, nonce, signature] = parts;
    if (!encodedEmail || !nonce || !signature) return { valid: false, email: null };
    const message = Buffer.from(`HLM:${encodedEmail}:${nonce}`);
    const sig     = Buffer.from(signature, "base64url");
    const ok      = cryptoVerify(null, message, publicKey, sig);
    if (!ok) return { valid: false, email: null };
    const email = Buffer.from(encodedEmail, "base64url").toString("utf8");
    return { valid: true, email };
  } catch {
    return { valid: false, email: null };
  }
}

// ── Input validation ──────────────────────────────────────────────────────────
// key format: HLM-<base64url>-<8 hex>-<64 hex> — max ~200 chars in practice
const KEY_MAX       = 300;
const MACHINE_MAX   = 64;
const BODY_SIZE_MAX = 2048; // bytes

function isSafeKey(k: unknown): k is string {
  // HLM.<base64url email>.<8 hex nonce>.<86-char base64url Ed25519 sig>.
  return typeof k === "string" && k.length >= 10 && k.length <= KEY_MAX &&
    /^HLM\.[A-Za-z0-9_-]+\.[0-9a-f]{8}\.[A-Za-z0-9_-]{86}$/.test(k);
}

function isSafeMachineId(m: unknown): m is string {
  return typeof m === "string" && m.length >= 4 && m.length <= MACHINE_MAX &&
    /^[0-9a-f]+$/.test(m);
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  // Reject oversized bodies before reading
  const contentLength = parseInt(req.headers.get("content-length") ?? "0", 10);
  if (contentLength > BODY_SIZE_MAX) {
    return Response.json({ ok: false, reason: "payload_too_large" }, { status: 413 });
  }

  const limited = await rateLimit(req);
  if (limited) return limited;

  const publicPem = Deno.env.get("HELM_LICENSE_PUBLIC_KEY") ?? "";
  if (!publicPem) return Response.json({ ok: false, reason: "server_misconfigured" }, { status: 500 });
  let publicKey: KeyObject;
  try {
    publicKey = createPublicKey(normalizePem(publicPem, "PUBLIC KEY"));
  } catch {
    return Response.json({ ok: false, reason: "server_misconfigured" }, { status: 500 });
  }

  let body: { key?: unknown; machineId?: unknown };
  try {
    const raw = await req.text();
    if (raw.length > BODY_SIZE_MAX) {
      return Response.json({ ok: false, reason: "payload_too_large" }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  const { key, machineId } = body;
  if (!isSafeKey(key))        return Response.json({ ok: false, reason: "invalid_key" }, { status: 400 });
  if (!isSafeMachineId(machineId)) return Response.json({ ok: false, reason: "invalid_machine" }, { status: 400 });

  const { valid, email } = verifyKey(key, publicKey);
  if (!valid) return Response.json({ ok: false, reason: "invalid_key" }, { status: 403 });

  // Load the receipt signing key (optional during rollout). The receipt fingerprint
  // matches the client's keyFingerprint() = sha256(key)[:16].
  const keyFp = createHash("sha256").update(key).digest("hex").slice(0, 16);
  let receiptKey: KeyObject | null = null;
  const receiptPem = Deno.env.get("HELM_RECEIPT_PRIVATE_KEY") ?? "";
  if (receiptPem) {
    try { receiptKey = createPrivateKey(normalizePem(receiptPem, "PRIVATE KEY")); } catch { receiptKey = null; }
  }
  const receiptFor = (m: string) => (receiptKey ? issueReceipt(keyFp, m, receiptKey) : undefined);

  const activationKey = "helm_activation_" + keyFp;

  const existing: { machines: string[] } = (await blob.getJSON(activationKey)) ?? { machines: [] };

  if (existing.machines.includes(machineId)) {
    return Response.json({ ok: true, email, receipt: receiptFor(machineId) });
  }

  if (existing.machines.length >= 2) {
    return Response.json({ ok: false, reason: "limit_reached" }, { status: 403 });
  }

  const recheck: { machines: string[] } = (await blob.getJSON(activationKey)) ?? { machines: [] };
  if (!recheck.machines.includes(machineId) && recheck.machines.length >= 2) {
    return Response.json({ ok: false, reason: "limit_reached" }, { status: 403 });
  }

  const updated = { machines: Array.from(new Set([...recheck.machines, machineId])), email };
  await blob.setJSON(activationKey, updated);

  return Response.json({ ok: true, email, receipt: receiptFor(machineId) });
}
