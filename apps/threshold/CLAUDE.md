# Threshold

A group finds out **where its dividing line falls**. A topic and a polarity; everyone tells a short
story about a time it was one of those two things; then the group sorts every story onto one side or
the other. The stories everybody read the same way sit at the ends, and the ones the group split on
sit in the middle — that middle is the threshold.

Local dev port **4006**, ships to `threshold.holoscopic.io` (add to backend `CLIENT_URL` at
cutover). Next.js 16 + React 19 + Tailwind v4 (`@theme inline` in `globals.css`, no config file).

**`PLAN.md` is the source of truth**, §-numbered, with settled decisions D1–D35 in §12 and open
questions in §13. Read the relevant § before changing behavior it describes. Two lists come off it:
`M3B-CHECKLIST.md` (what has to be provisioned before the audio half can start) and
`BACKEND-SETUP.md` (the server-side runbook).

## Status

**Built:** the backend through M3a including the topic queue (M1b), and **every participant
surface** — the circle page, the seed form, the share surface, the ranking queue, the per-cycle
reveal and the circle-final record — in the tide-line language (§9.2). 312 backend tests, plus 17
integration checks in `scripts/check-circles.js` against a real database.

**M3b, audio, is built and awaiting a device**: the recorder, the Blob upload route, playback in
the ranking queue and inside the reveal's expanded story. What is left is a real recording on a
physical iPhone and on Android — Safari takes the MP4/AAC branch, writes no duration metadata and
spells the `codecs` parameter with a space, and a laptop's WebM take exercises none of the three.
**M4, mail, is built**: transition mail with the circle link and `List-Unsubscribe`, per-circle
mute, `/notifications`, and a real `/me`. What is outstanding there is a real inbox — locally the
fixture's members carry no address, so nothing can send.

**Not built: M6, the launch pass.**

`components/TideLine.tsx` is the app's one mark and `components/Shell.tsx` its chrome.
`components/Scaffold.tsx` is **still live on four routes** — `/` , `/login`, `error.tsx` and
`not-found.tsx` — so it cannot be deleted yet, whatever an earlier note here said.

**The front door is built**: `/` says what Threshold is and offers the way in, `/new` starts a
circle, and `/signup` makes the account (`/login` moved off `Scaffold` to match). Before this,
every circle on production was made by running the funnel from a laptop, so the app could be used
by anybody invited to a circle and by nobody else. `Scaffold.tsx` is still live on `error.tsx` and
`not-found.tsx`. **`/new` also sets the round length** — a day, three days, a week, or no clock at
all — and it is the only surface that sets one, since nothing edits `config` after creation.

**`node scripts/seed-threshold-dev.js` from `apps/backend` is the fastest way to see any of it.**
It builds a circle holding every state at once — a live cycle mid-sort, a queue with uneven support
and a promotion, a revealed topic and a skipped one — through the funnels rather than by direct
writes, which is the point: a circle assembled by hand lands in states the machine never produces
and costs a day of debugging the page instead of the data. Dev only, and it prints its sign-ins.

## What makes this app different from the others here

| | |
|---|---|
| Identity | holoscopic accounts (**D6**) — asynchronous rounds need an identity that lasts weeks and an address to notify. Not Chorus's anonymous model, which can express neither |
| Route guard | `enforceVerifiedUser`, on every route but the Deepgram callback |
| Economy | **none** (**D7**) — the instance runs `config.mode: 'explore'`. Nothing here is scarce: everybody shares, everybody ranks, and there is nothing to stake on |
| Advancement | a **locked 60s server tick**, not sweep-on-read (**D5**) |
| Realtime | none in v1 (**D14**). The snapshot re-fetched on focus is enough |

**Nobody has this app open.** That single fact drives the ticker, the mail, and the decision to
route every email to `/t/<urlName>` rather than to a phase surface — by the time somebody reads it,
the round may have turned over.

## Architecture

