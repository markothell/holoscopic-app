# On a Spectrum

"A game for revealing nuance" — Next.js app at spectrum.holoscopic.io (local port 4000). Part of the Holoscopic monorepo; see root `CLAUDE.md` for multi-tenancy and the token (holon) economy.

## The game

A creator sets a **topic**, **three themes** (default Experiences / Intentions / Actions), per-round durations (minutes to a full day), and a starting token grant (default 4). Phases, all server-authoritative:

```
lobby → round1 → round2 → round3 → round4 → revise → complete
```

- **Round 1** — brainstorm a **recursive tree** of subtopics around the topic. Nominating or supporting stakes 1 token; quorum confirms. On confirmation a subtopic **returns every staked token immediately** (freeing liquidity to branch and to map later); unconfirmed nominations expire at round end with refunds. A subtopic may branch off the game topic (top level) or off any **confirmed** subtopic (`parentSubtopicId`) to unlimited depth — only confirmed nodes can grow children.
- **Rounds 2–4** (one theme per round) — stake to propose mapping a confirmed subtopic **with the lens up front**: the nominator seeds 1–2 **frames** (pole pairs, typed fresh or borrowed from the game's shelf; 1 = ranked line, 2 = 2×2) into the proposal's **frameSlate**. The lens is the nominator's call alone — while the nomination gathers quorum they can **✕ remove one of their own frames and add a different one** (`removeSlateFrame`/`proposeSlateFrame`, nominator-only; a map can't confirm mid-swap, while a slot sits open). Everyone else just stakes to support the proposal as posted, same as any other nomination. At quorum the slate locks into `mapState.winningAxes` as-is (slate order; first = x) and the map goes live: **gather** (items only — the locked frame renders as the empty map and is the prompt; window = proportional slice of the round, 90s floor; nominator/host can force-advance at ≥2 items) → **rank** (drag-order the frozen items per axis, poleA = "most" at top) → **done/closed** (aggregate reveal on the same frame skeleton). A subtopic can host **multiple maps per round, one per lens**: a rival proposal may not reuse a frameId a live nomination's slate (or a confirmed map's winning axes) already claims on that subtopic. Completing a map (item contributed + every axis ranked) lets the player **claim the stake back**. Round close refunds every unreturned stake — tokens lock and return, never burn.
- **Revise** — the game's own structure as four draggable/editable lines (position = role: line 1 topic, lines 2–4 themes); submissions become proposals.
- **Complete** — proposals as invitation cards; joining lazily creates the child lobby (host = proposer).

## Architecture

- **Identity**: holoscopic accounts via NextAuth credentials (`src/lib/auth.ts`, same stack as apps/holoscopic-game). Mutations carry a short-lived HS256 game token (`/api/auth/game-token`) verified by the backend's `enforceVerifiedUser`.
- **Tenancy**: the parent instance is slug `spectrum` (sent as `x-instance-id`). **Each game room auto-creates its own Instance** (`parentInstanceId` set, slug `oas-<code>`, `gameNumber: null`) whose `config.holons.startingStake` is the token grant — balances ride `InstanceMembership` per room. Room instances are hidden from `/api/instances` lists by default.
- **Room defaults**: `startingTokens`/`quorum`/`votesPerUser`/`maxPlayers` on a new `OasGame.config` fall back to the `spectrum` instance's `config.oas` (platform-editable, `/instances/[id]` config tab) when a creation request doesn't set them explicitly. The `spectrum` instance's `config.holons`/`config.quorum` fields otherwise sit at interView-shaped defaults — OaS never reads them.
- **Backend surface**: `apps/backend/routes/oas.js` + `utils/oasGames.js` (the single funnel: phase machine, timers + sweep-on-read fallback, stakes, frame slate + resolution, map stage machine) + `models/OasGame.js` / `models/OasNomination.js` / `models/OasFrame.js` + `sockets/oas.js` (room membership only; mutations via REST, broadcasts to `oasgame:<id>`).
- **Frames**: each distinct pole pair in a game is one `OasFrame` doc (deduped case-insensitively in both orientations, poles frozen after creation) — the room's reusable lens vocabulary. Per-map support lives on the nomination's `frameSlate[]` (denormalized poles, nominator-only), never on the frame doc. `voterIds` on `frameSlate` entries is a vestige of the retired frame-voting mechanic — always empty now, kept only for schema/data compatibility with older games. Two maps sharing a `frameId` are comparable (same lens, different subtopic). The client derives the shelf from the nomination stream (`framesInPlay`) — no extra fetch. Orientation: **poleA = the "most" end** (filled dot; right on x, top on y) everywhere — glyphs (`components/frames/FrameGlyph.tsx`), rank order, reveal.
- **Content**: items and rankings live in the shared **Entry collection** via `utils/entries.js`, with the map nomination duck-typed as the activity (`activityId` = nomination id; questionIds `item` / `rank-x` / `rank-y`). Frames and their votes live on `OasFrame`/`OasNomination`, not Entries. No Activity documents are involved.
- **Aggregation** (`utils/oasStats.js`): two read surfaces, both scoped to the `spectrum` parent instance via denormalized `OasGame.parentInstanceId` / `OasFrame.parentInstanceId` (backfilled lazily on first aggregate read). `GET /oas/me/games` — **self-only** (identity from the verified bearer, never a bare header): active rooms, completed history with the caller's per-game slice, and the spectrums they coined with anonymous cross-game counts. `GET /oas/pulse` — **public, no user identity in the payload**: stats band + *conversations* (game threads grouped by `OasGame.rootGameId`, the parentless ancestor — the revise→proposal→child loop is one thread; movement = latest `updatedAt`, drift = root vs latest topic) + *spectrums* (frames grouped across games by `OasFrame.key`, the sorted-lowercase pole pair). The player-facing word for a frame is **"spectrum"** everywhere in copy; "frame"/`OasFrame` is the code name only. Per-game rollup is an immutable `OasGame.summary` computed once when a completed game is first read (sweep-on-read style; also the backfill path — includes mean `spread` = the "nuance"/most-contested sort). Pages: `/me` (auth-gated, private) and `/games` (public pulse), both linked from the landing.
- **Client state**: `useOasGame` (snapshot is source of truth, re-fetched on focus/reconnect; `oas_*` socket events lower latency; `holon_update` filtered by room instance) and `useMapDetail` for an open map sheet.

## Visual language

Paper/ink editorial theme in `src/app/globals.css` (Tailwind v4 `@theme inline`, no config file). Barlow Condensed display, DM Mono eyebrows, Cormorant serif. Theme accents: crimson `--x-accent` (round 2), cobalt `--y-accent` (round 3), emerald `--z-accent` (round 4). One overlay pattern: `ui/BottomSheet`. Mobile-first `max-w-md` columns; the graph (`components/graph/GameGraph.tsx`, @xyflow/react) is the only full-bleed surface.

## Environment

- `NEXT_PUBLIC_API_URL` (default http://localhost:4001/api), `NEXT_PUBLIC_SERVER_URL` (socket)
- `NEXT_PUBLIC_INSTANCE_ID` (default `spectrum`)
- `NEXTAUTH_URL`, `NEXTAUTH_SECRET` — must match the backend's `GAME_TOKEN_SECRET`/`NEXTAUTH_SECRET`

## Gotchas

- Round/stage deadlines use in-memory timers with **sweep-on-read** as the durable fallback — a game nobody reads doesn't advance until the next snapshot request.
- Stake refunds are idempotent via `stake.returned`; never move balances outside `utils/holons.js`.
- `oasService` mutations all need the signed-in `userId`; reads work anonymous but return no `balance`/`myMaps`.
