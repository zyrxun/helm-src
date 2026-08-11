# Helm — Ad Campaign TODO

## Status Key
- [ ] Not started
- [~] In progress
- [x] Done

---

## Foundation
- [x] Pre-launch page live at get-helm.app
- [x] Fix bare "Free" on get-helm.app → "free for two workflows · no subscription" (done in `website/index.html`; **redeploy to CF Pages to go live**)
- [x] OG/Twitter/description meta tags added (text-only, no og:image per the no-og.png call) in `website/index.html` `<head>` (**redeploy to go live**)
- [ ] Tracking sub-pages: get-helm.app/macapps and get-helm.app/productivity
- [~] **Download attribution — built Aug 11, not yet deployed.**
  `website/functions/download.js` serves `get-helm.app/download?src=<channel>`:
  counts hits per source per UTC day in Workers KV, then 302s to the current
  DMG. Aggregate integers only — no cookies, no client script, no per-visitor
  record, so the privacy positioning holds. All three site download buttons now
  point at it (`website/sections.jsx` + the minified `website/build/sections.js`).
  Also de-pins the version: the target is read from `latest-mac.yml`.
  **Two prerequisites before this works in production — see
  [website/functions/README.md](website/functions/README.md):**
  (1) the CF Pages **root directory must be `website`** (unverified — check the
  dashboard; if it is the repo root, move the folder to `/functions/`), and
  (2) a KV namespace bound as `HELM_STATS` (without it the endpoint still
  redirects, it just does not count).
  ⚠️ **The download path now depends on this Function.** After deploy, confirm
  `curl -sI https://get-helm.app/download?src=test` returns 302 before trusting
  any published link — if the root directory assumption is wrong, all three
  buttons 404.
- [x] ~~**Download URL is version-pinned.**~~ Fixed Aug 11 by the redirect above
  — the version now comes from the auto-updater manifest, so a release moves the
  site's download link with it.
- [ ] **The version *label* still is pinned.** `website/sections.jsx` hardcodes
  `APP_VERSION = "v1.0.3"` and `APP_SIZE = "187 MB"` for the nav badge. The
  download itself now auto-follows the manifest, so after the next release the
  page can say "v1.0.3" while handing over a newer DMG. Update both strings on
  release (same checklist step as `FALLBACK_VERSION` in
  `website/functions/download.js`), or make the badge read the manifest too.
- [~] **`website/privacy.html`** — updated Aug 11: discloses the aggregate
  download count, scopes the "does not collect" list to the app, adds Cloudflare
  to third-party services, date bumped. **Still open:** it says waitlist emails
  are deleted "once Helm has launched and all signups have been notified."
  Helm launched Jul 1 — that commitment is ~6 weeks past due. Either purge the
  waitlist store or reword the sentence; leaving it as-is is a stated promise
  the product is not keeping.

---

## Ad Files to Create

### Text / Copy (no video required) — do these first
- [~] [ads/reddit_macapps.md](ads/reddit_macapps.md) — founder story post, "The Setup People Skip", links to get-helm.app/macapps (drafted Jun 13; founder review pending)
- [~] [ads/reddit_productivity.md](ads/reddit_productivity.md) — Before/After format post, links to get-helm.app/productivity (drafted Jun 13; founder review pending)
- [~] [ads/influencer_pitch.md](ads/influencer_pitch.md) — outreach template, custom workflow template collab offer — **needed by Jun 20** (outreach wave 1) (drafted Jun 13; founder review pending)
- [~] [ads/twitter_thread.md](ads/twitter_thread.md) — "The Morning Tax" tweet thread (drafted Jun 13; founder review pending)
- [~] [ads/feedback_requests.md](ads/feedback_requests.md) — honest landing-page feedback outreach (own the page, never disguised); subreddit list + templates (drafted Jun 14; founder review pending). Post after Jun 18 reveal + site rebuild.
- [~] [ads/producthunt.md](ads/producthunt.md) — tagline, body copy, CTA + launch day email blast draft (drafted Jun 12; founder review pending)
- [~] [ads/linkedin.md](ads/linkedin.md) — **post-launch Tier 1** (`marketing/growth-plan.md`): founder cadence (8 post drafts, 2–3/wk), comment-engagement playbook, EA / chief-of-staff outreach templates + free-key-for-honest-review offer (drafted Jul 31; founder review pending). **Two posts carry founder checks** — the "three minutes, six times a day" figure and the three-day count must be real numbers, not estimates. Attribution unblocked (see Foundation) — post links should use
  `https://get-helm.app/download?src=linkedin` once the Function is deployed.
- [x] ~~ads/show-hn.md~~ — ⛔ **DROPPED (Jun 14)** — Helm is not launching on Hacker News (founder decision). File kept only as a technical-copy source for the JXA writeup / FAQ.

