// Val.town: zyrxun/helmCheckout
// Required Val.town env vars (set in Val.town environment — never hardcode values here):
//   HELM_LICENSE_SECRET
//   STRIPE_WEBHOOK_SECRET
//   RESEND_API_KEY
//   HELM_FROM_EMAIL
import { blob } from "https://esm.town/v/std/blob";
import { createHmac, createHash, randomBytes } from "node:crypto";

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

// ── Stripe webhook signature verification ─────────────────────────────────────
function verifyStripeSignature(rawBody: string, header: string, secret: string): boolean {
  try {
    const parts   = Object.fromEntries(header.split(",").map(p => p.split("=")));
    const ts      = parts["t"];
    const sig     = parts["v1"];
    if (!ts || !sig) return false;
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
function mintKey(email: string, secret: string): string {
  const nonce        = randomBytes(4).toString("hex");
  const encodedEmail = Buffer.from(email).toString("base64url");
  const message      = `HLM:${encodedEmail}:${nonce}`;
  const hmac         = createHmac("sha256", secret).update(message).digest("hex");
  return `HLM-${encodedEmail}-${nonce}-${hmac}`;
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

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  const licenseSecret = Deno.env.get("HELM_LICENSE_SECRET")   ?? "";
  const resendKey     = Deno.env.get("RESEND_API_KEY")         ?? "";
  const fromEmail     = Deno.env.get("HELM_FROM_EMAIL")        ?? "";

  const rawBody = await req.text();
  if (rawBody.length > STRIPE_BODY_MAX) {
    return Response.json({ ok: false, reason: "payload_too_large" }, { status: 413 });
  }
  const sigHeader = req.headers.get("stripe-signature") ?? "";

  if (webhookSecret === "whsec_PLACEHOLDER" || webhookSecret === "") {
    console.log("helmCheckout: dry-run mode, no webhook secret configured");
    return Response.json({ ok: true, status: "dry_run_bypass" });
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

  if (!licenseSecret) return Response.json({ ok: false, reason: "server_misconfigured" }, { status: 500 });

  const key = mintKey(email, licenseSecret);

  if (resendKey && resendKey !== "re_PLACEHOLDER" && fromEmail) {
    try {
      await sendLicenseEmail(email, key, resendKey, fromEmail);
    } catch (err) {
      console.error("Email delivery failed:", err);
      return Response.json({ ok: true, key, warning: "email_failed" });
    }
  } else {
    console.log(`helmCheckout: email not configured, minted key for ${email}: ${key}`);
  }

  return Response.json({ ok: true });
}
