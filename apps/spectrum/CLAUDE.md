# On a Spectrum

"A game for revealing nuance" — Next.js app at spectrum.holoscopic.io (local port 4000). Part of the Holoscopic monorepo; see root `CLAUDE.md` for multi-tenancy and the token (holon) economy.

## The game

A creator sets a **topic**, **three themes** (default Experiences / Intentions / Actions), per-round durations (minutes to a full day), and a starting token grant (default 4). Phases, all server-authoritative:

```
lobby → round1 → round2 → round3 → round4 → revise → complete
```

- **Round 1** — brainstorm a **recursive tree** of subtopics around the topic. Nominating or supporting stakes 1 token; quorum confirms. On confirmation a subtopic **returns every staked token immediately** (freeing liquidity to branch and to map later); unconfirmed nominations expire at round end with refunds. A subtopic may branch off the game topic (top level) or off any **confirmed** subtopic (`parentSubtopicId`) to unlimited depth — only confirmed nodes can grow children.
- **Rounds 2–4** (one theme per round) — stake to propose mapping a confirmed subtopic; the nominator picks **1 or 2 spectrums**. At quorum the map goes live and runs its own stage machine: **gather** (players add items + nominate/vote the spectra; window = proportional slice of the round; nominator/host can force-advance) → **rank** (drag-order the frozen items per winning axis) → **done/closed** (aggregate reveal: 1D strip or 2×2 grid). Completing a map (item contributed + every axis ranked) lets the player **claim the stake back**. Round close refunds every unreturned stake — tokens lock and return, never burn.
- **Revise** — the game's own structure as four draggable/editable lines (position = role: line 1 topic, lines 2–4 themes); submissions become proposals.
- **Complete** — proposals as invitation cards; joining lazily creates the child lobby (host = proposer).

## Architecture

- **Identity**: holoscopic accounts via NextAuth credentials (`src/lib/auth.ts`, same stack as apps/holoscopic-game). Mutations carry a short-lived HS256 game token (`/api/auth/game-token`) verified by the backend's `enforceVerifiedUser`.
- **Tenancy**: the parent instance is slug `spectrum` (sent as `x-instance-id`). **Each game room auto-creates its own Instance** (`parentInstanceId` set, slug `oas-<code>`, `gameNumber: null`) whose `config.holons.startingStake` is the token grant — balances ride `InstanceMembership` per room. Room instances are hidden from `/api/instances` lists by default.
- **Room defaults**: `startingTokens`/`quorum`/`votesPerUser`/`maxPlayers` on a new `OasGame.config` fall back to the `spectrum` instance's `config.oas` (platform-editable, `/instances/[id]` config tab) when a creation request doesn't set them explicitly. The `spectrum` instance's `config.holons`/`config.quorum` fields otherwise sit at interView-shaped defaults — OaS never reads them.
- **Backend surface**: `apps/backend/routes/oas.js` + `utils/oasGames.js` (the single funnel: phase machine, timers + sweep-on-read fallback, stakes, map stage machine) + `models/OasGame.js` / `models/OasNomination.js` + `sockets/oas.js` (room membership only; mutations via REST, broadcasts to `oasgame:<id>`).
- **Content**: everything a player writes (items, spectrum ideas + votes, rankings) lives in the shared **Entry collection** via `utils/entries.js`, with the map nomination duck-typed as the activity (`activityId` = nomination id; questionIds `item` / `axis` / `rank-x` / `rank-y`). No Activity documents are involved.
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
