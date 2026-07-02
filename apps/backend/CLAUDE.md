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
| `utils/entries.js` | The single write funnel for entries (upsert, vote, clear, seed) + wire serializers `toClient`/`toRedacted` |
| `models/Entry.js` | Source of truth for participation: position + text + votes per (activity, user, slot, question), with denormalized `instanceId`/`topicId` |
| `models/Activity.js` | Map configuration + membership (`participants[]`) + stake ledger — no entry content |
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

**All schemas include `{ id: false }` in their schema options.** This disables the Mongoose built-in `id` virtual (which returns `_id.toString()`) so that `doc.id` unambiguously refers to the custom schema field. Without this, Mongoose 8's virtual shadows the schema path and `doc.id` returns the wrong value in code and in `toJSON()` output. Never remove this option when adding a new model.

## Instance Scoping

Routes that handle instance-scoped data always read `req.instanceId` (set by `resolveInstance` middleware). Pattern:
```js
const docs = await Topic.find({ instanceId: req.instanceId, status: 'nominated' });
```
`Activity`, `Entry`, and `FrameOfReference` are instance-scoped; `Sequence` and `User` are global.

## API Response Envelopes

All routes return plain objects — `{ activity }`, `{ activities, total }`, `{ entry }`, `{ topic }` — and `{ error }` with a meaningful status code on failure. (Auth/signup routes still use `{ success }`.)

## Quorum Sweep Side Effect

`routes/topics.js` calls `sweepExpired()` and `sweepQuorum()` on every GET request. These write to the database (updating topic statuses, triggering Holon rewards, sending notifications). This is intentional — there is no background job.

## Activity Model: Special Modes

- `maxEntries === 0` → solo tracker mode: creator-only, unlimited `slotNumber` values, self-votes allowed
- `maxEntries === 1/2/4` → standard collaborative mode, `slotNumber` validates against `maxEntries`
- `activityType === 'snapshot'` → `slotNumber` = question order and `questionId` is set on the entry

## Close Rule

A map settles at the earliest of (a) complete — table full AND every participant has entered and voted (checked after each vote), or (b) `activityWindowHours` after creation (sweep-on-read in `GET /activities`). Settlement distributes each staker's pool to the entry authors they voted for (`settleActivityStakes`).

## WebSocket Events (Socket.IO)

There are two socket room types: **activity rooms** (existing) and **user rooms** (added for live balance/notification push).

### User rooms
Each authenticated user joins a personal room named `user:<userId>` by emitting `join_user_room`. The frontend `AuthContext` maintains a persistent socket connection for this purpose.

`utils/holons.js` and `utils/notify.js` each expose `setIO(io)` and emit to user rooms after mutations:
- `holon_update { balance }` — emitted after every `transact()` call
- `notification_new { ...notification }` — emitted after every `notify()` call

Call `setIO(io)` for both utilities in `websocket-server.js` right after `io` is created.

### Activity rooms

| Event (client→server) | Purpose |
|---|---|
| `join_user_room` | Join personal room for live balance/notification push |
| `join_activity` | Register presence (in-memory) + add membership to DB |
| `leave_activity` | Remove presence (in-memory only — no DB write) |
| `submit_entry` | Persist entry via `utils/entries.js`; broadcasts `entry_upserted` |

| Event (server→client) | Trigger |
|---|---|
| `holon_update` | After any `transact()` or `spend()` call |
| `notification_new` | After any `notify()` call |
| `participant_joined` | New join |
| `participant_left` | Disconnect or leave |
| `entry_upserted` | Entry submitted via WebSocket or REST |
| `entry_voted` | REST vote endpoint |
| `entry_removed` | Admin moderation delete |
| `entries_cleared` | Slot clear via REST |
| `activity_updated` | Auto-close settlement |
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
- **Writing entries outside `utils/entries.js`**: the upsert key, vote-reset-on-remap rule, and voteCount maintenance live there; bypassing it desyncs them.
- **Seed data**: seed entries are `isSeed: true` with userId `seed_<activityId>_<index>`. Filter with the flag, never by userId prefix.
- **Connection limit (MAX_CONNECTIONS=25 default)**: The server rejects new Socket.IO connections at capacity. In prod, tune via the env var.
