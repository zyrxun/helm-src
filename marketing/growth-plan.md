# Helm — Traffic & Growth Plan (post-launch)

> Status: working plan. Goal: more qualified traffic to the download page.
> Context: launch channels already run — Product Hunt, Show HN, r/macapps,
> r/productivity, Twitter/X thread, press pitches, directory submissions,
> influencer outreach (see `ads/`).

---

## The core insight driving this plan

Two facts, from the data:

1. **Conversion is already ~100%.** Every real downloader so far became a paying
   customer (3/3). The bottleneck is **top-of-funnel traffic**, not the landing page,
   pricing, or product. So the entire job is *volume of qualified visitors* — do not
   spend effort re-optimizing conversion yet.

2. **The channels run so far reach the wrong crowd.** Helm targets **executives and
   power users** ("Take the wheel"). But r/macapps, Show HN, and indie-hacker Twitter
   reach *Mac enthusiasts and builders* — a tech-tinkerer audience that browses tools
   for fun. The actual buyer (a busy executive) is **not** in those communities. The
   growth job is to **cross the audience gap**: get in front of executives and
   operators where they already are.

Everything below is organized by that gap.

---

## Tier 1 — Reach the executive / operator audience directly (highest priority, least done)

- **LinkedIn is the single biggest miss.** The exec/EA/operator ICP lives here, not on
  Reddit. Actions:
  - Founder posts 2–3×/week: the "morning tax" of opening your stack, time-back math,
    short screen-recordings of one-click launch (repurpose `marketing/helm-demo-20s.mp4`).
  - Post as a *person with a problem solved*, not an ad. Executive-productivity angle,
    calm brand voice (no exclamation points — see brand.md).
  - Engage in comments on posts by productivity / chief-of-staff / EA influencers.
- **Executive Assistant communities.** EAs configure and gatekeep executives' tools —
  they are a force-multiplier buyer. Channels: EA Slack/Discord groups, r/ExecutiveAssistants,
  "Chief of Staff" communities, LinkedIn EA groups. Offer free licenses for honest reviews.
- **Operator / chief-of-staff newsletters.** Sponsor or get featured in exec-ops
  newsletters (e.g. Chief of Staff Network, EA-focused lists). Higher intent than any
  Mac directory.
- **Niche vertical framing.** "Open your trading desk in one click," "consultant's
  client-switch stack," "founder's morning stack." One landing variant per vertical —
  each is a distinct SEO + ad target.

## Tier 2 — Durable, compounding traffic (start now, pays off for months)

- **SEO content / blog.** The one channel that compounds. Target intent keywords:
  "open all my apps at once mac," "app launcher for power users," "workspace switcher,"
  "how to open my work stack in one click." One article per query, each linking to the
  download. This is slow but is the only channel that keeps delivering after you stop
  posting.
- **Comparison / alternative pages.** "Helm vs [Stay / Workspaces / launcher X]" and
  AlternativeTo listings capture people already searching for a solution — highest
  intent traffic there is.
- **YouTube demo + "Mac setup" placements.** The one-click stack open is *visually
  satisfying* — ideal for short video. A 60–90s demo on YouTube (SEO'd title) plus
  outreach to productivity YouTubers who do "apps I use" / "my Mac setup" videos
  (free licenses). Video also feeds LinkedIn/X/Shorts.

## Tier 3 — Widen the directory & community net (fast, low effort, mostly incremental)

Beyond the Mac directories already hit:
- **Cross-platform tool directories:** BetaList, SaaSHub, Slant, Uneed, Toolfinder,
  Console.dev, Product Hunt "ship"/re-feature, StackShare. AlternativeTo (Tier 2 overlap).
- **Communities not yet tapped (value-first, respect self-promo rules):**
  r/productivity (deeper, not just launch post), r/Entrepreneur, r/consulting,
  r/macOS, Indie Hackers (build-in-public milestone posts), Lobsters (if technical enough).
- **Build-in-public on X.** The "3 customers, 100% conversion, $9 one-time" story is a
  genuinely good indie-hacker narrative — revenue milestones, "what I learned"
  threads. Feeds the indie crowd *and* signals momentum to press.

## Tier 4 — Paid & retargeting (only after Tiers 1–2 show which message converts)

- Small-budget test ads on LinkedIn (exec targeting) and Google Search (the intent
  keywords from Tier 2) — *not* broad Reddit/Twitter display. Because conversion is
  already high, even modest qualified paid traffic could pay back. Hold until you know
  which vertical framing (Tier 1) resonates, so you're not paying to learn positioning.

---

## Assets you already have to repurpose
- `marketing/helm-demo-20s.mp4`, `helm-demo.gif`, `helm-demo-insert-9x16.mp4` — video for
  LinkedIn / X / Shorts / YouTube.
- `website/helm-launch-web.mp4` — landing / social.
- `ads/twitter_thread.md`, `reddit_productivity.md` — adapt tone for LinkedIn / EA posts.
- `marketing/founder-technical-faq.md` — objection handling for outreach replies.

## What to measure (so this isn't guesswork)
- **Traffic source → download** via the R2 read metrics + a UTM per channel on the
  download link. You already confirmed downloads ≈ purchases, so treat *downloads* as
  the near-term north-star metric and attribute them by source.
- Watch which Tier-1 framing drives the most download clicks before spending on Tier 4.

## Recommended first two weeks (concrete)
1. Stand up the LinkedIn founder cadence + first exec-productivity post with the 20s demo.
2. Write the first 3 SEO articles targeting the intent keywords above.
3. Submit to the 5 cross-platform directories in Tier 3 + an AlternativeTo listing.
4. Add UTM tags to every download link so Tier-1/2 experiments are measurable.
