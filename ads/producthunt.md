# Product Hunt — Launch Copy (July 1)

> Status: **DRAFT — founder review required before any of this publishes.**
> Voice + pricing rules per `public/brand/brand.md`. Every product claim below is
> verified against the build (`FREE_LIMIT = 2` and teardown gating in
> `electron/main.js`). Hunter must be confirmed by **June 24** (SCHEDULE.md).

---

## Listing

**Name:** Helm

**Tagline** (chosen — Jun 24, 51 chars):

> One click. Every app, tab, and window in position.

Alternates (unused):

> Your entire workspace, one click from the menu bar
> Open your whole Mac workspace in one click

**Topics:** Mac · Productivity · Menu Bar Apps · Developer Tools

**Links:** https://get-helm.app

**Description** (~239/260 chars):

> Helm sits in the macOS menu bar. One click opens every app, tab, and window a
> workflow needs. Capture turns your real screen into a workflow. Free for two
> workflows. $9 one time unlocks unlimited workflows and teardown. No
> subscription.

---

## Gallery (asset pointers, not copy)

1. **Demo video** — 20-second PH cut (AD_TODO.md → "Product Hunt demo video")
2. Popover, idle state — three named workflows, gold run buttons
3. Capture flow — mid-selection, profile picker visible
4. Running state — green wheel, dimmed rows
5. Pricing card — "Free for two workflows. $9 unlocks everything. No subscription."

---

## Maker first comment

Hi, I'm Richard — an Auckland-born undergrad, and I built Helm.

It started with a count: rebuilding my environment after a context switch — the
right Chrome profile, the right Slack channel, the VS Code workspace, the
windows arranged — took about five minutes, and I was doing it six times a day.

Helm lives in the macOS menu bar. One click opens an entire workflow: every
app, every tab, every window, in the state you need.

The part I'd want you to try first is Capture. Helm reads your current screen
and turns it into a workflow — apps, Chrome tabs with their profile, the VS
Code workspace, the Slack channel, open files. You build by doing, not by
configuring.

Worth knowing:

- It talks to macOS through JXA and the Accessibility APIs, not URL schemes or
  shortcut hacks.
- Chrome tabs open in the right profile, detected automatically. Override with
  one click.
- Teardown is the reverse move: one click closes a workflow's apps and tabs,
  per Chrome profile, leaving everything else alone.
- Workflows live on your machine, in Application Support. No account.

Pricing is one decision, made once: Helm is free for two workflows, forever.
$9 unlocks everything — unlimited workflows and teardown. One time. No
subscription.

I'm here all day. Ask me anything — especially the hard questions about Chrome
profile detection.

---

## Launch-day email blast (waitlist)

**From:** Richard at Helm `<noreply@get-helm.app>` *(domain verified in Resend, Jun 12)*
**Subject:** Helm is out
**Alternate subject:** Helm ships today

> Helm is out.
>
> You signed up to hear when it ships. This is that email.
>
> **Download for macOS:** https://get-helm.app
>
> One click from the menu bar opens your entire stack — every app, every tab,
> every window, in position. Point Helm at your current screen and Capture
> turns it into a workflow.
>
> Helm is free for two workflows. $9 unlocks everything — unlimited workflows
> and teardown. One time. No subscription.
>
> — Richard
> Helm. Take the wheel.

**✅ Sequencing — decided (Jun 13):** send at **8am NZT July 1**, PH paragraph
**cut** (PH isn't live until 7pm NZT, so the link wouldn't exist at send time).
The download CTA stands on its own; PH gets its push from the Coming Soon
followers and the launch-day X thread. If you later want the list to hear about
PH, send a separate short note a day or two post-launch — never a second email
on launch day.
