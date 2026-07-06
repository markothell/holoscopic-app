# Holoscopic Monorepo (GitHub: markothell/holoscopic-app)

`main` is the production branch: pushing it deploys the backend (Render) and the frontends (Vercel). Two games ship from here:
- **interView** — `apps/holoscopic-game`, the production game app at holoscopic.io
- **On the Spectrum** — `apps/spectrum`, at spectrum.holoscopic.io (backend surface: `apps/backend/routes/spectrum.js`)

Local dev ports: spectrum 4000, backend 4001, platform 4002, game 4003.

Holoscopic is a collective-sensemaking platform where groups map their perspectives on a 2D grid, leave comments, and vote on each other's views. It is multi-tenant: one backend serves multiple isolated deployments ("instances"), each with its own holon economy, quorum rules, and data scope.

## Tech Stack

| Layer | Tech |
|---|---|
| Game frontend | Next.js 15, TypeScript, Tailwind v4 |
| Platform admin | Next.js 15, TypeScript, inline styles |
| Backend | Express, Socket.IO, Mongoose (MongoDB) |
| Shared components | `@hs/activities` — React component library (local package) |
| Monorepo tooling | npm workspaces + Turborepo |
| Deploy | Backend on Render; frontends deploy separately |

## Directory Map

```
holoscopic/
├── apps/
│   ├── holoscopic-game/   Next.js game frontend (port 3000)  → see apps/holoscopic-game/CLAUDE.md
│   ├── platform/          Next.js admin UI for instance mgmt (port 3002)  → see apps/platform/CLAUDE.md
│   └── backend/           Express + Socket.IO API server (port 3001)  → see apps/backend/CLAUDE.md
├── packages/
│   └── activities/        Shared activity engine, types, and UI components  → see packages/activities/CLAUDE.md
├── package.json           npm workspaces root
├── turbo.json             Turborepo pipeline config
└── render.yaml            Render deploy config (backend only)
```

## Running Locally

```bash
npm run dev:backend     # port 3001
npm run dev:game        # port 3000
npm run dev:platform    # port 3002
```

## Multi-Tenancy

Every `/api` request is resolved to an `Instance` via `apps/backend/middleware/resolveInstance.js`.

Resolution order:
1. `x-instance-id` request header
2. `Origin`/`Referer` → domain lookup on `Instance.domains[]`
3. Auto-create/return default instance

The middleware attaches `req.instance` and `req.instanceId` for all downstream handlers.

**Instance-scoped models** (always filter by `instanceId: req.instanceId`):
- `Topic`, `Algorithm`, `AlgorithmProposal`, `HolonTransaction`, `InstanceMembership`, `Activity`, `Entry`, `FrameOfReference`

**NOT instance-scoped**: `Sequence`, `User` — these are global.

## Storage Protocol: Entries

The **`Entry` collection is the source of truth for all participation content** (positions, comment text, votes). One document per `(activityId, userId, slotNumber, questionId)` carrying denormalized ancestry (`instanceId`, `topicId`, `activityId`), `position`, `text`, `objectName`, `voterIds[]`, `voteCount`, and `isSeed`. `Activity` documents hold only configuration, membership (`participants[]`), and the stake ledger — never entry content.

All entry writes go through `apps/backend/utils/entries.js` (upsert, vote, clear, seed). REST routes and Socket.IO handlers are thin wrappers over it. Key rules encoded there:
- Re-submitting a slot **upserts** (merges position/text) — no duplicates, no retry loops.
- Submitting a new position **resets votes cast by others** on that entry (returns voters' budgets).
- Seed/sample data is flagged `isSeed: true` (never magic userId prefixes).

Map queries are flat index scans: personal maps via `{instanceId, userId}`, voted-for lookups via multikey `{instanceId, voterIds}`, topic rollups via `{topicId}`.

## Critical Architectural Decisions

- **Custom `id` field**: Every MongoDB document has a short random string `id` field, NOT `_id`. Always query with `findOne({ id })`, never `findById()`.
- **Dual submission path**: Entries can arrive via the `submit_entry` WebSocket event OR `POST /activities/:id/entry`. Both wrap `utils/entries.js` and broadcast `entry_upserted` via Socket.IO.
- **Routes loaded lazily**: All Express routes mount inside `loadAPIRoutes()`, which only fires once MongoDB connects. If Mongo is down at startup, routes are never registered.
- **Sweeps on read**: `GET /api/topics` calls `sweepExpired()`/`sweepQuorum()`, and `GET /api/activities` settles expired maps — reads have write side effects.
- **Activity types**: exactly `dissolve`, `resolve`, `snapshot`. No legacy aliases exist in the schema or the client.
- **Game-scoped profiles**: `GET /api/users/:userId/games` (player history) and `GET /api/users/:userId/game-map` (redacted personal map — voted-for entries are author-stripped **server-side**). Privacy gate is shared `InstanceMembership`.

## API Response Envelope

All routes return plain objects: `{ activity }`, `{ activities, total }`, `{ entry }`, `{ topic }`, etc. Errors are `{ error }` with a meaningful status. (Auth/signup routes still use `{ success }` — they predate the convention.)

## Holon Economy

Holons are an in-game token. `utils/holons.js` exposes two helpers:
- `transact({ userId, instanceId, type, amount, ... })` — earn or spend, always logs a `HolonTransaction`
- `spend({ userId, instanceId, type, amount, ... })` — deducts only; throws `'Insufficient Holons'` (→ HTTP 402)

Both require `instanceId`. Do not touch balances directly on `InstanceMembership`.

## CORS

Allowed origins from `CLIENT_URL` env var (comma-separated) in `apps/backend/.env.local`. Add new game domains here when deploying.

## What NOT to Do

- Do NOT query `Activity.findById()` — use `Activity.findOne({ id })`.
- Do NOT write to the entries collection outside `utils/entries.js`.
- Do NOT skip `instanceId` on new `Activity`/`Entry`/`Topic`/`FrameOfReference`/`Algorithm` documents.
- Do NOT return another user's identity on voted-for entries — redaction happens in the API layer (`entries.toRedacted`), never client-side.
- Do NOT use `maxEntries: 0` unless you intend solo tracker mode (creator-only, unlimited slots).
- Do NOT add new activity types to the DB schema enum without registering them in `@hs/activities`.

## When to Escalate to the User

- Any change to the holon economy parameters or quorum thresholds (these are per-instance config, changing defaults affects all instances).
- New deploy targets beyond what's in `render.yaml`.
- Changes to MongoDB indexes on large collections (`activities`, `ratings`, `comments` arrays).
- Anything touching auth — password hashing, session tokens, `requireAdmin` middleware.
