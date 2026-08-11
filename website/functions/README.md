# `/download` — attribution redirect

`download.js` is a Cloudflare Pages Function. It answers
`GET /download?src=<channel>`, records an aggregate hit, and 302s to the current
Helm DMG.

It exists because the growth plan needs to know which channel produces
downloads, and Helm cannot answer that with a normal analytics script: the
privacy policy publicly states the product collects no usage analytics or
behavioral data, and "nothing phones home" is part of the pitch. This counts
`(source, UTC day) → integer` and nothing else — no cookies, no client-side
script, no per-visitor record, no IP or user-agent retained.

Second job: the download target used to be hardcoded
(`Helm-1.0.3-universal.dmg`), so a release shipped without the site following
it. The version is now read from the auto-updater's own `latest-mac.yml`.

---

## ⚠️ Before the first deploy — two things must be true

### 1. The Pages "Root directory" must be `website`

Pages looks for `functions/` at the root directory configured for the project,
so this file must end up at the **served site root**. `website/` is the site
root today (`index.html`, `privacy.html`, `tokens.css`, `vendor/` all live
here), which means the Pages project `helm-prelaunch` should have
**Root directory = `website`** and this Function resolves as `/download`.

If the project instead builds from the repository root, move the folder to
`/functions/` at the top level. Confirm in
**Cloudflare dashboard → Workers & Pages → helm-prelaunch → Settings → Builds**.

### 2. Bind a KV namespace named `HELM_STATS`

Without the binding the endpoint still works — it just redirects without
counting, which is the intended degraded mode, not an error.

```bash
wrangler kv namespace create HELM_STATS      # older CLI: kv:namespace create
```

Then **Settings → Functions → KV namespace bindings** on the Pages project:
variable name `HELM_STATS`, pointed at the namespace you just created. Add it
for Production (and Preview if you want preview deploys counted separately).

---

## Verify after deploying

```bash
# Should print the current DMG URL, and it must track package.json's version.
curl -sI "https://get-helm.app/download?src=test" | grep -i '^location'

# Should be a normal DMG download.
curl -sIL "https://get-helm.app/download?src=test" | grep -iE '^(HTTP|content-length)'
```

If `location` is missing or the status is 404, the root-directory assumption
above is wrong — that is the first thing to check.

## Read the counts

```bash
wrangler kv key list --namespace-id=<id>
wrangler kv key get "dl:2026-08-11:linkedin" --namespace-id=<id>
```

Keys are `dl:<YYYY-MM-DD>:<source>`. Or read them in the dashboard under the KV
namespace.

---

## How sources get set

- **Links posted in a channel** should point straight at the endpoint:
  `https://get-helm.app/download?src=linkedin`. This is the cleanest signal —
  the click is the download.
- **Landing-page clicks** default to the button's position on the page
  (`nav`, `hero`, `cta`), so you can see which CTA does the work.
- **A visit that arrives with a campaign tag** — `get-helm.app/?src=linkedin` or
  `?utm_source=linkedin` — overrides the position, so someone who reads the page
  first and converts is still credited to the channel that sent them.
  `sections.jsx:downloadHref()` does this by reading the URL the visitor already
  has. Nothing is stored.

Source labels are lowercased and must match `^[a-z0-9][a-z0-9_-]{0,31}$`.
Anything else is bucketed as `other`, which keeps a hostile querystring from
writing unbounded distinct keys into KV. Absent or empty is `direct`.

---

## Design notes

- **Never break the download.** Every failure path — manifest unreachable, YAML
  unparseable, KV missing, KV throwing — still returns a working 302. Counting
  runs through `waitUntil` so it never delays the redirect.
- **302 + `no-store`.** Never 301: the target changes with every release, and a
  permanently-cached redirect would pin users to an old DMG.
- **No open redirect.** `Location` is built only from module constants and a
  regex-validated version string. No request input reaches it.
- **KV increments are not atomic.** Simultaneous downloads can lose a count.
  At current volume that is an acceptable trade for a zero-dependency counter;
  the day-bucketed keys keep contention low. If volume ever makes it matter,
  Workers Analytics Engine is the drop-in replacement and `recordHit()` is the
  only function that changes.
- `FALLBACK_VERSION` is a safety net for when `latest-mac.yml` is unreachable.
  Bump it on release so the net stays current, but it is not the source of
  truth.

## On every release, update three strings

The download target follows `latest-mac.yml` automatically. These do not:

| Where | What |
|---|---|
| `functions/download.js` | `FALLBACK_VERSION` |
| `sections.jsx` + `build/sections.js` | `APP_VERSION`, `APP_SIZE` (the nav badge) |

Skip them and the page will advertise an old version while serving the new DMG.

## Editing the site's download buttons

`website/build/sections.js` is **minified build output** and is what
`index.html` actually loads — editing `sections.jsx` alone changes nothing on
the live site. There is no bundler in this repo, so the two are kept in sync by
hand. If you change `downloadHref` in the JSX, make the matching edit in the
built file and re-check with `node --check`.
