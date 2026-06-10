// Val.town: zyrxun/helmFeedback
// Accepts feedback POSTs from the Helm client and forwards them via Resend.
// Keeps RESEND_API_KEY and the destination email server-side.
//
// Required Val.town env vars:
//   RESEND_API_KEY       — Resend API key with send permission
//   HELM_FEEDBACK_TO     — destination email address
//   HELM_FROM_EMAIL      — verified Resend "from" address (e.g. noreply@get-helm.app)
import { blob } from "https://esm.town/v/std/blob";
import { createHash } from "node:crypto";

const BODY_SIZE_MAX = 12_000;       // bytes; message + ~50 log lines
const WINDOW_MS     = 15 * 60 * 1000;
const MAX_ATTEMPTS  = 30;

async function rateLimit(req: Request): Promise<Response | null> {
  const ip       = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const ipHash   = createHash("sha256").update(ip).digest("hex").slice(0, 12);
  const hour     = Math.floor(Date.now() / (60 * 60 * 1000));
  const blobKey  = `helm_fb_${hour}_${ipHash}`;
  const now      = Date.now();
  const rec: { count: number; windowStart: number } =
    (await blob.getJSON(blobKey)) ?? { count: 0, windowStart: now };
  if (now - rec.windowStart > WINDOW_MS) {
    rec.count = 0;
    rec.windowStart = now;
  }
  if (rec.count >= MAX_ATTEMPTS) {
    return Response.json({ ok: false, reason: "rate_limited" }, { status: 429 });
  }
  rec.count++;
  await blob.setJSON(blobKey, rec);
  return null;
}

function isSafeMessage(m: unknown): m is string {
  return typeof m === "string" && m.trim().length > 0 && m.length <= 10_000;
}

export default async function(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const contentLength = parseInt(req.headers.get("content-length") ?? "0", 10);
  if (contentLength > BODY_SIZE_MAX) {
    return Response.json({ ok: false, reason: "payload_too_large" }, { status: 413 });
  }

  const limited = await rateLimit(req);
  if (limited) return limited;

  const resendKey = Deno.env.get("RESEND_API_KEY")    ?? "";
  const to        = Deno.env.get("HELM_FEEDBACK_TO")  ?? "";
  const from      = Deno.env.get("HELM_FROM_EMAIL")   ?? "";
  if (!resendKey || !to || !from) {
    return Response.json({ ok: false, reason: "server_misconfigured" }, { status: 500 });
  }

  let body: { version?: unknown; message?: unknown; body?: unknown };
  try {
    const raw = await req.text();
    if (raw.length > BODY_SIZE_MAX) {
      return Response.json({ ok: false, reason: "payload_too_large" }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  if (!isSafeMessage(body.message)) {
    return Response.json({ ok: false, reason: "invalid_message" }, { status: 400 });
  }

  const version = typeof body.version === "string" ? body.version.slice(0, 32) : "unknown";
  const text    = typeof body.body === "string" ? body.body.slice(0, 12_000) : (body.message as string);
  const subject = `Helm Feedback — v${version}`;

  const res = await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ from, to, subject, text }),
  });
  if (!res.ok) {
    return Response.json({ ok: false, reason: "delivery_failed" }, { status: 502 });
  }
  return Response.json({ ok: true });
}
