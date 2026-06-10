# Holoscopic Monorepo

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
- `Topic`, `Algorithm`, `AlgorithmProposal`, `HolonTransaction`, `InstanceMembership`

**NOT instance-scoped**: `Activity`, `Sequence`, `User` — these are global.

## Critical Architectural Decisions

- **Custom `id` field**: Every MongoDB document has a short random string `id` field, NOT `_id`. Always query with `findOne({ id })`, never `findById()`.
- **Dual submission path**: Ratings and comments can arrive via WebSocket events OR REST calls. Both paths persist to MongoDB and broadcast via Socket.IO. REST is the source of truth.
- **Routes loaded lazily**: All Express routes mount inside `loadAPIRoutes()`, which only fires once MongoDB connects. If Mongo is down at startup, routes are never registered.
- **Quorum sweep on read**: `GET /api/topics` and `GET /api/topics/:id` call `sweepExpired()` and `sweepQuorum()` — reads have write side effects.
- **Activity types have legacy aliases**: The DB schema accepts `holoscopic` and `findthecenter` (old names). `@hs/activities` normalizes these to `dissolve` and `resolve`. Create new activities with the normalized names.

## API Response Envelope Inconsistency

Activities routes return `{ success: true, data: ... }`. Topics, algorithms, and sequences return plain objects like `{ topic: {...} }` or `{ topics: [...] }`. Be aware when writing new consumers.

## Holon Economy

Holons are an in-game token. `utils/holons.js` exposes two helpers:
- `transact({ userId, instanceId, type, amount, ... })` — earn or spend, always logs a `HolonTransaction`
- `spend({ userId, instanceId, type, amount, ... })` — deducts only; throws `'Insufficient Holons'` (→ HTTP 402)

Both require `instanceId`. Do not touch balances directly on `InstanceMembership`.

## CORS

Allowed origins from `CLIENT_URL` env var (comma-separated) in `apps/backend/.env.local`. Add new game domains here when deploying.

## What NOT to Do

- Do NOT query `Activity.findById()` — use `Activity.findOne({ id })`.
- Do NOT add new instance-scoped collections without also updating `resolveInstance` usage in the relevant route.
- Do NOT skip `instanceId` on new `Topic`/`Algorithm`/`AlgorithmProposal` documents.
- Do NOT use `maxEntries: 0` unless you intend solo tracker mode (creator-only, unlimited slots).
- Do NOT add new activity types to the DB schema enum without also adding them to `normalizeActivityType()` in `@hs/activities`.

## When to Escalate to the User

- Any change to the holon economy parameters or quorum thresholds (these are per-instance config, changing defaults affects all instances).
- New deploy targets beyond what's in `render.yaml`.
- Changes to MongoDB indexes on large collections (`activities`, `ratings`, `comments` arrays).
- Anything touching auth — password hashing, session tokens, `requireAdmin` middleware.