| Where | What |
|---|---|
| `src/app/t/[urlName]/page.tsx` | **The page you return to.** Reads the snapshot, routes to whatever phase is live. Re-fetches on focus |
| `src/app/t/[urlName]/seed` | Post a topic, then the optional story on it — §6.2, D34 |
| `src/app/t/[urlName]/share` | Tell your story; picking a pole is how you enter it — D22 |
| `src/app/t/[urlName]/rank` | The queue, then the review screen that owns submit — §6.2, D21 |
| `src/app/t/[urlName]/cycle/[seedId]` | One cycle's reveal: three groups, reader's cutoff — §6.3 |
| `src/app/t/[urlName]/result` | The circle seen whole. A record, never a verdict — §6.3, D25 |
| `src/components/{Shell,TideLine}.tsx` | The real chrome, and the app's one mark — §9.2 |
| `src/app/me` | Circles I'm in, and what is waiting on me |
| `src/services/api.ts` | All HTTP. Mints a game token from the NextAuth session and attaches it beside `x-user-id` |
| `src/lib/types.ts` | Wire types, mirroring `utils/circles.js#toClient` and `utils/threshold.js#toClientShare` exactly |
| `src/components/Beacon.tsx` | The fifth copy — see the note in the file |
| `apps/backend/models/Circle.js` | The generic cohort + round machine. Threshold is its only consumer |
| `apps/backend/utils/circles.js` | The round machine's funnel — membership, seeds, phases, mail |
| `apps/backend/utils/circleActivities.js` | `register(key, module)`. Requiring `routes/threshold.js` is what registers `'threshold'` |
| `apps/backend/utils/threshold.js` | **The write funnel** — shares, rankings, the gradient. Never write these collections anywhere else |
| `apps/backend/routes/threshold.js` | REST at `/api/threshold` |

## Gotchas

- **There is no seeding round, no completion condition, and no `cycleIndex`** (D27–D29). A circle
  opens `idle`, runs the top of the queue, and returns to `idle` after every cycle — including for
  the millisecond before it starts the next one, which is why `goIdle` mails only when the queue is
  genuinely empty. **`idle` is running**, so `sweepCircles` still examines it and a member posting a
  topic is what restarts it. The only ending is a facilitator calling `closeCircle`.
- **Posting a topic is supporting it**, so `supporterIds` is never empty on a seed somebody posted
  and an author always reads back `iSupport: true`. The roster never crosses the wire — `toClientSeed`
  ships `supporterCount` and `iSupport`, because who backed a topic is nobody's business and only
  the count decides anything.
- **The queue's order is computed, never stored.** `circles.queue()` sorts promotions first (by
  `promotedAt`, so two promotions run in the order they were made), then support count, then posting
  `order`. `toClient` ships `queue[]` already sorted; render that rather than re-deriving it, or the
  page and the machine drift the first time either rule changes.
- **A skipped topic is revealed**, not deleted (D30): terminal phase, computed result, every story
  kept and attributed. `circles.DONE_PHASES` is the check — `phase === 'revealed'` alone silently
  hides skipped topics from the reveal route, `listShares`' attribution, and the circle record.
- **Redaction is server-side, and there are three states, not two** (D9/D17). During `share` you
  receive only your own stories; during `rank` you receive everyone's with `userId` and `username`
  absent; after `revealed` they are attributed. The client never receives an identity it is meant to
  be hiding, so there is nothing here to accidentally render — keep it that way.
- **Say the honest thing anyway.** In a twelve-person circle a voice recording identifies its
  speaker no matter what the payload strips. The compose surface has to tell people that *before*
  they record.
- **A display name comes from the `User` document, never from the request.**
  `routes/threshold.js#displayNameFor` reads it; `utils/threshold.js#submitShares` then prefers the
  name on the circle's own member row, so a story carries the name beside its teller in the member
  list. What this replaced returned `req.body.username || req.verifiedUsername || 'Member'`, where
  no client sends the first and **nothing anywhere sets the second** — the game token carries `sub`
  and nothing else. So every member row and every story written through the app was stored as
  `'Member'`, invisible until a topic reveals and attributes the whole circle to twelve people of
  that name (D9). Threshold's `/signup` requires a name for the same reason.
- **A turn is one write, and `submitShares` is it** (D36). The compose card stages; the two-pole
  screen sends both sides together. `submitShare` still exists and is a one-story turn — but never
  call it twice for one member, because it evaluates completion itself: the first call ends the
  round wherever that member was the last it was waiting for, and the second is refused by
  `assertOpenForStories` on a topic that moved on milliseconds earlier. In a one-member circle that
  is every time, which is how it was found.
- **Your own story is placed by telling it, once, at the phase boundary** (D22).
  `utils/threshold.js#preplaceOwnStories` runs from `onPhaseOpen` when a cycle enters `rank` and
  writes each teller a **draft** ranking holding their own story on the pole they chose. Everything
  downstream then needs no special case: `waitingShareIds` subtracts placements and your own drop
  out by themselves, and the ranking client seeds nothing. The first cut did it in the client *and*
  in the waiting marker, and two clients that have to agree is a bug waiting for a third — with
  only one of them, submit either refuses a sort that looks complete or the circle page overstates
  what is waiting. A draft is not a submission, so this touches neither the gradient nor
  advancement, and it is idempotent.
