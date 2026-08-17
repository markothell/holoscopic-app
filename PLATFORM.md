# Platform — One Platform, Many Activities

The unification plan: how six separate products on six subdomains become one platform with one
shared user base, one social spine (circles), and a birth path for tens of future activities.
Written 2026-08-10 out of three design sessions (homepage narrative → unification audit → scaling
model). This is the execution doc; work it milestone by milestone across sessions.

Sibling docs: `PLATFORM_NEXT.md` holds deferred breaking changes we've decided to live with;
per-app plans live in `apps/*/PLAN.md`. This file is for the work that cuts across the monorepo
and is being done *now*, in order.

---

## §1 What this is (one screen)

Holoscopic has been six experiments, each a product: Map+Sequence, interView, On a Spectrum,
Synthesis, Chorus, Threshold. Each asked a question about how groups learn together, and each
contributed reusable elements — 2D maps, sequenced rounds, tokens, voice stories, polarity
sorting, LLM synthesis, circle membership.

The next dimension assembles them. A **circle** is a group of people who gather, each on their own
time, to run activities together and keep what they make. Circles gather too — several circles
meet World Café style, members mixing across tables, carrying the exchange home. The pattern holds
at every scale: a circle of circles is itself a circle, and the platform is the outermost one.

Getting there is mostly consolidation, because the hard half exists: **one backend, one database,
one global `User` collection** — the same email/password already works in every account-bearing
app. What's fragmented is everything around the account: five copy-pasted auth stacks whose
cookies can't cross subdomains, seven frontends with no shared shell, four identity mechanisms, and
hand-maintained lists (CORS, Beacon allowlist, homepage cards) that grow linearly with every new
activity. This plan closes those seams and then changes what "new activity" means — from "new
deployment" to "new row."

## §2 The invariant

The test every future PR is held to. Each item on the second list is tolerable once and fatal at
thirty.

> **Adding activity N requires:** a manifest row (Tier A), or a package plus a manifest row
> (Tier B).
>
> **Adding activity N may never require:** a Vercel project, a DNS record, a `CLIENT_URL` entry,
> an env var, a schema migration, an enum edit, a new notification type, a new email pathway, or a
> copy-pasted component.

When a proposed activity seems to need something from the second list, that is the signal a
primitive is missing — and the primitive is what gets built.

## §3 The three tiers

**Tier C — standalone app.** Own Next.js app, own subdomain, own Vercel project. Reserved for
flagships whose links must stand alone (a Chorus memorial is a thing you send to a grieving
family; it needs its own address). This is today's model for everything; it stays rare going
forward. Marginal cost: everything.

**Tier B — package in the host app.** An activity is a workspace package mounted as a route group
in one shared "play" app — one Vercel project serving every packaged activity. New activity = new
package + a manifest row. The origin set never grows again. Marginal cost: the activity's own UI.

**Tier A — composition, no code.** An activity is a manifest: a phase list plus primitives with
configuration and copy. `share(voice, 60s) → sort(buckets) → reveal(spectrum)` *is* Threshold,
expressed as data. Defined in the platform admin, live immediately. Marginal cost: a row.

**The promotion path runs downward.** Experiments prototype at Tier B (or C when they need their
own identity); the parts they prove get extracted into primitives; successors are born at Tier A.
The pattern already happened once: Threshold needed a recorder, Chorus had one, it became
`@hs/audio` — the third voice activity gets recording for free. Experiments are how primitives get
discovered; the platform is how they get reused. Existing apps migrate opportunistically or never
— spectrum and synthesis can stay Tier C indefinitely while everything new is born inside the
platform.

## §4 Settled decisions

