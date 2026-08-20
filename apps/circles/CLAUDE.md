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
| `src/services/api.ts` | All HTTP. Generic circle ops ride `/api/circles`; activity verbs stay on `/api/threshold` |
| `src/lib/{auth,types}.ts` | Auth stack copy #5 (M2's `@hs/auth` dedupes them) and the wire types, mirrored from threshold |

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
