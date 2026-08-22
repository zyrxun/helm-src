# Founder Technical FAQ — study sheet

> Internal. Every answer below is derived from the actual codebase (CLAUDE.md
> + source), so you can say all of it with a straight face. Read it three
> times before Jun 19 (press sends) and again before the talk. The rule in
> any live setting: never bluff past the written answer — "I'd have to check
> the exact mechanism, I'll get back to you" is a respected answer everywhere.

## How Helm works, in six sentences (memorize this)

Helm is an Electron app that lives in the macOS menu bar. When you run a
workflow, it spawns `osascript` processes running JXA scripts — JavaScript
for Automation, Apple's JavaScript interface to Apple Events — one per app,
which open each app with the right URL, file, or workspace. Capture works the
same way in reverse: a JXA script asks macOS which apps and windows are open
and pulls structured state from each known app — Chrome tabs, the VS Code
workspace, the Slack channel, open files. Chrome profile detection combines a
native Accessibility module (reads window titles, which include the profile
name) with a fallback that checks each profile's browsing-history database
for the captured URLs. Workflows are stored as JSON on the user's machine in
Application Support. The license is a cryptographically signed key the app
verifies offline; the server is only contacted to enforce a two-machine limit.

## The questions, with answers you can say out loud

**Q: What's JXA?**
JavaScript for Automation. Apple shipped it in 2014 alongside AppleScript —
same Apple Events engine underneath, but you write JavaScript. Almost nobody
uses it, which is a shame, because it can do everything AppleScript can.

**Q: Why JXA instead of Shortcuts or URL schemes?**
URL schemes and Shortcuts can *open* things. Apple Events let you *query and
control running apps* — read Chrome's tabs, ask which windows exist, close
one specific tab in one specific profile. Helm needs that second category.

**Q: How does Capture actually work?**
A JXA script asks System Events for the visible processes. For each app type
Helm knows, it pulls structured state: Chrome gives tab URLs and titles, VS
Code gives the workspace, Slack gives the channel, Preview gives open file
paths. The Electron side then cleans that up and attributes Chrome tabs to
profiles.

**Q: The Chrome profile thing — how? (your war story, know it cold)**
Two sources. First, a small native Objective-C++ module uses the
Accessibility API to read Chrome's window titles — Chrome appends the profile
name to the title when you have multiple profiles. That only sees the current
Space. Second, the fallback: every Chrome profile keeps its own History
database (SQLite); Helm copies each one to /tmp and asks "which profile
visited this URL most recently?" That covers minimized windows and other
Spaces. If both miss, there's a manual picker. Honest limitation: a URL you
opened seconds ago may not be in the History DB yet.

**Q: How do tabs open in the right profile?**
`open -a "Google Chrome" --args --profile-directory="Profile 2" <url>` —
Chrome's own command-line flag. No hacks.

**Q: What permissions does it need?**
Accessibility (for the window-title reads) and Automation (for Apple Events).
No screen recording. macOS prompts for both; Helm shows a gate screen
explaining it. Known wrinkle: macOS ties those grants to the app's code
signature, so some upgrades re-prompt. That's a macOS behavior, not a bug we
can fully remove.

**Q: Where does my data live? Is there telemetry?**
Workflows are JSON in ~/Library/Application Support on your machine. No
account, no sync, no server that sees your workflows. There is no crash
reporting or telemetry — nothing leaves your machine unless you explicitly
submit a bug report (which sends only the text you write, plus the recent log
lines if you tick the box). It's fine to say "your workflows live on your
machine and the app sends nothing automatically."

**Q: How does the license work?**
The key is signed with Ed25519. The private key lives only on the server; the
app ships the public key and verifies your license offline. Activation pings
the server once to enforce a two-machine limit. If you're offline, it
verifies locally — you can't forge a key without the private key, so that's
safe.

**Q: Why $9 one-time and not a subscription?**
It's a local app; running it costs us nothing per user, so charging monthly
would be rent-seeking. Free for two workflows forever; $9 unlocks unlimited
workflows and teardown. One decision, made once.

**Q: Why not just use Raycast / Alfred / Bunch?**
Launchers open one thing fast. Helm restores an entire working state — every
app, tab, and window, per Chrome profile — and tears it down afterward. And
you don't write a config: Capture reads your screen and turns it into the
workflow. (Bunch is the closest concept and it's config-file based.)

**Q: Why Electron? Isn't that heavy?**
Honest answer: it was the fastest way to ship, and the app is a tray icon
and one popover, so the UI surface is small. The current build is heavier
than it should be and slimming it is on the roadmap. Don't get defensive —
agree, and pivot to what the app does.

**Q: Windows / Linux version?**
No. The whole product is built on macOS-specific APIs — Apple Events,
Accessibility, the menu bar. A port would be a different product.

**Q: What about Safari / Arc / Firefox?**
Chrome is what's deeply supported today (profiles included). Other apps still
open and close at the app level. More browsers is roadmap, not promise.

**Q: Did you write this yourself? / Did AI write this?**
Be straight: "I built it with heavy AI assistance — most founders do now. I
own every design decision in it, and I can walk you through how any part
works." Then do so, using this sheet. Evasion fails; this answer doesn't.

**Q: What was the hardest part?**
The Chrome profile attribution (tell the war story above). Second hardest:
macOS permission re-prompts when the code signature changes between builds.

**Q: Is my browsing history being read?!**
Only locally, only to match the URLs you just captured to a profile, and the
copy in /tmp is Helm reading your machine on your machine. Nothing is
uploaded anywhere.

## Live-setting rules

1. Demo first. The demo answers half the questions before they're asked.
2. If a question goes past this sheet: "Good question — I'd have to check
   the exact mechanism. Ping me on Discord/email and I'll give you the real
   answer." Then actually do it (with a Claude session open on the code).
3. On launch day (PH), keep a session open on the codebase and verify
   before replying to anything technical. Async buys you that.
4. Never argue with a correction. "You might be right — let me check" wins
   the room; defending a wrong answer loses it permanently.
