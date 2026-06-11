// Val.town: zyrxun/helmWaitlist (the val behind the website email form —
// https://zyrxun--4209f72a5edc11f1a9731607ee4eb77e.web.val.run)
// Replace the existing val body with this content.
//
// Required Val.town env vars (on THIS val — env vars are per-val):
//   RESEND_API_KEY   (the new key — the original "Helm" key was revoked in the B1 rotation)
//   HELM_FROM_EMAIL  (noreply@get-helm.app — domain verified at resend.com/domains)
//   WAITLIST_NOTIFY  (optional — your own address; you get a ping per signup)
//
// Response contract (the website form only checks res.ok):
//   { ok: true, duplicate: boolean, emailSent: boolean }
import { blob } from "https://esm.town/v/std/blob";
import { createHash } from "node:crypto";

// ── Rate limiting ─────────────────────────────────────────────────────────────
const WINDOW_MS    = 15 * 60 * 1000;
const MAX_ATTEMPTS = 15;

async function rateLimit(req: Request): Promise<Response | null> {
  const ip           = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const windowBucket = Math.floor(Date.now() / WINDOW_MS);
  const ipHash       = createHash("sha256").update(ip).digest("hex").slice(0, 12);
  const blobKey      = `helm_rl_wl_${windowBucket}_${ipHash}`;

  const record: { count: number } = (await blob.getJSON(blobKey)) ?? { count: 0 };
  if (record.count >= MAX_ATTEMPTS) {
    return Response.json({ ok: false, reason: "rate_limited" }, { status: 429 });
  }
  await blob.setJSON(blobKey, { count: record.count + 1 });
  return null;
}

// ── Validation ────────────────────────────────────────────────────────────────
const BODY_SIZE_MAX = 1024;

function isSafeEmail(e: unknown): e is string {
  return typeof e === "string" && e.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

// ── Welcome email via Resend ──────────────────────────────────────────────────
async function sendWelcomeEmail(to: string, resendKey: string, fromEmail: string): Promise<void> {
  const body = {
    from:    fromEmail,
    to:      [to],
    subject: "You're on the Helm list",
    html: `
<p>You're on the list.</p>
<p>Helm launches July 1. One click from your menu bar opens your entire app
stack — every app in position, every tab loaded.</p>
<p>We send one email when it ships. That's it.</p>
<p style="color:#8a8a8a;font-size:12px">Helm — Take the wheel.</p>
`,
  };
  const res = await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const contentLength = parseInt(req.headers.get("content-length") ?? "0", 10);
  if (contentLength > BODY_SIZE_MAX) {
    return Response.json({ ok: false, reason: "payload_too_large" }, { status: 413 });
  }

  const limited = await rateLimit(req);
  if (limited) return limited;

  let body: { email?: unknown };
  try {
    const raw = await req.text();
    if (raw.length > BODY_SIZE_MAX) {
      return Response.json({ ok: false, reason: "payload_too_large" }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  const { email } = body;
  if (!isSafeEmail(email)) {
    return Response.json({ ok: false, reason: "invalid_email" }, { status: 400 });
  }

  // Per-email blob key: dedupe is natural, no read-modify-write race on a
  // shared list. Export the list later with blob.list("helm_waitlist_").
  const normalized = email.trim().toLowerCase();
  const entryKey   = "helm_waitlist_" + createHash("sha256").update(normalized).digest("hex").slice(0, 24);

  const existing = await blob.getJSON(entryKey);
  const duplicate = !!existing;
  if (!duplicate) {
    await blob.setJSON(entryKey, { email: normalized, at: Date.now() });
  }

  // Email send is best-effort: a failure must not lose the signup. But it is
  // never silent — the reason lands in the val logs and the response carries
  // emailSent so a broken Resend config is visible, not invisible.
  let emailSent = false;
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const fromEmail = Deno.env.get("HELM_FROM_EMAIL") ?? "";
  if (!duplicate && resendKey && fromEmail) {
    try {
      await sendWelcomeEmail(normalized, resendKey, fromEmail);
      emailSent = true;
    } catch (err) {
      console.error("helmWaitlist: welcome email failed:", String(err));
    }
  } else if (!duplicate) {
    console.error("helmWaitlist: RESEND_API_KEY or HELM_FROM_EMAIL not set — signup stored, no email sent");
  }

  // Optional self-notification so signups are visible without checking blobs.
  const notify = Deno.env.get("WAITLIST_NOTIFY") ?? "";
  if (!duplicate && notify && resendKey && fromEmail) {
    try {
      await fetch("https://api.resend.com/emails", {
        method:  "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: fromEmail, to: [notify],
          subject: "Helm waitlist signup",
          text: `${normalized} joined the waitlist.`,
        }),
      });
    } catch (_) { /* notification only — never affects the signup */ }
  }

  return Response.json({ ok: true, duplicate, emailSent });
}