### Workflow Templates (for influencer collab)
- [ ] `ads/workflow_designer.json` — Figma, Linear, Chrome (design refs), Slack
- [ ] `ads/workflow_dev.json` — VS Code, Terminal, Chrome (docs), Slack, Notion
- [ ] `ads/workflow_founder.json` — Notion, Slack, Chrome (analytics), Linear, Superhuman

### Video — interim exists; **final launch video still TO DO closer to Jul 1**
> **State (Jun 13):** a working *interim* video exists and is hosted — usable now, but **NOT** the final launch video. Founder will produce a better one closer to launch.
> - **Interim — YouTube (embeddable):** https://youtu.be/m7yKjmJ6Mo0
> - **Interim — direct MP4 (R2, 594 KB):** https://pub-ec64f4f5098d43328a5073456b0d41ab.r2.dev/helm-launch-web.mp4
> - **Masters in repo:** `HELM_LAUNCH_VIDEO.mov` (56 MB), `website/Helm_final_launch_vid.mov` (843 MB)
>
> **Suggested split (founder to confirm):** use the **interim** for BetaList + press wave (Jun 19) + influencer outreach (Jun 20) so those don't slip; reserve the **new launch video** for the high-visibility Jul 1 surfaces (PH gallery, X thread, landing hero).
- [x] Interim video exists + hosted (YouTube + R2) — good enough for BetaList + 1:1 outreach
- [ ] **NEW launch video — produce closer to Jul 1** (the real launch asset). Before: 8 apps opened manually → After: Helm one-click.
- [ ] 20-second cut for PH gallery + press — from the NEW launch video
- [ ] 15-second X cut — scroll-stopper headline burned in 0:00–0:03 — from the NEW launch video, by Jul 1

### Visual / Design
- [ ] End card — `#0A1628` bg, nautical grid 5% opacity, Playfair Display wordmark, Sovereign Gold
- [ ] Reddit inline screenshot — Helm popover, brand spec, reads as authentic setup photo

---

## Non-Traditional Channels (added Jun 12 — scheduled in marketing/SCHEDULE.md)

### Press / podcasts (best audience fit — Mac automation media)
- [~] [ads/press_pitch.md](ads/press_pitch.md) — outreach templates for Mac Power Users, Automators, MacStories, The Sweet Setup, 9to5Mac (drafted Jun 12; founder review pending)
- [ ] Send wave 1 pitches after the Jun 18 reveal (targets + dates in SCHEDULE.md)
- [ ] Follow-ups Jun 26 (single, polite, new info only — e.g. launch date)

### Directories / "alternative to" placement
- [~] [ads/directories.md](ads/directories.md) — listing copy, tags, alternatives positioning, "why not Raycast/Alfred" boilerplate (drafted Jun 12; founder review pending)
- [ ] AlternativeTo listing live Jun 18+ (works pre-launch, links to get-helm.app)
- [ ] MacUpdate + MacMenuBar + ToolFinder submissions on Jul 1 (need live download URL)
- Setapp: deliberately skipped — revenue-share subscription model conflicts with "no subscription" positioning

### Technical content as marketing
- [ ] JXA deep-dive writeup (already in Reddit schedule Jun 9 slot, slipped) — publish on get-helm.app first, then r/programming.
- [ ] Post-launch: "How Helm detects Chrome profiles (AX tree + History SQLite)" — second technical post, permanent search surface

### Built-in viral loop
- [ ] Shareable workflow cards — already specced in TODO.md "Future features" (v1.1); pull forward to 2–3 weeks post-launch

### Physical (Auckland) — testimonials + feedback, not scale
- [~] [ads/physical.md](ads/physical.md) — lightning-talk outline + sticker/QR card spec + university route (clubs → approved posters) + venue list (drafted Jun 12)
- [ ] Order stickers/cards by ~Jun 20 (shipping lead time)
- [ ] Find next local dev/Apple meetup with a lightning-talk slot; talk is technical (JXA), Helm is the demo

### Founder prep
- [ ] Study [marketing/founder-technical-faq.md](marketing/founder-technical-faq.md) — the ~15 questions every channel asks, with answers derived from the codebase. Read 3× before Jun 19 (press sends), again before launch day and the talk.

### Account warmup (founder personal — daily, ~10 min)
- [ ] Product Hunt account warmup Jun 13–30 — checklist in SCHEDULE.md

---

## Niche Sites & Communities (long-tail distribution — added Jun 13)

> Additive to `ads/directories.md` (the big catalogs — AlternativeTo, MacUpdate,
> MacMenuBar, ToolFinder; Setapp deliberately skipped). These are the long-tail.
> Same discipline everywhere: one genuine post, value-first, founder replies to
> every comment, never a vote/upvote ask, **verify each site's current self-promo
> rules before posting.** Most need the live download (Jul 1); exceptions flagged.

