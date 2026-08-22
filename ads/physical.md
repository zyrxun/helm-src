# Physical Channel — Talk + Stickers (Auckland)

> Internal playbook. Expectation set honestly: physical work in one city seeds
> testimonials, feedback, and launch-day commenters — it does not move
> download numbers. Budget the effort accordingly.

## Lightning talk (optional — founder's call)

> Founder note (Jun 12): the club channel below is promotion-first, no talk
> required. This outline stays as the *option* for general dev meetups. If
> the engineering framing feels dishonest without deep internals knowledge,
> the no-internals variant is a story talk — "How I shipped a Mac app as an
> undergrad" — where Q&A is about the journey, not the AX tree. Either way,
> study `marketing/founder-technical-faq.md` first.

Helm's unfair advantage in person: the demo is ten seconds and looks like
magic. Pitch the talk as engineering, not product — Helm appears only as the
demo.

**Title:** Automating macOS with JXA — the API everyone forgot

**Outline (5–7 min):**
1. JXA exists: JavaScript for Automation shipped in 2014, then everyone
   forgot about it. What it can do that Shortcuts and URL schemes can't.
2. Real Apple Events vs. simulated clicks — why it matters for reliability.
3. War story: detecting which Chrome profile owns a window. The AX tree gives
   you window titles on the current Space; the History SQLite fallback covers
   everything else; both can be wrong in different ways.
4. Live demo: one click, the screen assembles itself. (This is Helm — say so
   once, put get-helm.app on the closing slide, move on.)
5. Takeaway: the Mac is still the most automatable consumer OS, and the good
   APIs are the old ones.

**Venues:** Auckland dev meetups with lightning slots (JS/general dev nights,
any Apple/Cocoa group, indie-hacker meetups, coworking demo nights). Find the
next one with an open slot; July timing is fine — post-launch demo includes a
real download link.

**Bring:** stickers (below), the 10-second muscle-memory version of the demo
rehearsed on your own machine, a fallback screen recording in case of venue
wifi/display issues.

## Stickers / QR cards

**Spec (per brand.md):** wheel mark in Sovereign Gold `#D4AF6A` on Abyss
`#0A1628`, no gradients, no glow. Wordmark in Playfair Display 700,
letter-spacing 0.06em. One line in Inter: "free for two workflows ·
get-helm.app". QR to https://get-helm.app.

- Die-cut circle sticker: mark only, 50mm
- Card: 88×55mm, mark + wordmark front, line + QR back
- Order by ~Jun 20 to have them for July events

**Placement:** meetup tables, coworking common areas, university CS labs.
Always ask the venue first — uninvited flyering reads as desperate, which is
off-brand.

## University route — club targets (verified Jun 12)