P-numbered; per-app decisions (Threshold's D1–D20 etc.) stay in their own plans.

- **P1 — Three tiers, promotion downward.** §3 above. The tier is a property of the activity's
  packaging, never of its social behavior — a Tier A activity runs on the same circle machine as a
  Tier C one.
- **P2 — Subdomains stay; SSO comes from a `.holoscopic.io` domain cookie.** Single-domain
  multi-zone routing is deferred, available later without redoing anything. Separate Vercel
  projects preserve independent deploys and the one-app-per-agent workflow for the Tier C apps
  that remain.
- **P3 — One secret.** `NEXTAUTH_SECRET` becomes a single value across every Vercel project,
  equal to Render's `GAME_TOKEN_SECRET` (game-token verification already silently requires this).
  Game tokens gain `aud`/`iss` claims. Rotating the secret logs everyone out; pre-launch that
  costs nothing.
- **P4 — Three shared packages: `@hs/auth`, `@hs/api`, `@hs/shell`.** Auth options + game-token
  mint; fetch/error/token-cache/socket-handshake client; header/account-menu/notifications/footer/
  Beacon. The shell stays light — UI chrome and fetch only, zero activity-engine dependency — for
  the same reason Chorus never imported `@hs/activities`.
- **P5 — Account-optional is a platform property.** Chorus stays account-free by design (its
  PLAN §10). The shell must render a coherent header for an anonymous visitor. The platform
  admin's separate localStorage scheme stays separate; it is an operator tool.
- **P6 — The circle is the scaling unit; the instance is tenancy.** Platform activities all live
  in **one platform instance**; circles do the scoping (Threshold's D20 made membership, not the
  instance, the access boundary — that generalizes). `Instance` remains for genuinely separate
  tenants (a school running a sealed deployment). A new activity never means a new instance.
- **P7 — The activity registry is data, in exactly one place.** One manifest (key, name, blurb,
  primitives used, tier, status: experiment | live | retired, entry URL) that the homepage card
  stack, the dashboard, the platform admin, and the Beacon `app` allowlist all read. Today that
  list lives in four hand-edited places; at N=30 they drift.
- **P8 — Storage belongs to primitives, not activities.** A voice-share model any activity can
  write; a placement model (buckets, rankings, positions) any activity can write; each keyed
  `(circleId, seedId, userId)` plus primitive payload, each with its redaction rules implemented
  once. Threshold's three-state redaction (own-only → anonymous → attributed) is a property of
  *share-then-reveal*, not of Threshold. Per-activity models (`ThresholdShare`, `Memory`) were
  right for experiments and stay put; the primitive models arrive with the next activity that
  would otherwise define its own (see M7).
- **P9 — The backend stays activity-agnostic, as a stated rule.** The circle layer already
  encodes it: `circle_phase` is one notification type for every activity's every phase, config
  keys derive from phase names, seed payloads are opaque. A new activity may not require a schema
  migration, an enum edit, a new notification type, or a new email pathway.
- **P10 — The homepage speaks two registers.** Experiments are lab notes: first person singular,
  past tense, signed MO, dated, typographically quiet. The offer (Circles) is an invitation:
  present tense, we/you, section-scale type. The word is **experiments**, never "prototypes" — in
  a lab-notes voice "experiment" reads as rigor, next to an offer "prototype" reads as
  disclaimer. Element chips use one controlled vocabulary (~10 terms) and are the same visual
  component in both registers — their recurrence across cards, then their gathering in the
  Circles section, is the entire mix-and-match argument, made without a sentence of explanation.
- **P11 — Announcements: capture cheap now, broadcast legitimately later.** Interest capture
  reuses `models/Signup.js` with a new `source` today (zero schema work). Outbound broadcast
  waits for `User.emailPrefs` (announcements / circle mail) — the only opt-out today is
  per-circle-member, and platform-wide mail without account-level preferences is spam. Long-term,
  announcements become the root circle's mail (P14).
- **P12 — Open activities form from email first, accounts at start.** An admin-defined standing
  topic (topic + polarity + room size) accumulates signups; **when the room fills**, the former
  stamps a single-mode `Circle` from the template (Threshold's D1: one seed, authored by the
  template; `requireInvitation: false` already exists), attaches the cohort, and starts the round.
  Threshold requires accounts (its D6), so the landing page asks only for email; the "your round
  is starting" moment is when a signup converts to an account. The background tick already runs a
  started circle unattended — formation is the only missing piece. Revised 2026-08-10: these are
  *activities*, per the P15 vocabulary line — the word "circle" never appears on them.
- **P15 — The word "circle" is reserved for groups with continuity** (MO, 2026-08-10). The
  `Circle` model is the machine and runs everything; the *word* belongs only to a group gathering
  to do more than a single activity together. The commitment ladder has three rungs, and the
  rollout climbs it:
  1. **Open activity** — impromptu, randomly assembled, one run. Sign up with an email, the room
     fills, it happens, you keep the artifact. A single-mode `Circle` under the hood; "session" /
     "activity" in every user-facing word.
  2. **A circle** — ongoing membership, its own history, cycles of activities. **Host-initiated
     only for now**: MO starts one and invites people (`invitedEmails` + `requireInvitation:
     true` + `joinCircle` enforcement all exist in the backend already). Crowd discovery of
     circles is deliberately unspecified — no vision yet, so no surface gets built; the repo's
     consumer-#2 rule applies to social features too.
  3. **The platform** — today, the announcements list; later, a "join the platform" invitation
     sent to that list around an actual planned event, launched independently of the homepage.
     Eventually the root circle (P14).
- **P13 — Circle-of-circles is designed, and deliberately unbuilt.** The recursive step is two
  additions: `memberCircleIds[]` with people-membership snapshotted at event start (a delegation),
  and a World Café module registered on the existing 7-hook seam — phases like
  `gather → table rounds (×N) → harvest`, where per-round work is a table assignment mixing
  members across home circles, each table makes an artifact from existing primitives, and harvest
  rolls up to the event and flows back to each home circle as *its* artifact. Nothing lands in the
  schema until the first café event is actually being built — the repo's own rule: until
  consumer #2 exists, a second public surface is speculation.
- **P16 — The homepage argues, the landers explain, the apps ask** (MO, 2026-08-11). The
  homepage's arc is **idea → shape → experiments → the platform**, and it ends on the pitch rather
  than on a form full of choices. Three consequences, each of which moved something:
  - **The Venn is the second beat.** Holoscopic is three familiar things at once — a personal
    development workshop (a transformative social process, the way NVC and Imago dialogue are),
    social media (the human bazaar, with mechanisms for elevating the ideas that work), and open
    source software (a platform where people share, experiment and iterate on tools for social
    coherence). Drawn as three overlapping circles with Holoscopic at the overlap; the drawing is
    the argument and the three rows under it are the gloss.
  - **Circles is an experiment card with a lander** (`/circles`), subtitled *building block for
    **whole** society* — the one sub-line on the page with a word carrying weight, so the line
    itself sits neutral and the accent lands on "whole". The lander opens on the circle as a
    social model with ancient roots (all equal, all facing a common centre; four to twelve people
    gathering to share experiences, explore ideas, develop process together), then the recursion:
    circles gather into groups of circles that act as thinking collectives, each new layer with
    its own activities and feedback loops. The drawing carries three layers — people, circles,
    and the neighbouring circles cropped by the frame. It offers no way to start a circle — P15 rung 2
    is still invitation-only. The five principles are **deleted**, not moved: the offer register
    reads better as one claim than as five, and each principle's content survives in the app
    landers and the manifesto.
  - **Open sessions moved to Threshold's front door.** Rung 1 belongs to the app that runs it, so
    the standing-topic picker + email capture lives at threshold.holoscopic.io, and Threshold's
    `/new` creates one-off **sessions** only. Ongoing circle creation left the UI entirely: MO
    starts those from the platform admin (Q6). The homepage keeps exactly one form, the
    `platform-updates` list, on the platform section and on `/circles`.
- **P14 — The platform is the root circle.** `requireInvitation: false`, joined by creating an
  account; platform announcements are its `notificationFor`. "Sign up for announcements" and
  "join the outermost circle" become the same act. Eventual; P11 is the bridge.
- **P17 — Circles is the pitch, the gathering is the ask** (MO, 2026-08-12). Circles is the
  social model that gives the other explorations their context, so it leaves the card stack and
  becomes the homepage's own section. The arc is now **idea → shape → model → instruments →
  invitation**. Four consequences, each of which moved something:
  - **The Model section** absorbs the platform pitch ("We are whole" is its headline) and carries
    `components/GatheringArt.tsx` (MO, 2026-08-12: the concentric drawing "isn't hitting"): the
    model as a lit journey in the theme-web idiom — YOU → A CIRCLE → A COLLECTIVE, one crimson
    thread through three scales, grey feeders showing others arriving. The `/circles` lander
    (still the long read) carries the same figure; `CircleOfCirclesArt` is currently unused.
    **Vocabulary (MO, same day): user-facing copy says "circles gather" and calls the result a
    "collective"** — "circle of circles" stays an internal design term (P13) and appears in no
    rendered copy.
  - **The Invitation is the one ask**, and the event is the recursion demonstrated: the first
    gathering is sized to fit the crowd — several circles form as seats fill, each runs one cycle
    over a few weeks, then the circles meet World Café style. Capture writes `Signup` rows with
    `source: 'first-gathering'` (homepage and `/circles` both), so seats are countable apart from
    the old `platform-updates` list. MO organizes the event to fit the resulting crowd.
  - **The experiments are "The Instruments"** — what a circle plays. All six cards stay, and they
    stay lean — title, subtitle, chips (MO, 2026-08-12: the cards are there to show people ideas,
    and Map + Sequence's looks good; a status-line experiment — `open sessions` / `demo open` /
    `hosted editions` — was tried the same day and removed at MO's read).
  - **Demos funnel into the event.** Each app's interactive sample (Ellen Vance, the Synthesis
    sample idea, Relationship Blueprint; a Threshold reveal demo is the missing one that matters)
    gets a quiet return line pointing at the invitation — touch an instrument, then take a seat.
    Not yet built on the app side.

- **P18 — Circles is the first product, and the brand is Holoscopic** (MO, 2026-08-14; revised
  the same day — the morning's Toyrok name and its separate toyrok.com apex were dropped before
  anything deployed). One brand, a branded house: the unified product ships to
  **circles.holoscopic.io** as **Holoscopic** — tagline: **thinking tools for community** — with
  the instruments (Threshold, Synthesis, …) as named features inside it, never sub-brands. The
  holoscopic.io homepage stays the lab face — experiments, lab notes, the manifesto — and
  primitives graduate from lab to product, visibly, under the one identity. Five consequences:
  - **`apps/circles` is M6's host app, born with a brand** instead of as a generic "play" app:
    one Next.js shell on its own subdomain, activities mounted inside as packages (Tier B), the
    invariant (§2) holding from day one.
  - **v1 scope:** sign in → my circles → the **circle home** (the map built 2026-08-14 on
    Threshold's circle page is the prototype: members on a ring, shared explorations sized by
    participation, solo spurs) → **Threshold and Synthesis** as the first two activities inside,
    rebuilt in the Toono language. Synthesis picks up two feature updates on the way in:
    audio, and editable edges.
  - **Same apex, so the P2 cookie path holds.** circles.holoscopic.io sits on `.holoscopic.io`,
    restoring the domain-cookie SSO that the toyrok.com plan had broken and accepted losing.
    Same backend, same global `User` collection; deploy needs CORS (`CLIENT_URL`) + the shared
    secret, same pattern as every other subdomain.
  - **The circle home map generalizes on the module seam.** Participation moves off direct
    `ThresholdShare` reads to a per-activity read hook, so the map never knows what a "share"
    is. The map is the Circle layer's consumer #2 — the trigger M8 was waiting on for promoting
    generic circle operations to `/api/circles`.
  - **The visual language is designed first**, in its own design conversation (the Q5 rule),
    before app code. *Held 2026-08-14; MO chose **Toono*** — the ger's crown ring: felt grounds,
    larch ink, sky-blue reserved for what is live, ochre for solo work, a warm round serif for
    display. Toono is **Holoscopic's product design language**; its ring motif carries into the
    Holoscopic wordmark (the o's are the rings). The direction board (three directions, each
    skinned onto the circle-home map) is the session's artifact; the token spec lives in
    `apps/circles/DESIGN.md`.
  - **Accounts are Holoscopic accounts, presented as such** (MO, 2026-08-14, reversing the
    morning's Toyrok-branded-accounts rule): same backend, same global `users` collection, same
    email/password, and the product says so plainly. There is no porting story at all.

## §5 Current state worth knowing (from the 2026-08 audit)

What makes this cheap:

- All five `src/lib/auth.ts` and all five `api/auth/game-token/route.ts` are byte-near-identical
  copies — the extractions in M2 are pure deduplication that never had a chance to diverge.
- One `NEXTAUTH_SECRET` already spans the platform in dev AND — by construction — in
  production: no Vercel project sets a separate `GAME_TOKEN_SECRET`, so every app signs game
  tokens with its `NEXTAUTH_SECRET`, and any app whose production writes work is therefore
  already holding the backend's secret (verified 2026-08-17 for holoscopic-game and threshold
  by their working writes; synthesis and spectrum get confirmed by the first cross-subdomain
  sign-in after M2 deploys).
- `models/Notification.js`, the circle layer's opaque payloads, and `resolveInstance`'s header
  path are already the right shapes; they need enforcement, not redesign.

Loose ends to fix while passing through (each is in a milestone below):

- No app sets a cookie `domain`, and NextAuth's CSRF cookie uses the `__Host-` prefix, which
  forbids one — the M2 `cookies:` block must rename it.
- `POST /auth/login` returns `emailVerified` and every `authorize()` callback drops it — no
  frontend session knows verification status; carry it through the JWT in `@hs/auth`.
- One HS256 secret currently signs game tokens, 12h admin tokens, and Chorus's unexpiring
  contributor tokens; game tokens carry no `aud`/`iss`, so any app's token is valid on every
  route.
- ✅ Threshold's missing `/signup` and the 4051 `.env.local` leftover — both fixed with the
  front-door pass (2026-08).
- `models/Signup.js` has its admin tab (M4 progress, 2026-08-12); outbound mail to a list still
  does not exist — every existing capture only notifies the operator.

## §6 Milestones

Each is roughly one session's focused work unless marked larger. Order matters for M1–M3; after
that, M4–M6 can interleave. **M2 and anything else touching auth is a reviewed change — walk MO
through the diff before it lands** (root CLAUDE.md escalation rule).

### M1 — Homepage narrative (`apps/holoscopic-game` only, no backend)

Rework the homepage per P10, with MO's 2026-08-10 revision: **cards stay lean — title, subtitle,
element chips** (existing art motifs, year stamps); the reflective blurbs live on the **app
landing pages**, as a sentence or two added to what's already there, bringing the voice in and
suggesting the progression of ideas. Concretely:

- Homepage: retitle the card stack under the lab-notes intro; add the missing **Threshold card**
  (it's live now); chips per §8.
- Landers: `/map-sequence` is pretty good as is (one optional sentence); `/synthesis`,
  `/chorus`, and interView's landing page (`/interview/[session]` — `/interview` redirects into
  it by the default game's slug) each get their voice lines folded into existing copy; **On a
  Spectrum gets a new lander page** in holoscopic-game matching the others, linking out to
  spectrum.holoscopic.io — the reflective blurb is its lede. Threshold's blurb is front-door
  material for its real homepage (the M5 front-door work), since its card links off-site.
- Add the **Circles** offer section (the whole, the World Café paragraph, the five principles as
  one-liners — absorbing "The Practice"'s content; "It's a bit like…" retires, per MO 2026-08-10)
  and the **Join** section — **open-activity** interest capture (email + chosen topic, via
  `Signup` with per-topic sources) and the platform list (`source: 'platform-updates'`). Per P15,
  the join section offers activities and the platform list; joining a *circle* is absent until
  that vision exists.

Copy drafts in §8 (revised to this structure). Visual design of the new sections gets its own
design conversation first.

*Progress 2026-08-10:* **built end to end, awaiting MO's read of the live page.** Landers: voice
lines on `/map-sequence`, `/synthesis`, `/interview/[session]`; new On a Spectrum lander at
`/spectrum` (chorus-pattern page, mid-spectrum blue). Homepage: lab-notes intro; six lean cards
(title + subtitle + chip meta-line) including the new Threshold card — balance-beam motif in the
app's teal/rust/neutral, tilted beam on a level fulcrum, card links to threshold.holoscopic.io via
the new `THRESHOLD_URL` in `lib/games.ts`; the OaS card now routes to `/spectrum`. Circles
section: nested-circles signature drawing (smallest circles overlapping, shared dots in the
lenses), five principles as expand items absorbing The Practice's prose and both visuals;
"It's a bit like…" and "The Practice" sections removed. Join section: topic picker (Prosperity —
earned/given [poles are placeholders, Q4], Family — born into/chosen, Technology —
connecting/isolating) + email capture to `Signup` `activity-<topic>`, platform capture to
`platform-updates`; hero primary CTA now "Join in" → `#join`. Verified in-browser against the dev
stack: a submission wrote `{email, source: 'activity-prosperity'}` to `holoscopic-dev` (test row
removed); mobile at 390px checked. All in `apps/holoscopic-game` — nothing touched in
`apps/threshold` (another agent active there).

*Revision 2026-08-11 (MO's read of the first draft) — built, awaiting the second read.* The page
was restructured per **P16**, and the arc is now **idea → shape → experiments → the platform**:

- **New "The Shape" section** after the culture-is-technology intro: the three-circle Venn
  (workshop / social media / open source) with Holoscopic at the overlap, plus the three gloss
  rows. `VennVisual` in `page.tsx`.
- **New Circles card + `/circles` lander.** New artwork, `components/CircleOfCirclesArt.tsx`: ten
  people around a base circle, ten base circles around a larger one, all inside a circle — one
  base circle peopled, the other nine outlines inheriting the reading. Generated from the geometry
  rather than typed coordinates. Serves as both the card motif (with a square-art size override,
  since the shared `.gameCardArt` rule clips a square) and the lander's figure. The lander carries
  the circle prose, the World Café paragraph and the platform list.
- **The lab-notes intro lost "Greetings, MO here"** and is in we/us, with a closing sentence
  saying the experiments are being combined into one platform, linking down to the list.
- **The Circles section and the five principles are gone** from the homepage; the final section is
  **The Platform** — "We are whole", the pitch, and one form ("Sign up for events" →
  `platform-updates`).
- **The topic picker left the homepage** for Threshold's front door (see M5 note below).
- `components/EmailCapture.tsx` extracted from the homepage so both surfaces share it. Its
  `source` prop is a **string**, deliberately: `/circles` is a Server Component and a function prop
  across that boundary is a 500.

*Revision 2026-08-12 (per P17) — built, awaiting MO's read.* Circles left the card stack for its
own **Model** section (headline "We are whole", the `GatheringArt` journey figure — YOU → A
CIRCLE → A CIRCLE OF CIRCLES — link to `/circles`); the final section is **The Invitation** ("Be
in the first circles" — several circles form as seats fill, each runs a cycle, then a World Café
merge), one form, `source: 'first-gathering'`; hero primary CTA is now "Take a seat" →
`#invitation` (a `platform` span keeps old `#platform` links); the stack is "The Instruments",
all six lean cards; `/circles`'s join block makes the same seat promise on the same source.
Verified in-browser at 1440 and 390 against the dev stack. The Circles card and its styles are
deleted; Map + Sequence's card stayed after MO's read (it had briefly been a lineage line), and
the cards' status lines were removed the same way. `.inlineLink` re-asserts `text-decoration:
none` on hover — the global `a:hover` underline outweighs the bare class and was doubling the
link's border-bottom.

*Done when:* the page tells the arc idea → shape → model → instruments → invitation; each lander
carries its voice lines; the seat capture writes `Signup` rows under `first-gathering`; the copy
passes MO's read; no negation-copy in the offer register.

### M2 — One session everywhere (`packages/auth`, all five apps, backend) — **auth-sensitive**

Extract `@hs/auth`: shared `authOptions` with an explicit `cookies:` block
(`domain: '.holoscopic.io'`, `sameSite: 'lax'`, CSRF cookie renamed off `__Host-`), the
game-token route handler (adding `aud`/`iss`; backend verifies them), `emailVerified` carried
into the JWT/session. Extract `@hs/api` in the same pass: `apiFetch`, `ApiError`, the token
cache (holoscopic-game's mint-deduping copy is canonical), socket handshake. Align production
`NEXTAUTH_SECRET` across Vercel projects = Render's `GAME_TOKEN_SECRET`. (Threshold's `/signup`
and the 4051 leftover, once listed here, are already fixed.)

*Deployed and verified in production 2026-08-17:* one sign-in on circles.holoscopic.io is a
live session on threshold.holoscopic.io, spectrum.holoscopic.io and holoscopic.io (checked
against the production domains with a real account; synthesis awaits its cutover). The game's
Vercel project needed `NEXTAUTH_URL=https://holoscopic.io` added — without it NextAuth ran in
non-secure cookie naming and could not see the `__Secure-` session cookie. **M2 is done.**

*Build notes 2026-08-17 (reviewed by MO before landing):* `@hs/auth` (createAuthOptions with the cookies block — domain from `AUTH_COOKIE_DOMAIN`,
set `.holoscopic.io` in production only; CSRF renamed `__Secure-` off `__Host-`; session/callback
cookie NAMES unchanged so existing production sessions survive; `emailVerified` carried into the
JWT and session) and `@hs/api` (ApiError, the mint-deduping token cache from holoscopic-game,
`createApiFetch`, `socketAuth`). All five apps rewired; game tokens now carry `aud` (per-app) +
`iss: 'holoscopic'`, and `verifyToken` rejects a wrong `iss` or unknown `aud` while accepting
claim-less pre-M2 tokens until every frontend deploy rolls over (tightening is a follow-up;
Q3's fuller secret split still open). Verified in dev: login 200 through the shared stack,
session shows `emailVerified: true`, minted token carries the claims, backend accepts it and
rejects tampering/wrong-iss/unknown-aud; five apps type-check; 359 backend tests green.
**At deploy:** `AUTH_COOKIE_DOMAIN=.holoscopic.io` is set on all five Vercel projects
(2026-08-17). The secrets were already aligned by construction (§5) — the first
cross-subdomain sign-in is the proof for the two apps whose production writes were never
exercised (synthesis, spectrum).

*Done when:* logging in on any one subdomain is being logged in on all of them, verified in a
browser against production domains, not by reading config. Sessions survive navigation between
apps; Chorus and platform admin are untouched.

### M3 — One shell (`packages/shell`, all frontends)

`@hs/shell`: header, account menu, notification bell, footer, and the one true `Beacon`. Renders
coherently for anonymous visitors (P5). Adopted by all six current frontends; the five Beacon
mirrors are deleted (circles never grew one). No activity-engine dependency, enforced by the package's dependency list.

*Done when:* one component tree serves every app's chrome; a wire-shape change to Beacon is one
edit; `grep -r "Beacon" apps/*/src/components` finds only imports.

### M4 — The platform is a place (dashboard, `emailPrefs`, admin surfaces)

Logged-in holoscopic.io becomes home: my circles, my activities across apps, notifications, my
history — generalizing the existing `GET /users/:userId/games` projection to cover non-`Entry`
collections (Threshold shares/rankings, Synthesis nodes) behind the same membership privacy gate.
Add `User.emailPrefs` and honor it in every mail path. Give `Signup` its admin tab and a broadcast
route gated on `emailPrefs` (P11).

*Progress 2026-08-12:* **the Signup admin tab exists** — `GET /api/admin/signups` (grouped by
`source`, newest-active source first, behind the router's `requireAdmin`) + `/signups` in the
platform app, replacing the Waitlist tab in nav and overview (the waitlist page is deleted; its
backend route remains, unread). MO can read seat signups without a Mongo shell. The rest of M4
(dashboard, `emailPrefs`, broadcast) is untouched.

*Done when:* a user who has played three different activities sees all three from one page; an
announcements send reaches exactly the opted-in list; MO can read signups without a Mongo shell.

### M5 — Open activities + host-started circles (backend former + Threshold frontend dependency)

Two builds on the same machine, per P15's ladder. **Rung 1:** the cohort former per P12 — a
standing-topic definition in the platform admin, signup accumulation, the room-fills
stamp-and-start rule on the existing tick, email-first conversion; every stamped circle is
single-mode and never called a circle. **Rung 2:** host circle creation — MO starts a real
circle and invites members by email; backend support (`createCircle`, `invitedEmails`,
`requireInvitation`) already exists, so this is a platform-admin creation surface (Q6), with
invitations sent manually by MO (Q7) and open-activity rooms of 10 (Q8). **The
Threshold frontend is no longer the blocker**: every participant surface is built in the tide-line
language (§9.2) and live on production at threshold.holoscopic.io since 2026-08-10, and the front
door, `/new`, and `/signup` shipped after it (progress note below) — the Threshold-side
prerequisites are done. What M5 still waits on is the backend former.

*Progress 2026-08-11 (frontend half, per P16):* **the capture surface exists and the app stopped
offering ongoing circles.** Threshold's front door now carries the rung-1 offer — three standing
topics (since 2026-08-12: Progress combat evil/elevate good, Belonging by origin/from destination,
Belief as fantasy/as creation — `TOPICS` in threshold's `app/page.tsx`, code not config until the
M5 former lands) and an email capture posting `activity-<topic>` straight to the global,
unauthenticated `POST /api/signup` with a plain fetch (routing it through `services/api.ts` would
mint a game token and 401 the signed-out visitor it exists for). It sits **above** the account ask,
so a stranger meets the offer first. `/new` creates one-off **sessions** only: the mode choice is
gone, the topic is required, and `/t/<urlName>` says "session" wherever the copy is not gated on
`mode === 'circle'`. **What remains is the backend former** — the standing-topic definition, the
room-fills stamp-and-start rule on the tick, and email-first conversion. Nothing reads those
`Signup` rows yet, so today the capture is a list MO watches.

*Done when:* a stranger leaves an email on Threshold's front door, and with every operator browser
closed, a session forms, mails its rounds, reveals its threshold, and the promise was kept.
Verified by watching an inbox.

### M6 — The host app and the manifest (Tier B is born)

*2026-08-14: the host app has a name and a domain — **Circles**, circles.holoscopic.io, branded
Holoscopic (P18). Its v1 is the circle home plus Threshold and Synthesis as the first two
packaged activities.*

One new "play" app (route-per-activity, thin router; each activity a workspace package = one
agent's territory) and the `ActivityManifest` (P7) read by homepage, dashboard, admin, and the
Beacon allowlist. The first Tier B activity proves the path — likely the next new experiment,
born here instead of as app number seven.

*Done when:* the invariant (§2) holds for a real activity: it shipped with a package + a manifest
row and touched nothing on the forbidden list.

### M7 — Primitive-owned storage (when the trigger fires)

The trigger: the next activity that would otherwise define its own content models. Build the
primitive model it needs (voice-share or placement first, most likely), with the write funnel and
redaction rules in the primitive (P8). Existing per-activity models stay; migration is
opportunistic or never.

*Done when:* two activities write the same primitive collection and neither owns it.

### M8 — Composition and the gathering (Tier A, `/api/circles`, circle-of-circles)

*2026-08-14: the `/api/circles` promotion is done ahead of the rest of M8 — consumer #2 arrived
as the circles app (82199ae). Generic snapshot/my-circles/join routes are live, with per-activity
content flowing through two module hooks (`participation`, `snapshotExtras`) on the
`circleActivities` seam, and both front doors serve the identical payload. Tier A, the World Café
module and the root circle remain.*

When two or three activities run on shared primitives: manifest-defined activities in the admin
(Tier A), promotion of generic circle operations from `/api/threshold` to `/api/circles`
(consumer #2 exists now), and the World Café module + `memberCircleIds[]` per P13. The root
circle (P14) lands here, converting the announcements list into membership.

*Done when:* an activity exists that no one deployed; two circles have met and each carried an
artifact home.

## §7 Open questions

- **Q1 — Sign-in host.** One login page at holoscopic.io/login, or an accounts subdomain? (M2
  works with either; the domain cookie makes it cosmetic, but it sets the brand for "your
  Holoscopic account.")
- ✅ **Q2 — decided 2026-08-14: circles.holoscopic.io** (P18). A subdomain on the shared apex,
  so the Q1 domain cookie applies unchanged.
- **Q3 — Secret split.** Should admin tokens and Chorus contributor tokens move off the shared
  HS256 secret while M2 is touching it, or is `aud`/`iss` separation enough for now?
- **Q4 — Standing topics.** The launch set of topic + polarity pairs (drafts in §8 are
  placeholders); three, each from a different life-domain, poles symmetric per Threshold's rule
  that neither pole can look like the good one.
- ✅ **Q5 — held; the tide-line language shipped.** Every Threshold participant surface wears it
  (§9.2), live on production since 2026-08-10.
- ✅ **Q6 — decided 2026-08-10: host circle creation lives in the platform admin first.** MO is
  the only host for now; a public creator flow on the Threshold front door waits for its design
  language and a second host.
- ✅ **Q7 — decided 2026-08-10: invitations are manual.** MO pastes the `/t/<urlName>` link into
  his own email — a personal note is the right invitation at this stage, and it defers the first
  non-phase mail pathway until M4's `emailPrefs` exists.
- ✅ **Q8 — decided 2026-08-10: the room is 10.** No backstop initially — a topic that fails to
  fill is information about the topic; the former starts nothing smaller.

## §8 Copy drafts (M1 material — revised 2026-08-10 per MO: lean cards, voice on the landers)

Register 1, lab notes — section intro (approved):

> **The experiments**
>
> Greetings, MO here. Each of these began as a question about how groups learn together. Each one
> taught me something the next one was built on. All of them are open — play them, break them,
> tell me what you find.

**Homepage cards** — title, subtitle, chips only. Subtitles are the existing ones (they're good);
Threshold's is new. Newest first, matching the current stack order. The thread-phrases from the
first draft (*the common frame*, *the feedback loop*, …) are available as micro-labels beside the
year stamps if the design wants them; the intro plus the recurring chips already carry the
progression.

> **Threshold** — a game for finding the group's dividing line
> `voice stories · polarity sorting · rounds by mail · circle membership`

> **Chorus** — connecting stories and voices
> `voice stories · shared vocabulary · one open link`

> **Synthesis** — a game for generating collective thought
> `private→shared maps · borrowed thoughts · LLM synthesis · token voting`

> **On a Spectrum** — a game for revealing nuance
> `spectrum ranking · timed rounds · stakes · rule revision`

> **interView** — a game for designing conversations that learn
> `2D map · sequences · tokens · quorum`

> **Map + Sequence** — the original holoscopic mapping tools
> `2D map · comments · votes · sequenced rounds`

**Lander voice lines** — a sentence or two folded into each landing page's existing copy, first
person, suggesting the progression. Placement notes per page:

- **`/map-sequence`** — pretty good as is. One optional sentence after the existing lede ("This
  was our first attempt at algorithmic social design…"):
  > The question I was chasing: how does everyone hear everyone else, with the details one click
  > away? Every game since is built on this frame.

- **interView** — the landing page at `/interview/[session]` already has the right lede
  ("interView is a slow game of collective sensemaking…"). One sentence ahead of it brings the
  progression in:
  > Map + Sequence built the frame; interView asks whether a group can learn which conversations
  > work.

- **On a Spectrum** — new lander page in holoscopic-game, matching the chorus/synthesis pattern,
  linking out to spectrum.holoscopic.io. The reflective blurb is its lede:
  > The spectrums turned out to be the hard part — I was handing people axes they hadn't chosen.
  > So finding them became the game. The group nominates the dimensions that matter, ranks its
  > ideas along them, and watches a collective picture assemble. It ends with the group
  > redesigning the game's own rules for the next round.

- **`/synthesis`** — one or two sentences ahead of the existing lede:
  > On a Spectrum ran on a clock. Synthesis is the opposite tempo — a game where time to think is
  > a move.

- **`/chorus`** — one or two sentences folded into the existing lede:
  > By this point the games could map, rank, and synthesize; what they were missing was the sound
  > of a person. Hearing someone tell it in their own voice changes what a contribution is.

- **Threshold front door** (threshold.holoscopic.io — lands with the M5 front-door work; its
  homepage card links off-site, so the blurb lives there):
  > Threshold puts the voices in a circle. The group takes a charged word and its two poles —
  > *Authority: liberating / constricting* — everyone records a story, then everyone sorts
  > everyone's stories. The stories the group splits on are its threshold: the actual dividing
  > line, made of the specific stories that fell across it. The circle keeps what it made, and a
  > group that gathers again has a history.

**Superseded by P16 (2026-08-11):** the two blocks below were written for a homepage that carried
the Circles section and a two-form Join section. What shipped instead: the circle prose and the
World Café paragraph live on `/circles`, the five principles are deleted, the open-session offer
lives on Threshold's front door, and the homepage's last section is the platform pitch ("We are
whole") with one form. They stay here because the prose was reused nearly verbatim on those
surfaces.

Register 2, the invitation:

> **Circles**
>
> The experiments above are the parts. This is the whole.
>
> A circle is a group of people who gather, each on their own time, to do these activities
> together — record stories, map where everyone stands, find the group's thresholds — and keep
> what they make. Membership is loose and the schedule is patient: a round advances when
> everyone's done or the clock runs out, and an email brings you back when it's your turn.
>
> Circles gather too. Several circles meet the way a World Café runs: members mix across tables,
> each table trades what its home circles learned, and everyone carries the exchange back to
> their own group. The pattern holds at every scale — a circle of circles is itself a circle,
> with its own artifacts and its own history. The platform is the outermost one.
>
> *What every circle runs on:*
> **Wholes over feeds.** You see the shape of the whole group at once; any detail is one click
> deep.
> **Humans are the sensors.** The group's own perception — mapped, ranked, sorted — is the
> instrument.
> **Gaps are the material.** Where perceptions split is where the learning is; the threshold is
> the point.
> **The rules belong to the players.** Every circle can inspect and revise its own process.
> **Leave a trail.** What a circle learns is an artifact the next circle starts from.

The join section (revised per P15 — activities are joinable now; circles convene by invitation):

> **Try an open activity**
>
> Threshold runs in single rounds on standing topics. Pick one; when the room fills, it begins —
> email carries you through sharing, sorting, and the reveal.
>
> · **Money** — freeing / trapping
> · **Family** — chosen / given
> · **Technology** — connecting / isolating
>
> **Join the platform.** Circles — groups that gather over time — are convening by invitation.
> Leave your email for platform news, invitations to open activities, and a seat when the first
> public circles form.

Draft notes: two deliberate honesty-exceptions to the no-negations rule ("axes they hadn't
chosen", "what they were missing was the sound of a person") — both live in the lab-notes
register, where narrating a finding is what makes the log credible; the offer register stays
clean. The five principles are
the manifesto's five, compressed and translated from philosophy into mechanics; each is literally
true of something already built.

## §9 Working across sessions

- **Resume by reading this file.** Milestone status lives here — mark milestones ✅ with a date
  and a one-line "what actually happened" as they land, the way `PLATFORM_NEXT.md` §1 does.
  Decisions made mid-build get a P-number here; per-app details go to that app's PLAN.md.
- **One milestone per session** is the right grain; M2 must not share a session with unrelated
  edits (auth diffs stay readable).
- **Shared-tree rules apply throughout** (root CLAUDE.md): explicit-path commits only, never
  touch another agent's dirty files, backend edits restart everyone's server.
- **Auth escalation:** M2, the broadcast route in M4, and any secret handling get walked through
  with MO before landing.
- **When this doc and reality disagree, fix the doc** — it states the plan of record, and a stale
  plan is worse than none.
