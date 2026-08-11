/**
 * GET /download?src=<channel>  →  302 to the current Helm DMG.
 *
 * Exists so download clicks are attributable by channel without putting an
 * analytics script on the site. Helm's privacy policy states the product
 * collects no usage analytics or behavioral data, and "nothing phones home" is
 * load-bearing positioning — so this counts aggregate hits per source per day
 * and nothing else. No cookies, no client script, no per-visitor record, no IP
 * or user-agent stored.
 *
 * It also de-pins the download from a hardcoded version: the target is resolved
 * from the auto-updater's own manifest, so shipping a release moves the site's
 * download link with it.
 *
 * Hard rule: this endpoint must never fail the download. Every counting and
 * version-resolution path degrades to a working redirect.
 */

// TODO(roadmap 4): swap for https://updates.get-helm.app once the custom domain
// is live. The pub-*.r2.dev host is rate limited.
const R2_BASE = 'https://pub-ec64f4f5098d43328a5073456b0d41ab.r2.dev';

// Used only if latest-mac.yml is unreachable or unparseable. Keep in step with
// package.json on release; it is a safety net, not the source of truth.
const FALLBACK_VERSION = '1.0.3';

const MANIFEST_TTL_SECONDS = 300;

// A source label is an opaque short slug. Anything else is bucketed as "other"
// so an arbitrary querystring can't write unbounded distinct keys into KV.
const SRC_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

const VERSION_PATTERN =
  /^\s*version:\s*['"]?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)['"]?\s*$/m;

function normalizeSource(raw) {
  if (typeof raw !== 'string') return 'direct';
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return 'direct';
  return SRC_PATTERN.test(trimmed) ? trimmed : 'other';
}

async function resolveVersion(manifestUrl) {
  try {
    const res = await fetch(manifestUrl, {
      cf: { cacheTtl: MANIFEST_TTL_SECONDS, cacheEverything: true },
    });
    if (!res.ok) return FALLBACK_VERSION;
    const match = VERSION_PATTERN.exec(await res.text());
    return match ? match[1] : FALLBACK_VERSION;
  } catch {
    return FALLBACK_VERSION;
  }
}

/**
 * Aggregate counters, bucketed by UTC day so the data is a time series rather
 * than one ever-growing number, and so concurrent writes to the same key stay
 * rare at Helm's traffic level.
 *
 * KV read-modify-write is not atomic — two downloads landing in the same
 * instant can lose a count. At a few downloads a day that is an acceptable
 * trade for a zero-dependency counter. If volume ever makes it matter, move to
 * Workers Analytics Engine; the call site here would not change shape.
 */
async function recordHit(env, source, day) {
  if (!env || !env.HELM_STATS) return;
  const key = `dl:${day}:${source}`;
  const current = parseInt((await env.HELM_STATS.get(key)) || '0', 10);
  await env.HELM_STATS.put(key, String((Number.isFinite(current) ? current : 0) + 1));
}

export async function onRequest(context) {
  const { request, env, waitUntil } = context;

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD' },
    });
  }

  const source = normalizeSource(new URL(request.url).searchParams.get('src'));
  const version = await resolveVersion(`${R2_BASE}/latest-mac.yml`);

  // Built entirely from constants and a regex-validated version — no request
  // input reaches the Location header, so this cannot become an open redirect.
  const target = `${R2_BASE}/Helm-${version}-universal.dmg`;

  const day = new Date().toISOString().slice(0, 10);
  const counted = recordHit(env, source, day).catch((err) => {
    // Counting is best-effort. A broken counter must not cost a download.
    console.error(`download-count failed src=${source} day=${day}:`, err);
  });
  if (typeof waitUntil === 'function') waitUntil(counted);

  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      // 302 + no-store: the target moves every release, so nothing about this
      // hop may be cached by a browser or intermediary.
      'Cache-Control': 'no-store, max-age=0',
      // Keeps the ?src= label out of the Referer header sent on to R2.
      'Referrer-Policy': 'no-referrer',
    },
  });
}
