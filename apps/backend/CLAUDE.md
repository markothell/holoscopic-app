# Backend

Express + Socket.IO + Mongoose server. Single entry point: `websocket-server.js`. Serves REST API on `/api/*` and WebSocket connections. Deployed to Render (see root `render.yaml`). See root `CLAUDE.md` for multi-tenancy and holon economy overview.

## Key Files

| File | Purpose |
|---|---|
| `websocket-server.js` | Entry point: Express setup, Socket.IO, MongoDB connection, route loading |
| `middleware/resolveInstance.js` | Attaches `req.instance` / `req.instanceId` to every `/api` request |
| `middleware/requireAdmin.js` | Checks `x-user-id` header, verifies `role === 'admin'` on `User` doc |
| `utils/holons.js` | `transact()` and `spend()` — the only way to move Holon balances |
| `utils/notify.js` | Creates `Notification` documents for a user |
| `models/Activity.js` | Core document with inline participants, ratings, comments, votes |
| `models/Sequence.js` | Ordered collection of activities with members and round visibility |
| `models/Instance.js` | Per-deployment config: holons, quorum, domains, access |
| `models/InstanceMembership.js` | Per-user per-instance Holon balance |
| `models/Topic.js` | Community topic nominations with supporter wager system |
| `models/Algorithm.js` | Published conversation patterns with fork lineage |
| `models/AlgorithmProposal.js` | Signup-based quorum to run an Algorithm as a session |
| `models/FrameNomination.js` | Links a source activity entry to a result activity |

## Route Loading Pattern

Routes are NOT loaded at startup. `loadAPIRoutes()` in `websocket-server.js` fires only after MongoDB connects (and only once). This means if you restart and Mongo is unavailable, all `/api` routes return 404 until reconnect. Check `apiRoutesLoaded` in the `/health` response.

## Authentication

Most endpoints rely solely on the `x-user-id` request header — there is no JWT verification on regular user endpoints. Only routes that use `requireAdmin` middleware enforce an actual database role check. Never rely on the header value alone for sensitive operations without `requireAdmin`.

## Models and IDs

All models use a custom short string `id` field, not MongoDB's `_id`. Always query:
```js
await Model.findOne({ id: req.params.id });
```
Never `Model.findById(...)`. The `id` is generated with `crypto.randomUUID().substring(0, 8)` or `Math.random().toString(36).substring(2, 10)`.

## Instance Scoping

Routes that handle instance-scoped data always read `req.instanceId` (set by `resolveInstance` middleware). Pattern:
```js
const docs = await Topic.find({ instanceId: req.instanceId, status: 'nominated' });
```
`Activity` and `Sequence` are NOT instance-scoped — they're global.

## API Response Envelopes

**Activities routes** use `{ success: true, data: ... }` (or `{ success: false, error: '...' }`).
**All other routes** (topics, sequences, algorithms, etc.) return plain objects: `{ topic }`, `{ topics: [] }`, `{ sequence }`.

Do not mix these patterns within a route file.

## Quorum Sweep Side Effect

`routes/topics.js` calls `sweepExpired()` and `sweepQuorum()` on every GET request. These write to the database (updating topic statuses, triggering Holon rewards, sending notifications). This is intentional — there is no background job.

## Activity Model: Special Modes

- `maxEntries === 0` → solo tracker mode: creator-only, unlimited `slotNumber` values
- `maxEntries === 1/2/4` → standard collaborative mode, `slotNumber` validates against `maxEntries`
- `activityType === 'snapshot'` → `slotNumber` maps to a question index, not an extra entry

## WebSocket Events (Socket.IO)

| Event (client→server) | Purpose |
|---|---|
| `join_activity` | Register presence; adds participant to DB |
| `leave_activity` | Remove presence; marks `isConnected: false` in DB |
| `submit_rating` | Persist position; broadcasts `rating_added` to room |
| `submit_comment` | Persist comment; broadcasts `comment_added` to room |

| Event (server→client) | Trigger |
|---|---|
| `participant_joined` | New join |
| `participant_left` | Disconnect or leave |
| `rating_added` | Via WebSocket or REST |
| `comment_added` / `comment_updated` | Via WebSocket or REST |
| `comment_voted` | REST vote endpoint |
| `activity_updated` | Slot clear via REST |
| `connection_rejected` | Server at capacity |
| `capacity_warning` | >80% connection limit |

## Common Tasks

**Add a new route file:**
1. Create `routes/myroute.js` exporting a router (or factory function if it needs `io`).
2. Register it in `loadAPIRoutes()` inside `websocket-server.js`.
3. Add `resolveInstance` is already applied — use `req.instanceId` for scoped data.

**Add a new instance-scoped model:**
1. Include `instanceId: { type: String, required: true, default: 'default', index: true }`.
2. Always filter by `instanceId` in queries.

**Holon transaction:**
```js
const { spend, transact } = require('../utils/holons');
// Deduct (throws 'Insufficient Holons' if low):
await spend({ userId, instanceId, type: 'my_cost', amount: 10, refType: 'topic', refId: id });
// Earn:
await transact({ userId, instanceId, type: 'my_reward', amount: 25, refType: 'topic', refId: id });
```

## Things That Are Easy to Break

- **Adding a route before `loadAPIRoutes`**: Any `app.use('/api/...')` call outside `loadAPIRoutes()` bypasses the lazy-load guard and runs before Mongo is ready.
- **`addRating` concurrent updates**: The method uses multi-step `findOneAndUpdate` with retry logic (version errors, duplicate key). Do not replace it with simple `$push` — concurrent WebSocket and REST submissions will corrupt data.
- **Starter data userId pattern**: `starter_<activityObjectId>_<index>` and `username === 'Example Data'` are used to identify and remove seed entries. Do not use this prefix for real users.
- **Connection limit (MAX_CONNECTIONS=25 default)**: The server rejects new Socket.IO connections at capacity. In prod, tune via the env var.
