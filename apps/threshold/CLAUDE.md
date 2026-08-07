# Threshold

A group finds out **where its dividing line falls**. A topic and a polarity; everyone tells a short
story about a time it was one of those two things; then the group sorts every story onto one side or
the other. The stories everybody read the same way sit at the ends, and the ones the group split on
sit in the middle — that middle is the threshold.

Local dev port **4006**, ships to `threshold.holoscopic.io` (add to backend `CLIENT_URL` at
cutover). Next.js 16 + React 19 + Tailwind v4 (`@theme inline` in `globals.css`, no config file).

**`PLAN.md` is the source of truth**, §-numbered, with settled decisions D1–D31 in §12 and open
questions in §13. Read the relevant § before changing behavior it describes. Two lists come off it:
`M3B-CHECKLIST.md` (what has to be provisioned before the audio half can start) and
`BACKEND-SETUP.md` (the server-side runbook).

## Status

**Design is ahead of code here, on purpose.** Check `PLAN.md` §11 before assuming a section
describes something that exists.

**Built:** the Circle layer, the Threshold funnel, the REST surface, blob mirroring and
transcription — 49 tests between `utils/circles.test.js` and `utils/threshold.test.js` — plus a
frontend scaffold carrying the route skeleton, the auth stack, the API client and the wire types.

**Designed and not built:** the three surfaces — the ranking queue (§6.2), the reveal (§6.3), the
tide-line language and its measured palette (§9.2) — and **the topic queue (§3.3, M1b), which
reworks the round machine that is running today.** What ships now still has a blocking seeding
round, `cycleIndex` walking `seeds[]` in posted order, and a circle that completes when its seeds
run out. D27–D30 replace all three with a support-ordered queue, an idle state, and a circle that
ends only when its facilitator closes it.

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

- **Redaction is server-side, and there are three states, not two** (D9/D17). During `share` you
  receive only your own stories; during `rank` you receive everyone's with `userId` and `username`
  absent; after `revealed` they are attributed. The client never receives an identity it is meant to
  be hiding, so there is nothing here to accidentally render — keep it that way.
- **Say the honest thing anyway.** In a twelve-person circle a voice recording identifies its
  speaker no matter what the payload strips. The compose surface has to tell people that *before*
  they record.
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