| Club | Uni | Best contact | Backup |
|---|---|---|---|
| **WDCC** — Web Dev & Consulting Club (runs NZ's largest tertiary hackathon with SESA) | UoA | Instagram DM [@wdccuoa](https://www.instagram.com/wdccuoa/) | [UoA Engage directory listing](https://auckland.campuslabs.com/engage/organization/WDCC), [LinkedIn](https://nz.linkedin.com/company/wdccuoa) |
| **SESA** — Software Engineering Students Assoc | UoA | Contact form at [sesa.org.nz/contact](https://sesa.org.nz/contact) | Instagram @sesa.uoa, Discord discord.gg/93AW5tMSBc |
| **DSC (GDSC)** — Developer Student Club | UoA | Email **hello@dscuoa.nz** | Discord via dscuoa.nz |
| **AUT CSEA** — Computer Science & Engineering Assoc (400+ members, "Most Impactful Club" award) | AUT | [Facebook page](https://www.facebook.com/AUTCSEA/) DM | [LinkedIn](https://nz.linkedin.com/company/autcsea) |

**Channel rule:** email/contact-form first (formal, forwardable to the events
exec), then a two-line Instagram DM the next day — "sent you an email about a
giveaway for your members." Student clubs answer DMs faster than email; the
email is what they forward internally. Don't pitch in public Discord channels. Don't address
named execs from club websites — rosters rotate every year and the listed
names are often stale; write to the role ("events team").

**Timing:** Jun 23 send lands in mid-year break (Semester 1 exams just
ending). Expect replies as Semester 2 planning starts, talks landing
mid-July onward — which is ideal: post-launch, real download link.

## Ready to send — Jun 23 (copy-paste per club)

> **The ask is promotion, not stage time** (founder call, Jun 12): free Pro
> licenses for the exec team + 10 to give away to members + the 20-second
> demo video for their Discord/newsletter/Instagram. No talk required. A
> passive line offers a five-minute "how I shipped this as a student"
> session — that's a story talk, zero internals needed; drop the line
> entirely if unwanted.
>
> **License mechanics:** keys are minted per-email (`scripts/generate-key.js`),
> so a "giveaway" is: club collects winner emails → you mint and send the
> keys. Each key activates on two machines. Ten per club is the default; scale
> up for a large membership.
>
> **Framing:** student productivity — one workflow for lectures, one for
> assignments, one for the part-time job. "Free for two workflows" already
> covers most students; say so, it makes the offer feel honest rather than
> bait.

### 1 · DSC — email to hello@dscuoa.nz

**Subject:** Free Pro licenses for DSC members — Semester 2

> Hi DSC team,
>
> I'm Richard — born and raised in Auckland, currently an undergrad at the
> University of Michigan, home for the break until late August. I built Helm,
> a macOS menu bar app that opens your whole working setup in one click —
> one workflow for lectures, one for the assignment grind, one for the
> part-time job. It's free for two workflows, which covers most students.
>
> Rather than ask for stage time, I'd like to give your members something
> for Semester 2: free Pro licenses for your exec team, 10 more to give
> away however you like (raffle, event prize, Discord giveaway), and a
> 20-second demo video.
>
> Would you be open to sharing it with your members — a quick post in your
> Discord or newsletter alongside the giveaway? I'm happy to write the blurb
> so it's no work on your end.
>
> If a five-minute "how I shipped this as a student" session is ever useful,
> I'm around until late August — otherwise the video does the job.
>
> Who's the right person to sort this with?
>
> Richard
> get-helm.app

### 2 · SESA — contact form at sesa.org.nz/contact

> Hi SESA team — I'm Richard, Auckland born and raised, an undergrad at the
> University of Michigan, home for the break until late August. I built Helm,
> a macOS menu bar app that opens your whole working setup in one click —
> lectures, assignments, part-time job, each its own workflow. It's free for
> two workflows. For Semester 2 I'd like to give your members something:
> free Pro licenses for your exec team, 10 more to give away however you
> like, and a 20-second demo video. No stage time needed. Would you be up
> for sharing it with your members — a post in your Discord or newsletter
> with the giveaway? Happy to write the blurb so it's no work on your end.
> Who's the right person to sort this with?
> — Richard, get-helm.app

### 3 · WDCC — Instagram DM to @wdccuoa

> Hi WDCC — I'm Richard, an Auckland local and undergrad at the University
> of Michigan, home for the break. I built Helm, a menu bar app that opens
> your whole Mac setup in one click — free for two workflows. I'd like to
> give your members something for Semester 2: Pro licenses for your exec,
> 10 more to give away, and a 20-second demo video. Would you share it with
> your members — a post on your channels with the giveaway? Happy to write
> the caption so it's no work for you. Who should I sort this with?

### 4 · AUT CSEA — Facebook page DM

> Hi CSEA — I'm Richard, an Auckland local and undergrad at the University
> of Michigan, home for the break until late August. I built Helm, a menu
> bar app that opens your whole Mac setup in one click — free for two
> workflows. For Semester 2 I'd like to give your members something: Pro
> licenses for your exec team, 10 more to give away however you like, and
> a 20-second demo video. Would you share it with your members — a post on
> your page or Discord with the giveaway? Happy to write the caption so it's
> no work for you. Who should I sort this with?

### Non-CS template (Velocity + any club from the directories below)

> Hi [club] team — I'm Richard, Auckland born and raised, an undergrad at
> the University of Michigan, home for the break until late August. I built
> Helm, a Mac app that opens your whole working setup in one click — one
> workflow for lectures, one for assignments, one for whatever else fills
> your week. It's free for two workflows. For Semester 2 I'd like to give
> your members something: free Pro licenses for your exec team, 10 more to
> give away however you like, and a 20-second demo video. Would you be open
> to sharing it with your members — a post on your channels with the
> giveaway? Happy to write the blurb so it's no work on your end. Who's the
> right person to sort this with?

### Jun 24 follow-up DM (to any club emailed the day before)

> Hi — sent you an email yesterday about a Pro-license giveaway for your
> members next semester. Flagging it here since inboxes are quiet over the
> break. No rush.

## Non-CS clubs (the productivity angle travels)

Helm helps any student who context-switches, not just developers. Two
caveats before going wide: it's **macOS only** (prioritize Mac-heavy
memberships — business/entrepreneurship, design, law, med) and a club promo
is only worth their post if the free tier genuinely serves members — it does
(two workflows free, forever).

| Target | Why | Where |
|---|---|---|
| **Velocity** — UoA's entrepreneurship programme (student committee of ~30, runs year-round talks/competitions) | Founder-adjacent students, Mac-heavy, loves student-built products | [velocity.auckland.ac.nz](https://www.velocity.auckland.ac.nz/) |
| UoA clubs by category (business, design, law, med) | Browse and pick 3–5 Mac-heavy ones | [UoA Engage directory](https://auckland.campuslabs.com/engage) |
| AUT clubs | Same filter | [AUT clubs & activities](https://www.aut.ac.nz/student-life/around-campus/clubs-and-activities) |

Send the non-CS template above. Same channel rule (email/form first, DM
next day), same Jun 23 batch or a second batch once CS replies land.

## University route — clubs first, then posters

The legal/effective order of operations:

1. **Email the exec of a club** (CS, entrepreneurship, or any Mac-heavy
   club at UoA/AUT) — one person, one personalized email: exec Pro licenses
   + member giveaway + demo video. This is legitimate one-to-one outreach
   AND it unlocks club sponsorship for posters. Never bulk-email students or
   departments — NZ's Unsolicited Electronic Messages Act is consent-based,
   and it would torch the get-helm.app sending domain right when license
   emails need to deliver.
2. **Posters: designated notice boards only, with approval.** Both UoA and
   AUT require a stamp/approval (student services, or sponsorship by a
   registered club). Unauthorized posters come down same day. Off-campus
   postering (poles, bus stops) breaches Auckland Council bylaws — skip.
3. **Artwork:** same spec as the QR card, scaled to A4/A3. QR to
   get-helm.app. Post the week after launch so the QR hits a real download.

## Watched number

People who give you an email or scan the QR per event — not stickers handed
out. Five engaged people who comment on launch day beat fifty stickers.