- **An author may tell their story on their own topic while it is still queued** (D34), and nobody
  else may — `utils/threshold.js#assertOpenForStories` is the rule. People propose a topic because
  something happened to them, and a topic can sit in the queue for weeks; but a topic nobody backs
  never runs, so asking the other eleven for a story that may go unread is the work the queue exists
  to let them skip. Nothing leaks either way: `listShares` returns own-only for `pending` as well as
  `share`.
- **A mutation route must serialize what the FUNNEL returned, never what it loaded.** `loadCircle`
  and the funnel each `findOne` their own Mongoose document, so the route's copy never sees the
  write — `routes/threshold.js#fresh` is the one line that keeps them straight. This was invisible
  for weeks because every client re-fetched; it surfaced the first time a surface trusted the
  response, as a "post a topic" answer describing the circle before the topic.
- **A ranking is one document, and submit is all-or-nothing** (D11). Drafts save as you sort and
  count toward nothing; `submittedAt` is what makes it real. A partial ranking would make the
  agreement fraction depend on who bothered.
- **No screen ranks the topics, and the payload cannot** (D25). The circle-final record names no
  winner and draws no conclusion — `circleResult` used to compute a `mostContested` id and it has
  been removed rather than left unused, because the next person to see a field goes looking for the
  screen that shows it. It serves each topic's story *positions* instead, so both reveal scales band
  at whatever cutoff the reader is holding.
- **`agreement` is stored; bands are not** (D15). Any grouping of the reveal is a render-time view,
  so redesigning it is a re-render, never a migration. Do not add a stored classification.
- **`phaseDeadline: null` means no clock, not a missing value.** Any phase's hours may be omitted
  (D16), and a circle configured with none is a purely hand-driven one. **Omitting them at
  `createCircle` does not get you one**: `models/Circle.js` declares `shareHours`/`rankHours` with
  `default: 72`, so `config: {}` is a three-day clock on every phase. Hand-driven takes an explicit
  null, and the funnel's `hoursForPhase` only ever sees what the schema already filled in.
  `/new` therefore always sends `config` — a form that omitted it silently chose 72, and **there is
  no route that edits `config` afterwards**, so a clock is decided once at creation and lived with.
  What that cost while `/new` sent nothing: a session whose sorting round drew nobody sat the full
  three days and then mailed its result and a fresh "post a topic" ask to a group that had moved on.
- **A seed id is unique across circles**, so `/seeds/:seedId/*` finds its circle by it. The client
  never carries both ids.
- **Mail links to the circle, never to a phase surface**, and its base is `THRESHOLD_URL` — never
  `email.js#appUrl()`, which falls back to the first entry of `CLIENT_URL`, and one backend serves
  five apps. A round advances on a 60s tick, so `/t/<urlName>/rank` in an email is the likeliest
  thing in the system to be stale by the time somebody opens their inbox.
- **Muting a circle stops mail and never notifications** (D31). Somebody who mutes has said "stop
  emailing me", not "stop telling me". `List-Unsubscribe` points at the logged-in `/notifications`
  page with no `List-Unsubscribe-Post`: one-click would need an unauthenticated mutation endpoint,
  and the reason none is needed is that `invitedEmails` is a join-time gate and never a mail list,
  so every recipient of circle mail has an account.
- **The dev fixture's members carry no email address, on purpose.** `RESEND_API_KEY` is usually set
  in `.env.local`, so a fixture whose members had addresses would mail them on every transition —
  and a bounce to an invented address lands on the reputation of the domain that also carries
  password resets. Notifications still land, so `/notifications` is fully exercised locally.
- **`gameNumber` must stay null.** `Instance.getDefault()` picks the lowest-numbered active
  instance, so a Threshold instance holding a number can become the platform default and start
  answering interView traffic.
- **The two pole colours are the app's, never the author's** (D26). A seed names its own ends, but
  teal and clay are fixed for every topic in every circle, and they were chosen by measurement —
  ΔL* 0.8 so neither reads as heavier, ΔE 32.0 apart under deuteranopia. The failure mode this
  prevents is a warm/cool or green/red pairing handing one end of somebody's polarity the verdict.
  Re-run the check in `globals.css`'s header before changing either value.
- **The reveal's cutoff is a reader's control, and nothing about it is stored** (D24, on top of
  D15). Three in four by default, with *more than half* and *all of them*. Any banding is computed
  at render from `agreement`, so moving that line is a re-render — never a migration, and never a
  schema field. **The threshold appears once three rankings are in**, gated on rankings
  submitted rather than on membership: a twelve-person circle that drew three behaves like a
  three-person one, the cycle still reveals below that, and no circle has a minimum size.
