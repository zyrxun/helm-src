# r/macapps Megathread Comment

> Helm is not in the Mac App Store, so per subreddit rules this goes in the
> weekly promotion megathread, not the main feed. Format below is the required
> PCP (Problem, Comparison, Pricing).
>
> Two hard rules to remember before pasting:
>
> 1. No em dashes. No curly quotes. The sub explicitly flags em dashes as an
>    AI-writing tell that increases auto-removal odds. This draft is already
>    scrubbed; do not add any back when editing.
> 2. Verify the account has 10+ non-promotional karma and a verified email
>    before posting. New accounts with a link in the first comment get 90%
>    auto-removed per sub rules.
>
> Link to include: https://get-helm.app
> Attach a short GIF (the tray-click demo cut). Static app screenshots
> underperform here; a working GIF is worth more than any copy tweak below.

---

## The comment (paste this)

**Helm** (macOS menu bar workflow launcher)

**Problem:** Every time I switched projects I spent two or three minutes
rebuilding my screen by hand. Open Chrome in the right profile, load the four
tabs, open the VS Code workspace, jump Slack to the right channel, arrange the
windows. I was doing this six times a day. Death by a thousand cuts.

Helm sits in the menu bar. One click opens the whole setup: apps, Chrome tabs
in the right profile, the VS Code workspace, the Slack channel, the windows.
You build a workflow by capturing your current screen, not by writing config.
Teardown is the reverse: one click closes what a workflow opened, per Chrome
profile, and leaves the rest of your desktop alone.

**Comparison:**

* **Workspaces (Apptorium)** covers the same category, but you configure each
workspace by hand and it does not know which Chrome profile a tab belongs to or
which folder you have open in VS Code. Helm reads all of that off your live
screen and saves it in about five seconds.
* **Bunch** is powerful if you like writing text scripts to describe each
setup. Helm just captures what you have open right now. No scripting.
* **Raycast window management** arranges windows you already have. Helm opens
the stack in the first place, then arranges it. Different job.

Neither Workspaces nor Bunch has Teardown. That one turned out to matter more
than I expected once I was actually using it.

**Pricing:** Free for two workflows forever. Nine dollars, one time, unlocks
unlimited workflows and Teardown. No subscription. https://get-helm.app

I am the developer, in the comments for the day. Happy to get into how the
Chrome profile detection works or why JXA and the Accessibility APIs beat URL
schemes for this.

---

## What was cut vs the old draft (and why)

* Main-feed framing replaced with megathread framing. Helm is not MAS, so the
  main feed is not an option under the current rules.
* All sixteen em dashes removed. Sub explicitly calls this out as an AI tell.
* Added an explicit competitor block (Workspaces, Bunch, Raycast). The old
  draft had none and would have failed PCP validation.
* Dropped the "honest limits" paragraph. Reddit reads self-flagellation as
  either humblebrag or hedging. Keep those answers for comment replies where a
  user actually asks.
* Kept the developer sign-off at the bottom. On this sub, comment replies from
  the founder are the marketing.