### Launch platforms (Product Hunt alternatives)
- [ ] **BetaList** (betalist.com) — ⚠️ **now paid-to-feature** (Lite $39 / Standard $99 / Premium $299; no free listing visible as of Jun 13). Paying to get featured pre-launch = **paid acquisition before launch**, a standing no-go. **Skip** unless a free "regular queue" path exists. If ever paid: Lite $39 only — never $99/$299 (break-even ≈ 11–33 sales at $9). The free pre-launch waitlist value it used to offer is gone.
- [ ] **Indie Hackers** (indiehackers.com) — launch/milestone post; the solo-founder, $9-no-subscription story fits the audience. Launch week.
- [ ] **DevHunt** (devhunt.org) — dev-tools launch platform; lead with the JXA / "real automation" angle. Launch week.
- [ ] **Uneed** (uneed.best) — daily PH-style launch, growing audience. Launch day or the day after.
- [ ] **Fazier** (fazier.com) — PH-alternative launch platform. Launch week.
- [ ] **Peerlist Launchpad** (peerlist.io) — dev-audience project spotlight. Launch week.
- [ ] **Tiny Launch** (tinylaun.ch) — indie launch board. Launch week.
- [ ] **Microlaunch** (microlaunch.net) — indie launch board. Launch week.
- [ ] **Launching Next** (launchingnext.com) — startup directory listing. Anytime post-launch.
- [ ] **SaaSHub** (saashub.com) — software-alternatives directory; list under macOS productivity / "alternative to Raycast/Alfred". Reuses the `directories.md` alternatives copy. Anytime.

### Mac / automation community forums (best audience fit)
- [ ] **MPU Talk** (talk.macpowerusers.com) — Mac Power Users community forum; automation power users. Separate channel from the MPU press pitch. Launch week, "I made this"-style post in the right category.
- [ ] **Automators Talk** (talk.automators.fm) — Automators community forum. Bullseye audience for JXA + Capture. Launch week.
- [ ] **MacRumors Forums** (forums.macrumors.com) — third-party macOS apps area; engaged, long-lived threads. Launch week.
- [ ] **Keyboard Maestro forum** (forum.keyboardmaestro.com) — ⚠️ adjacent-tool power users. Tactful only: post as a complement in the right "share" area, never "switch from KM". High spam-sensitivity.
- [ ] **Alfred forum** (alfredforum.com) — ⚠️ same audience + same caution. Value-first or skip.

### Additional Reddit communities (same karma/self-promo discipline as the Reddit schedule)
- [ ] **r/Automate** — automation enthusiasts; JXA / real-Apple-Events angle. Link in a comment.
- [ ] **r/macOS** — large, strict self-promo rules; only story-shaped, with flair/rules met.
- [ ] **r/ObsidianMD** — local-first crowd that values "workflows live on your machine"; a *comment-presence* channel, not a post target.
- Note: **r/SideProject** + **r/alphaandbetausers** already in `SCHEDULE.md` (Jun 5 slots, MP4-gated).

### Dev-tool newsletters / curators
- [ ] **Console.dev** (console.dev) — dev-tools newsletter; submit under the dev-tool framing. Pre- or post-launch.

### Gated — technical post only, if invited
- [ ] **Lobsters** (lobste.rs) — invite-only. Submit the JXA deep-dive *writeup* (not the product) — a technical post, never an ad.
- [ ] **Tildes** (tildes.net) — invite-only. Same: technical writeup, never an ad.

---

## Distribution
- [ ] Identify 8–10 micro-influencers (Raycast/Alfred/Keyboard Maestro/Warp users, 5K–50K followers)
- [ ] Send influencer pitches with custom workflow templates
- [ ] Set up Twitter/X paid promotion — target: @raycastapp, @alfredapp, @KeyboardMaestro, @warpdotdev followers only
- [ ] Product Hunt launch day — organic push + email blast to waitlist

---

## Execution Timeline

### Week 1 — Validation
- [ ] Post reddit_macapps.md to r/macapps
- [ ] Pitch influencers with workflow templates
- [ ] Record raw screen capture

### Week 2 — Organic Push
- [ ] Post reddit_productivity.md to r/productivity
- [ ] Post twitter_thread.md
- [ ] Monitor which hook gets highest CTR — this determines PH headline

### Week 3 — Product Hunt Launch
- [ ] Launch using winning hook from Week 1/2
- [ ] Update top Reddit threads with PH link
- [ ] Send email blast to waitlist

### Week 4 — Paid Accelerator
- [ ] Promote best-performing video on Twitter/X
- [ ] $300–500 budget, Mac utility purists only

---

## Standing Rules
- $9, one-time price appears in every execution
- Local data angle (workflows.json) is a selling point on Reddit — use it
- No exclamation points. No filler words. Calm, direct, present tense.
- Founder responds personally to every Reddit reply
- Paid video: value declared in first 3 seconds
- Paid targeting: Raycast, Alfred, Keyboard Maestro, Warp only — not Figma/Notion
