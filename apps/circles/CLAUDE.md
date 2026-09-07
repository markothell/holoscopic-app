# Circles

**The first product, branded Holoscopic** (PLATFORM.md **P18** — read it before working here;
built as "Toyrok" for one day, renamed 2026-08-14). Ships to **circles.holoscopic.io**; local
dev port **4007**. Circles are the central social unit; this app is where they live. The
holoscopic.io homepage stays the lab. Accounts are **Holoscopic accounts, said plainly** — the
platform's shared `User` collection, so every existing production account signs straight in,
and the same-apex subdomain keeps the P2 cookie-SSO path open.

Next.js 16 + React 19 + Tailwind v4, same stack as the sibling apps. **`DESIGN.md` is the visual
spec** — the "Toono" language MO chose 2026-08-14. The one rule that is easy to break: `--sky`
marks what is live and nothing else; `--ochre` is the solo mark.

## Status

Built 2026-08-14: sign in → `/circles` (my circles) → `/c/[urlName]` (**the circle home** — the
map is the hero surface) → `/c/[urlName]/topic/[seedId]`, **one phase-routed surface carrying
the whole loop**: telling (typed-first; staged both poles, one write — threshold D36), sorting
(queue then review, drafts as you go, complete-or-nothing submit — D21/D11), and the reveal
(reader's cutoff, three bands, attribution — D23/D24). Verified in a browser against dev: a
story written, a ranking submitted, a reveal read. **Recording is in** (`@hs/audio` +
`components/Recorder.tsx` + the Blob client-token route at `/api/audio/upload`): a fake-mic
take was recorded, uploaded to the dev store and shared, and the stored row carries the
client-timed duration and peaks. Uploads keep the `threshold/<seedId>/` pathname namespace so
a circle's recordings live in one place whichever front door told them. **The device caveat is
Threshold's M3b caveat, inherited**: a laptop WebM take exercises none of the Safari/iOS
MP4/AAC branches — a real iPhone recording is still owed. Playback is native `<audio>` for
now. **Joining is in**: a signed-in non-member on `/c/[urlName]` sees the shell and a
take-a-seat card (the invitation email is the server-side gate — `joinCircle` — and the same
address becomes the member row's mail address), and `/signup` exists so an invitee without an
account has a door; both callbackUrl flows carry the same open-redirect guard as `/login`.
Verified against dev: a wrong email is refused with the server's words, the right one seats
you and the map appears. **`/api/circles` exists** (the M8 promotion, triggered by this app being the Circle layer's
second consumer): the one-call snapshot, my-circles and join are activity-agnostic routes whose
per-activity content comes from two module hooks — `snapshotExtras` (shares/myRanking/waiting,
redacted by the activity) and `participation` (the map's rows). Both front doors serve the
identical payload from `circles.snapshot`, verified in a browser on both apps. Activity verbs
(telling, sorting, the reveal) stay on `/api/threshold`. **Synthesis is a circle ACTIVITY** (2026-08-20, replacing D17's bridge). A member writes a
document privately in Synthesis and *shares* it with the circle: that writes an ordinary seed
with `activity: 'synthesis'` and `payload: { ideaId }`, so the queue, `participation()`, the mail
and the facilitator verbs all pick it up with no special casing. `utils/synthesisActivity.js` on
the backend supplies what the seed means. The Syntheses band renders from `circle.seeds` — no
second fetch — and carries the picker that shares one.

**A shared document is not a queued one.** A synthesis seed is born `nominated`: readable and
contributable by the whole circle, but outside the queue. Anyone other than its author supporting
it accepts it in as `pending`. Sharing grants access; the queue only orders attention.

On the map: a waiting seed draws as an ochre spur at its author's seat, and a spur whose seed has
been accepted grows a small ochre circle at the open end — bare edge means one person's, dot means
the group said yes. Contributors pull it inward exactly as before. `NEXT_PUBLIC_SYNTHESIS_URL` is
where document links point (default localhost:4004). Still to come per P18: the shared player, and
eventually the synthesis surfaces moving in as a package.

## Architecture

| Where | What |
|---|---|
| `src/components/CircleMap.tsx` | The hero: members on a ring, shared explorations sized by participation, ochre solo spurs, the faint toono crown. Ported from threshold's prototype |
| `src/components/{Shell,Wordmark}.tsx` | Chrome in the Toono language; the wordmark is plain lowercase Seravek (final treatment pending the branding session) |
| `src/services/api.ts` | All HTTP. Generic circle ops AND gather verbs (respond/react/responses/advance) ride `/api/circles`; Threshold's own verbs stay on `/api/threshold` |
| `src/lib/{auth,types}.ts` | Auth stack copy #5 (M2's `@hs/auth` dedupes them) and the wire types, mirrored from the backend serializers |
| `src/app/c/[urlName]/new/page.tsx` | The activity builder's creator flow (PRIMITIVES.md §9 S-decisions, 2026-08-20): + on circle home → primitives/templates tabs → four connected dots (shape, prompt, reveal, launch), staged locally and sent as ONE postSeed with `activity: 'gather'` |
| `src/app/c/[urlName]/activity/[seedId]/page.tsx` | One gather ask, respond + reveal in a single surface (B4 keeps input open past the reveal). Voice-first or text-first story (S1), five stops (S2), free/quadrant grids (S3), tell-then-place (S4), the words chip field with the coin budget (S5), the state line + facilitator's confirm-gated Reveal-now (S19/S20) |
| `src/components/GatherSurface.tsx` | The gather ask itself, lifted out of the activity page so `/demo` renders the SAME surface. `readOnly` withholds every writing control (compose, edit, reveal-now, reactions) and changes nothing else; it defaults false |
| `src/components/circleHome.tsx` | The circle home's bands — header, the running-now card, Proposed, the record — lifted out of the home page for the same reason. `basePath` redirects seed links, `readOnly` withholds the backing control; both default to the real behaviour |
| `src/app/demo/` + `src/lib/demo.ts` | **The public, no-account demo at `/demo`** (see below) |
| `src/components/gather.tsx` | The reveal pieces: `ResponseRing` (each response at its teller's seat, the shape's visual in the center — prompt+count / mini chart / portrait, S6–S8, S11), `StackChart` (R2), `DotMap` (R3, cluster-sized nodes, no spread ellipse), `Portrait`, `ResponseCard` with the small-ring reaction mark (S14/S17) |

## The public demo (`/demo`)

A no-account sample of the whole product, **rendered client-side from a typed fixture and making
no backend request of any kind**. It exists because the circle read paths are member-gated
server-side on purpose — `utils/circles.js` gates the snapshot's extras and participation behind
`payload.isMember`, and `routes/circles.js`'s responses route calls `assertMember` — and those
gates are not being loosened for a marketing page. The precedent is Synthesis's
`src/lib/mock.ts`.

- **`src/lib/demo.ts` is the fixture**, typed against `@/lib/types`. That typing is the whole
  point: if a wire type moves, the demo stops compiling instead of quietly drifting.
- **The content is `apps/backend/scripts/seed-gather-demo.js`'s, verbatim** — the Lantern circle,
  its eight invented people, its five asks, the same word picks and coordinates. Change one,
  change the other.
- Everything renders through the app's real components (`CircleMap`, `circleHome.tsx`,
  `GatherSurface`), passed `basePath="/demo"` and `readOnly`. Nothing is reimplemented.
- **Read-only, and labelled on every surface** — `app/demo/DemoNotice.tsx` says the people are
  written rather than collected and carries the way out. Controls that would write are absent,
  never inert-looking.
- **No audio, deliberately** (the seed script's rule): a fake blob URL renders as a broken player.
- Ask 4 is sealed and still running, so its surface shows the state line and nothing else. That
  is the mechanic, not a hole — sealed serves own-only, and the demo's reader owns nothing.

## Gotchas

- `NEXT_PUBLIC_INSTANCE_ID=threshold` — circles still live in the Threshold parent instance
  (P6's one-platform-instance is future work). `/api/circles` has no app gate by design: every
  lookup is instance-scoped, so a wrong value reads as "circle not found", not as an auth error.
- `NEXTAUTH_SECRET` must equal the backend's `GAME_TOKEN_SECRET` (dev already shares one).
- The map's `participation` block is server-redacted (threshold D9/D17); the client never
  receives an identity it may not show. Keep it that way when porting surfaces.
- Beacon and Vercel Analytics both mounted (2026-08-17, with the deploy): the sixth `Beacon.tsx`
  mirror and the fifth `VercelAnalytics.tsx` mirror, and the traffic allowlist knows `circles`.
  The Vercel-side Web Analytics toggle for the project is the dashboard half.
- Deployed 2026-08-17: live at circles.holoscopic.io on the `holoscopic-app-circles` Vercel
  project (root `apps/circles`), instance `circlemo`, CORS in the backend `CLIENT_URL`, Blob via
  the shared threshold store, one M2 session across the apex.

## Running it

```bash
npm run dev:backend   # 4001
npm run dev:circles    # 4007
```

Sign in with any dev account (`node scripts/seed-threshold-dev.js` from `apps/backend` prints
them), then `node scripts/seed-circles-dev.js` builds this app's three demo circles — `/c/harbor`
(the richest map: 9 members, mixed participation, solos, a live rank round), `/c/quay` (mid-share,
Mara not yet in — the telling flow), `/c/inlet` (invitation-only — the take-a-seat card). Both
scripts are dev-only and rebuild their own fixtures on every run.
