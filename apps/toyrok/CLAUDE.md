# Toyrok

**The first product** (PLATFORM.md **P18** — read it before working here). toyrok.com; local dev
port **4007**. Circles are the central social unit; this app is where they live. holoscopic.io
stays the lab — and **no surface here ever mentions Holoscopic**: accounts read as Toyrok's own,
though they are the platform's shared `User` collection underneath, so every existing production
account signs straight in.

Next.js 16 + React 19 + Tailwind v4, same stack as the sibling apps. **`DESIGN.md` is the visual
spec** — the "Toono" language MO chose 2026-08-14. The one rule that is easy to break: `--sky`
marks what is live and nothing else; `--ochre` is the solo mark.

## Status

Scaffold, built 2026-08-14: sign in → `/circles` (my circles) → `/c/[urlName]` (**the circle
home** — the map is the hero surface) → read-only `/c/[urlName]/topic/[seedId]`. The v1 plan
(P18) brings Threshold's and Synthesis's participation surfaces inside as packages; Synthesis
gains audio and editable edges on the way in. Until then the topic pages say so and do nothing.

## Architecture

| Where | What |
|---|---|
| `src/components/CircleMap.tsx` | The hero: members on a ring, shared explorations sized by participation, ochre solo spurs, the faint toono crown. Ported from threshold's prototype |
| `src/components/{Shell,Wordmark}.tsx` | Chrome in the Toono language; the ring-O wordmark (still the board sketch — refinement is open work) |
| `src/services/api.ts` | All HTTP. v1 reads the Circle machine via `/api/threshold` — the promotion to `/api/circles` is the M8 trigger, and the paths change in one place here |
| `src/lib/{auth,types}.ts` | Auth stack copy #5 (M2's `@hs/auth` dedupes them) and the wire types, mirrored from threshold |

## Gotchas

- `NEXT_PUBLIC_INSTANCE_ID=threshold` — circles live in the Threshold parent instance until the
  `/api/circles` promotion. A wrong value reads as "circle not found", not as an auth error.
- `NEXTAUTH_SECRET` must equal the backend's `GAME_TOKEN_SECRET` (dev already shares one).
- The map's `participation` block is server-redacted (threshold D9/D17); the client never
  receives an identity it may not show. Keep it that way when porting surfaces.
- No Beacon and no Vercel Analytics yet — the traffic allowlist has no `toyrok` app. Add both
  deliberately when this deploys.
- Deploy day: add toyrok.com to the backend `CLIENT_URL`, set the shared secret, DNS, Vercel
  project. None of it exists yet.

## Running it

```bash
npm run dev:backend   # 4001
npm run dev:toyrok    # 4007
```

Sign in with any dev account (`node scripts/seed-threshold-dev.js` prints them; the 9-member
`harbor` fixture, if present, is the richest circle-home demo).
