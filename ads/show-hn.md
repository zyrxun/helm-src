# Show HN — ⛔ DROPPED (founder decision, Jun 14)

> **Helm is NOT launching on Hacker News.** The founder is not doing HN — the
> live technical-Q&A of a Show HN thread is exactly the no-live-technical-format
> he's avoiding. This file is retained ONLY as a source of technical copy (JXA
> internals, Chrome-profile detection) for the JXA deep-dive writeup,
> r/programming, and `marketing/founder-technical-faq.md`. It is not an active
> launch channel — do not schedule, post, or revive it without a new decision.
>
> ---
> _Historical draft below (was: DRAFT, July 1 morning PT, from the founder's HN
> account; URL field get-helm.app, text below in the text field)._

**Title** (79/80 chars):

> Show HN: Helm – macOS menu bar app that opens your whole workspace in one click

Alternate (59):

> Show HN: Helm – one click opens your whole macOS workspace

**Text:**

I built Helm because rebuilding my environment after every context switch was
a five-minute tax I paid several times a day.

Helm is a macOS menu bar app. One click opens a workflow: every app, every
Chrome tab in the right profile, the VS Code workspace, the Slack channel.
Teardown is the reverse — it closes exactly what the workflow opened and
nothing else.

Technical notes, since this is HN:

- Automation is JXA (JavaScript for Automation) via osascript — real Apple
  Events, not URL schemes or simulated clicks.

- Chrome profile detection is two-source. A native Objective-C++ module walks
  the Accessibility tree and reads window titles (Chrome appends the profile
  name) on the current Space. The fallback copies each profile's History
  SQLite to /tmp and matches captured URLs by most recent visit, which covers
  minimized windows and other Spaces. If both miss, there's a manual picker.

- Capture enumerates your current screen and turns it into a workflow: apps,
  tabs, workspaces, open files. You build by doing, not by configuring.

- Workflows are JSON in ~/Library/Application Support. They live on your
  machine. No account.

- The license is an Ed25519-signed key the app verifies offline with an
  embedded public key; the server is only consulted for a two-machine device
  limit.

Pricing: free for two workflows, $9 one time for unlimited workflows plus
teardown. No subscription.

Honest limits: macOS only. Profile attribution can miss a URL opened seconds
ago (Chrome hasn't flushed it to the History DB yet). And because macOS TCC
binds permissions to the code-signature hash, some upgrades re-prompt for
Accessibility.

Happy to go deep on the JXA or AX internals.

---

## Posting rules (HN-specific)

- Post **morning PT** (8–10am) on launch day — separate audience and timing
  from the midnight-PT Product Hunt push.
- Reply to every comment for the first 3–4 hours; the technical questions ARE
  the marketing.
- Never ask anyone to upvote or share the direct link for voting — HN flags
  voting rings and kills the post.
- If it doesn't take off, one resubmission a few days later is accepted
  practice.
- Watched number: HN referral signups/downloads on July 1 (UTM won't survive
  HN link cleaning — watch the referrer in analytics instead).
