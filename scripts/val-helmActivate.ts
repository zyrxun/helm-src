// Val.town: zyrxun/helmActivate
// Replace the existing val body with this content.
// Required Val.town env vars:
//   HELM_LICENSE_SECRET  (set in Val.town environment — do not hardcode here)
import { blob } from "https://esm.town/v/std/blob";
import { createHmac, createHash, timingSafeEqual } from "node:crypto";

// ── Rate limiting ─────────────────────────────────────────────────────────────
const WINDOW_MS    = 15 * 60 * 1000;
const MAX_ATTEMPTS = 15;

async function rateLimit(req: Request): Promise<Response | null> {
  const ip          = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const currentHour = Math.floor(Date.now() / (60 * 60 * 1000));
  const ipHash      = createHash("sha256").update(ip).digest("hex").slice(0, 12);
  const blobKey     = `helm_rl_${currentHour}_${ipHash}`;
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

// ── Key verification ──────────────────────────────────────────────────────────
function verifyKey(key: string, secret: string): { valid: boolean; email: string | null } {
  try {
    const parts = key.split("-");
    if (parts.length !== 4) return { valid: false, email: null };
    const [prefix, encodedEmail, nonce, signature] = parts;
    if (prefix !== "HLM" || !encodedEmail || nonce.length !== 8 || signature.length !== 64) {
      return { valid: false, email: null };
    }
    const message  = `HLM:${encodedEmail}:${nonce}`;
    const expected = createHmac("sha256", secret).update(message).digest("hex");
    const isValid  = timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected,  "hex"),
    );
    if (!isValid) return { valid: false, email: null };
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
  return typeof k === "string" && k.length >= 10 && k.length <= KEY_MAX &&
    /^HLM-[A-Za-z0-9_-]+-[0-9a-f]{8}-[0-9a-f]{64}$/.test(k);
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

  const secret = Deno.env.get("HELM_LICENSE_SECRET") ?? "";
  if (!secret) return Response.json({ ok: false, reason: "server_misconfigured" }, { status: 500 });

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

  const { valid, email } = verifyKey(key, secret);
  if (!valid) return Response.json({ ok: false, reason: "invalid_key" }, { status: 403 });

  const activationKey = "helm_activation_" + createHash("sha256").update(key).digest("hex").slice(0, 16);

  const existing: { machines: string[] } = (await blob.getJSON(activationKey)) ?? { machines: [] };

  if (existing.machines.includes(machineId)) {
    return Response.json({ ok: true, email });
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

  return Response.json({ ok: true, email });
}
