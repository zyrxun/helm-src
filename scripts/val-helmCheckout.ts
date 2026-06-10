// Val.town: zyrxun/helmCheckout
// Required Val.town env vars (set in Val.town environment — never hardcode values here):
//   HELM_LICENSE_PRIVATE_KEY  (Ed25519 private key, PEM format)
//   STRIPE_WEBHOOK_SECRET
//   RESEND_API_KEY
//   HELM_FROM_EMAIL
import { blob } from "https://esm.town/v/std/blob";
import { createHmac, createHash, randomBytes, createPrivateKey, sign as cryptoSign, KeyObject } from "node:crypto";

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
// Env-var UIs often flatten a multi-line PEM into one line or insert literal
// "\n"; rebuild a canonical PEM so createPrivateKey accepts it regardless.
function normalizePem(raw: string, label: string): string {
  const body = String(raw)
    .replace(/\\[nrt]/g, "")
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/[^A-Za-z0-9+/=]/g, "");
  const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----\n`;
}

// ── Stripe webhook signature verification ─────────────────────────────────────
function verifyStripeSignature(rawBody: string, header: string, secret: string, toleranceSec = 300): boolean {
  try {
    const parts   = Object.fromEntries(header.split(",").map(p => p.split("=")));
    const ts      = parts["t"];
    const sig     = parts["v1"];
    if (!ts || !sig) return false;
    // Reject stale or future-dated timestamps so a captured webhook body+signature
    // cannot be replayed indefinitely. Matches Stripe's own 5-minute default.
    const tsSec = Number(ts);
    if (!Number.isFinite(tsSec) || Math.abs(Date.now() / 1000 - tsSec) > toleranceSec) return false;
    const payload  = `${ts}.${rawBody}`;
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    if (sig.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}

// ── Key minting ───────────────────────────────────────────────────────────────
// Ed25519-signed key. The matching public key lives in
// electron/runtime-config.js so clients can verify offline without ever
// holding the minting secret.
function mintKey(email: string, privateKey: KeyObject): string {
  const nonce        = randomBytes(4).toString("hex");
  const encodedEmail = Buffer.from(email).toString("base64url");
  const message      = Buffer.from(`HLM:${encodedEmail}:${nonce}`);
  const signature    = cryptoSign(null, message, privateKey).toString("base64url");
  // '.' is not a base64url character, so splitting on it is unambiguous.
  return `HLM.${encodedEmail}.${nonce}.${signature}`;
}

// ── Email delivery via Resend ─────────────────────────────────────────────────
async function sendLicenseEmail(to: string, key: string, resendKey: string, fromEmail: string) {
  const body = {
    from:    fromEmail,
    to:      [to],
    subject: "Your Helm license key",
    html: `
<p>Here is your Helm Pro license key:</p>
<pre style="font-family:monospace;background:#0A1628;color:#D4AF6A;padding:16px;border-radius:8px">${key}</pre>
<p>Open Helm and click <strong>I have a key</strong> to activate.</p>
<p>This key works on up to 2 Macs. Keep it somewhere safe.</p>
`,
  };
  const res = await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}

// ── Input validation ──────────────────────────────────────────────────────────
const STRIPE_BODY_MAX = 65536; // 64 KB — Stripe payloads are well under this

function isSafeEmail(e: unknown): e is string {
  return typeof e === "string" && e.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  // Reject oversized bodies before rate limiting to save blob writes on floods
  const contentLength = parseInt(req.headers.get("content-length") ?? "0", 10);
  if (contentLength > STRIPE_BODY_MAX) {
    return Response.json({ ok: false, reason: "payload_too_large" }, { status: 413 });
  }

  const limited = await rateLimit(req);
  if (limited) return limited;

  const webhookSecret  = Deno.env.get("STRIPE_WEBHOOK_SECRET")     ?? "";
  const licensePrivate = Deno.env.get("HELM_LICENSE_PRIVATE_KEY")  ?? "";
  const resendKey      = Deno.env.get("RESEND_API_KEY")            ?? "";
  const fromEmail      = Deno.env.get("HELM_FROM_EMAIL")           ?? "";
  let licenseKeyObj: KeyObject | null = null;
  if (licensePrivate) {
    try { licenseKeyObj = createPrivateKey(normalizePem(licensePrivate, "PRIVATE KEY")); } catch { licenseKeyObj = null; }
  }

  const rawBody = await req.text();
  if (rawBody.length > STRIPE_BODY_MAX) {
    return Response.json({ ok: false, reason: "payload_too_large" }, { status: 413 });
  }
  const sigHeader = req.headers.get("stripe-signature") ?? "";

  // Fail loud when the webhook secret is missing. Without it the Stripe
  // signature can't be verified, and returning 200 would make Stripe treat the
  // purchase as delivered — no key minted, no email, no retry. A 500 makes
  // Stripe retry and surfaces the misconfiguration instead of hiding it.
  if (webhookSecret === "whsec_PLACEHOLDER" || webhookSecret === "") {
    console.error("helmCheckout: STRIPE_WEBHOOK_SECRET not configured — rejecting");
    return Response.json({ ok: false, reason: "server_misconfigured" }, { status: 500 });
  }

  if (!verifyStripeSignature(rawBody, sigHeader, webhookSecret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  if (payload.type !== "checkout.session.completed") {
    return Response.json({ received: true });
  }

  const email = payload.data?.object?.customer_details?.email;
  if (!isSafeEmail(email)) return Response.json({ ok: false, reason: "no_email" }, { status: 400 });

  if (!licenseKeyObj) return Response.json({ ok: false, reason: "server_misconfigured" }, { status: 500 });

  // Idempotency: Stripe delivers events at-least-once and retries on any non-2xx,
  // and the mint nonce is random — so without this each redelivery would produce
  // a new valid key (each good for 2 machines). Key the mint on the Checkout
  // Session id; redelivery returns the same key instead of minting again.
  const sessionId   = payload.data?.object?.id;
  const mintBlobKey = typeof sessionId === "string" && sessionId.length > 0 && sessionId.length <= 128
    ? "helm_minted_" + createHash("sha256").update(sessionId).digest("hex").slice(0, 32)
    : null;

  if (mintBlobKey) {
    const prior: { key: string } | null = await blob.getJSON(mintBlobKey);
    if (prior?.key) return Response.json({ ok: true });
  }

  const key = mintKey(email, licenseKeyObj);
  // Persist before emailing so a delivery failure can't cause a re-mint on retry.
  if (mintBlobKey) await blob.setJSON(mintBlobKey, { key, email, at: Date.now() });

  if (resendKey && resendKey !== "re_PLACEHOLDER" && fromEmail) {
    try {
      await sendLicenseEmail(email, key, resendKey, fromEmail);
    } catch (err) {
      console.error("Email delivery failed:", err);
      return Response.json({ ok: true, warning: "email_failed" });
    }
  } else {
    // Don't log the raw key — it's a bearer credential and lands in Val.town
    // dashboard logs. Hash prefix + email is enough to correlate.
    const keyHash = createHash("sha256").update(key).digest("hex").slice(0, 12);
    console.log(`helmCheckout: email not configured, minted key for ${email} (sha256:${keyHash})`);
  }

  return Response.json({ ok: true });
}
