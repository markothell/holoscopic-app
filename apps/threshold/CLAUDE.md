# Threshold

A group finds out **where its dividing line falls**. A topic and a polarity; everyone tells a short
story about a time it was one of those two things; then the group sorts every story onto one side or
the other. The stories everybody read the same way sit at the ends, and the ones the group split on
sit in the middle — that middle is the threshold.

Local dev port **4006**, ships to `threshold.holoscopic.io` (add to backend `CLIENT_URL` at
cutover). Next.js 16 + React 19 + Tailwind v4 (`@theme inline` in `globals.css`, no config file).

**`PLAN.md` is the source of truth**, §-numbered, with settled decisions D1–D33 in §12 and open
questions in §13. Read the relevant § before changing behavior it describes. Two lists come off it:
`M3B-CHECKLIST.md` (what has to be provisioned before the audio half can start) and
`BACKEND-SETUP.md` (the server-side runbook).

## Status

**Design is ahead of code here, on purpose.** Check `PLAN.md` §11 before assuming a section
describes something that exists.

**Built:** the Circle layer including the topic queue (M1b), the Threshold funnel, the REST
surface, blob mirroring and transcription — 74 tests between `utils/circles.test.js` and
`utils/threshold.test.js`, plus 17 integration checks in `scripts/check-circles.js` — and a
frontend scaffold carrying the route skeleton, the auth stack, the API client and the wire types.

The **circle page, the share surface and the ranking queue are built for real** in the tide-line
language (§9.2). `components/TideLine.tsx` is the app's one mark and `components/Shell.tsx` its
chrome — `Scaffold.tsx` is now only for surfaces still unbuilt, and should be deleted when the last
one lands.

**Designed and not built:** the two reveals (§6.3) — the per-cycle threshold display and the
circle-final graph. Also **M3b, audio**, whose bar is a real recording on a physical iPhone; the
flow it slots into is built and verified, so it changes nothing around it.

**`node scripts/seed-threshold-dev.js` from `apps/backend` is the fastest way to see any of it.**
It builds a circle holding every state at once — a live cycle mid-sort, a queue with uneven support
and a promotion, a revealed topic and a skipped one — through the funnels rather than by direct
writes, which is the point: a circle assembled by hand lands in states the machine never produces
and costs a day of debugging the page instead of the data. Dev only, and it prints its sign-ins.

Build what those sections say rather than designing from the placeholders. `globals.css` already
carries the real palette; `components/Scaffold.tsx` is chrome to be replaced, and its `NotBuilt`
marker names the section that specifies each surface.

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
| `src/app/t/[urlName]/{seed,share,rank,result}` | The phase surfaces. Placeholders — §6.2, §9.1 |
| `src/app/t/[urlName]/cycle/[seedId]` | One cycle's reveal. Placeholder — §6.3 |
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
- **`agreement` is stored; bands are not** (D15). Any grouping of the reveal is a render-time view,
  so redesigning it is a re-render, never a migration. Do not add a stored classification.
- **`phaseDeadline: null` means no clock, not a missing value.** Any phase's hours may be omitted
  (D16), and a circle configured with none is a purely hand-driven one.
- **A seed id is unique across circles**, so `/seeds/:seedId/*` finds its circle by it. The client
  never carries both ids.
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
- **Audio: `@hs/audio` owns the three browser rules, so use it rather than reimplementing around
  it.** Upload the BASE content type with no `codecs` parameter — Blob matches by exact string and
  the spacing differs per browser. Feature-detect the mime type: Chrome/Android/Firefox give
  WebM/Opus, Safari and all iOS give MP4/AAC. Take duration from the client's own timer, since iOS
  MP4 carries no duration metadata and every player reads it as `Infinity`.

## Environment

- `NEXT_PUBLIC_API_URL` (default `http://localhost:4001/api`)
- `NEXT_PUBLIC_INSTANCE_ID` (default `threshold`)
- `NEXTAUTH_URL`, `NEXTAUTH_SECRET` — must match the backend's `GAME_TOKEN_SECRET`/`NEXTAUTH_SECRET`
- `BLOB_READ_WRITE_TOKEN` — required for recording, once M3b exists

## Running it

```bash
npm run dev:backend      # 4001
npm run dev:threshold    # 4006
```

A Threshold instance has to exist for any of it to answer: platform admin → Instances → New
instance → App: **Threshold**. Without one, every `/api/threshold` call 404s by design.