- **A green test suite does NOT mean a `models/Circle.js` change is safe.** `circles.test.js` and
  `threshold.test.js` run against an injectable in-memory store with no Mongoose in the loop, so
  schema validation never executes — an enum you narrowed or a field you removed stays invisible to
  all 307 tests while every real write fails. This is not hypothetical: an early cut of the queue
  (M1b) left the suite fully green with a funnel writing two `phase`/`status` values the schema
  rejected. Exercise a model change against a real database — `scripts/check-circles.js` is the
  standing tool for exactly that, it is dev-only by design, and M1b's four new enum values
  (`idle`, `closed`, `skipped`, `via: 'queue'`) each have a check there naming the schema in the
  failure message.
- **"What is waiting on me" is derived, never stored** (D32). The circle snapshot already carries
  `shares` and `myRanking.placements`; the difference is the marker. That is also why a member who
  joins in week six needs no special handling — they have no ranking, so everything reads as
  waiting. Do not add a per-share "heard it" flag to get this.
- **One parent instance holds every circle, and membership is the access boundary** (D20). The
  tenant is the `Circle` at `/t/<urlName>`, never its own `Instance` — a circle has no economy and
  no per-tenant config, since its clocks, members and invitations all live on the `Circle`
  document. Consequence: every circle in a deployment shares one instance, so `assertMember` is the
  only thing between two of them. `listShares` and both result routes assert it; the circle shell
  (title, phase, member count) stays readable so somebody following an invitation can see what they
  are joining.
- **`resolveInstance` never fails**, so `routes/threshold.js` checks `Instance.app === 'threshold'`
  itself and 404s anything else. A wrong `NEXT_PUBLIC_INSTANCE_ID` therefore reads as "circle not
  found" rather than as an auth or CORS error — worth knowing before you go looking in the wrong
  place. Leave it unset if the instance is slugged `threshold`; `x-instance-id` takes an id or a
  slug, id first.
- **404 everywhere, never 403.** An absent circle and one you are not a member of look identical
  from outside, so no page can say which it was.
- **Recording and typing are both first-class, and every surface says so in the same breath.**
  Ranking means comparing two dozen stories and reading beats listening, so a group that mostly
  types gets a *better* sorting round. Every recorder error names typing as the way through, and a
  browser that cannot record says so and points at the textarea.
- **A transcript gates nothing, ever.** A story without one shows its player alone — no spinner, no
  waiting state. Blocking the rank phase until Deepgram answers would hand a vendor the power to
  freeze a group's week, which is the failure D5's ticker exists to prevent.
- **`transcript.status` is `ready`, never `done`.** The wire type said `done` until M3b — a value
  `models/ThresholdShare.js`'s enum cannot hold — so every "is the transcript ready" check silently
  answered no. Mirror the enum, and check it when either side moves.
- **Audio: `@hs/audio` owns the three browser rules, so use it rather than reimplementing around
  it.** Upload the BASE content type with no `codecs` parameter — Blob matches by exact string and
  the spacing differs per browser. Feature-detect the mime type: Chrome/Android/Firefox give
  WebM/Opus, Safari and all iOS give MP4/AAC. Take duration from the client's own timer, since iOS
  MP4 carries no duration metadata and every player reads it as `Infinity`.

## Environment

- `NEXT_PUBLIC_API_URL` (default `http://localhost:4001/api`)
- `THRESHOLD_URL` **on the backend** — where links in circle mail point (default
  `http://localhost:4006`). Unset in production means every email links at localhost. Set on the
  production service 2026-08-10; a Render env var only reaches the running process on a **deploy**,
  not on a `PUT` and not on a restart (`BACKEND-SETUP.md` §3)
- `NEXT_PUBLIC_INSTANCE_ID` (default `threshold`) — **but production's instance is slugged
  `circlemo`**, and the deployed frontend is set to send that. Dev's is `threshold`. The wrong
  value reads as `{"error":"Not found"}`, which is `assertOwnApp` after `resolveInstance` answered
  with an interView edition; `{"error":"Circle not found"}` is the healthy answer
- `NEXTAUTH_URL`, `NEXTAUTH_SECRET` — must match the backend's `GAME_TOKEN_SECRET`/`NEXTAUTH_SECRET`
- `BLOB_READ_WRITE_TOKEN` — required for recording, once M3b exists

## Running it

```bash
npm run dev:backend      # 4001
npm run dev:threshold    # 4006
```

A Threshold instance has to exist for any of it to answer: platform admin → Instances → New
instance → App: **Threshold**. Without one, every `/api/threshold` call 404s by design.
