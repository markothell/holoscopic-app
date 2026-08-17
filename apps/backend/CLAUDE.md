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
| `models/Circle.js` | The generic cohort + round machine (members, seed queue, phase machine) — activity-agnostic by design. Since 2026-08-17: `seeds[].activity` (per-seed module, null = the circle's own) and `config.maxLive` (concurrent cycles, default 1 = the original machine) |
| `utils/circles.js` | The round machine's funnel: membership, seeds, phases, mail, the one-call `snapshot`, `participation`. Resolves the module PER SEED (`modFor`), runs up to `maxLive` cycles at once, and a seed payload's `<phase>Hours` key overrides the circle's clock |
| `utils/circleActivities.js` | The module registry that keeps `utils/circles.js` generic — `register(key, module)`, hooks incl. `snapshotExtras`/`participation` |
| `routes/circles.js` | `/api/circles` — the activity-agnostic surface (snapshot, my circles, join) plus the generic seed verbs (post/support/advance) and the gather verbs (respond/react); Threshold's own verbs stay on `/api/threshold` |
| `utils/gather.js` | The builder's single-round activity (PRIMITIVES.md §9): prompt → responses → reveal, shapes story/placement/story+placement/words, sealed-or-open reveal, reactions, on-read aggregate. Registers itself as activity `gather`; write funnel for the primitive collections |
| `models/Share.js` | PRIMITIVE voice/text contribution (P8) — first writer is gather; unique `(seedId, userId, slot)` IS the cardinality rule. `wordIds` carries a words-shape response's picks |
| `models/Placement.js` | PRIMITIVE located opinion (P8): position / bucket / rank, unique `(seedId, userId, kind, targetId, axis)`; draft vs committed via `committedAt` |
| `models/Vocabulary.js` | PRIMITIVE participant-extendable word set (P8, generalizes MemoryTag) — first writer is gather's words shape; unique `(scopeId, set, key)` is the dedupe; gather computes counts on read and leaves `useCount` at 0 |
| `models/Entry.js` | Source of truth for participation: position + text + votes per (activity, user, slot, question), with denormalized `instanceId`/`topicId` |
| `models/Activity.js` | Map configuration + membership (`participants[]`) + stake ledger — no entry content |
| `models/Sequence.js` | Ordered collection of activities with members and round visibility |
| `models/Instance.js` | Per-deployment config: which `app` it belongs to, holons, quorum, domains, access |
| `utils/memorialDefaults.js` | What a new Chorus memorial starts life with — shared by `POST /instances` and `scripts/seed-memorial.js` so both make the same product |
| `utils/blobMirror.js` | Off-site copy of Chorus media. Vercel Blob has no snapshots or undelete, so recordings are mirrored to the backup bucket on write and reconciled nightly |
| `utils/backupNamespace.js` | Which part of the shared backup bucket a run may write to, decided from the cluster it connected to rather than from a variable somebody has to set |
| `utils/traffic.js` | Site traffic write funnel — page views and link clicks, two storage tiers. **Not** `routes/analytics.js`, which counts participation inside activities |
| `utils/email.js` | The only place mail leaves this platform. One Resend call, never throws — a send is always a side effect of something that already succeeded. `utils/alerts.js` adds throttling on top for operator mail |
| `models/InstanceMembership.js` | Per-user per-instance Holon balance |
| `models/Topic.js` | Community topic nominations with supporter wager system |
| `models/Algorithm.js` | Published conversation patterns with fork lineage |
| `models/AlgorithmProposal.js` | Signup-based quorum to run an Algorithm as a session |
| `models/FrameNomination.js` | Links a source activity entry to a result activity |

## Route Loading Pattern

Routes are NOT loaded at startup. `loadAPIRoutes()` in `websocket-server.js` fires only after MongoDB connects (and only once). This means if you restart and Mongo is unavailable, all `/api` routes return 404 until reconnect. Check `apiRoutesLoaded` in the `/health` response.

## `/health` is the diagnostic surface

`GET /health` reports the states in which this process is up but not useful, so they are answerable
without exercising the feature:

| Field | Gates health? | Meaning |
|---|---|---|
| `mongodb`, `apiRoutesLoaded` | yes → 503 | Routes never mounted; every `/api` 404s |
| `authConfigured` | yes → 503 | No token secret, so every identity-bearing write 503s while reads look fine |
| `transcription` | **no** | `ready` \| `no-api-key` \| `no-secret` \| `no-callback-url` |
| `mediaBackup` | **no** | `ready` \| `no-bucket` \| `no-credentials` \| `no-region` — whether recordings get an off-site copy |
| `alerting` | **no** | `ready` \| `no-api-key` \| `no-recipient` — whether a client failure report reaches a person (`utils/alerts.js`, `RESEND_API_KEY` + `ALERT_EMAIL`) |

The rule for adding a field: **gate health on it only if the platform is broken without it.**
Chorus transcription is optional by design — audio records and plays without it — so it is
reported and never gates. Anything whose absence leaves the app behaving perfectly except that one
thing silently never happens belongs here; that invisibility is the whole reason the field exists.

This makes a restart expensive rather than free. Until Mongo connects — 1s warm, up to ~9s on a cold Atlas cluster — requests do not 404 cleanly; they sit in mongoose's 10s command buffer and then 500. So a boot is roughly ten seconds of hangs, not a blip.

## Running It Locally

`npm run dev` (workspace script: `nodemon websocket-server.js`) watches all of `apps/backend`, so every save by every agent restarts the server and inflicts the boot cost above on all seven frontends. When other agents are working in this tree, run it without the watcher instead:

```bash
npm run start --workspace=apps/backend        # plain node, no restarts
PORT=4051 npm run start --workspace=apps/backend   # or on a spare port
```

See root `CLAUDE.md` § *Working in a Shared Tree* for how to tell this apart from a bug in your own code.

## Scripts connect with `autoIndex: false`. Always.

`websocket-server.js` sets `autoIndex: process.env.NODE_ENV !== 'production'` so an index
declaration added to `models/*.js` cannot build itself against production on deploy —
`scripts/ensure-indexes.js` is meant to be the only path. **Every script in `scripts/` bypassed
that**, because `mongoose.connect(uri)` with no options defaults `autoIndex` to true: requiring a
model compiles its schema, and Mongoose then builds every declared index on the database that
script happens to be pointed at.

That is not theoretical. `scripts/backup-blobs.js` runs **nightly in production** from the Render
cron and requires `models/Memory` and `models/Instance` — so an index added to the Chorus memory
model reached production at 07:00 UTC the next morning, with no deploy and nothing printed. The two
`users` token indexes got there the same way, via a one-off backfill run.

So: `await mongoose.connect(uri, { autoIndex: false })`, in every script, including throwaways.
The failure it prevents is invisible while collections are small and expensive exactly once.

## Backups: one bucket, two namespaces

Dev and production have separate clusters, separate database names and separate Blob stores, but
they still share **one backup bucket**. `utils/backupNamespace.js` decides the prefix from the
cluster actually connected, never from a variable:

| | Mongo | Blob | Lifecycle |
|---|---|---|---|
| Dev | `mongo-dev/holoscopic-dev/` | `blob-dev/` | deleted after 7 days |
| Production | `mongo/holoscopic-db/` | `blob/` | kept |

It fails closed both ways, because each direction has a silent failure: a dev dump under the
production prefix overwrites the `latest.json` somebody follows during a restore, and a production
dump under the dev prefix inherits the 7-day expiry while every run keeps reporting success. That
second one is why an unrecognised host is **fatal** under `NODE_ENV=production` rather than being
treated as dev — a cluster migration must break the backup loudly.

## Rate limiting, and why Chorus has its own buckets

`app.use('/api', apiLimiter)` is 100 req/min per IP for every router **except
`/api/memorial`**, which is skipped. Chorus pages are Server Components, so a
visitor's wall read reaches this server **from Vercel, not from their phone** —
every reader of every memorial worldwide shares a handful of egress IPs. A
per-IP ceiling therefore measures the wrong thing there: it throttles a
popular memorial while a flood from one phone still looks like one visitor.

Four buckets replace it, all tunable from Render without a deploy:

| Bucket | Key | Default | Env |
|---|---|---|---|
| `memorialReadLimiter` | IP (in practice, aggregate for the whole app) | 600/min | `MEMORIAL_REQUESTS_PER_MIN_PER_IP` |
| `memorialIpLimiter` | IP — the real abuse ceiling | 300 writes/hour | `MEMORIAL_WRITES_PER_HOUR_PER_IP` |
| `memorialWriteLimiter` | **contributor token**, IP when absent | 30 writes/hour | `MEMORIAL_WRITES_PER_HOUR` |
| `memorialEventLimiter` | IP | 60 reports/hour | — |

Keying writes per contributor is what makes a wake work: forty phones on one
venue wifi get forty budgets instead of splitting one. The token is
client-supplied and freely re-mintable, so it is **not** the abuse ceiling —
`memorialIpLimiter` is, and the per-contributor bucket may be generous only
because that backstop exists.

**`/session` is skipped by both write buckets.** A mint happens when somebody
opens the compose sheet, so counting it means a room full of people opening the
sheet exhausts the venue's budget before a single memory is written. It is a
stateless HMAC with no database write; `memorialReadLimiter` is its ceiling.

## Site traffic (`/api/traffic`)

Page views from every frontend, plus link clicks on the holoscopic.io homepage.
Read it in the platform admin at **`/traffic`**. Two endpoints with opposite postures:
`POST /collect` is open to the internet (every visitor's browser calls it, so the router is
mounted bare like `/api/memorial` and the global `apiLimiter` skips it in favour of
`trafficLimiter`, 300/min/IP, `TRAFFIC_EVENTS_PER_MIN_PER_IP`); `GET /summary` is `requireAdmin`.

**Two tiers, and the split is the whole storage design.** `TrafficEvent` is raw detail with a
30-day TTL; `TrafficDaily` is a permanent counter per `(day, app, type, key)`, written in the same
call rather than by a nightly job. Nothing in the raw tier is the only copy of anything, so the TTL
can drop it without a chart losing history.

- **`app` is sent by the beacon and validated against an allowlist**, never inferred from `Origin`
  — same reasoning as `Instance.app`. `resolveInstance`'s fallback is deliberately unused here: it
  never fails, so it would attribute a memorial's traffic to the default interView edition.
  holoscopic.io reports as three apps (`site` / `interview` / `map-sequence`), split by path in its
  own beacon, because that app is the only thing that knows its routes.
- **Visitors are anonymous and single-day by construction.** `visitorHashFor` puts the calendar day
  *inside* an HMAC of IP + user-agent, so there is no salt to rotate and yesterday's hash for a
  given phone is not recomputable. No cookie, no localStorage, no id. Chorus in particular has no
  accounts by design, and a durable visitor id there would break that.
- **`visitors` is only maintained on the `key: '*'` rows** and must never be summed across paths —
  one person viewing five pages is one visitor. `TrafficVisitorDay` decides "new today?" via a
  unique-index duplicate-key error, which makes the count exact rather than estimated.
- **Three of these indexes are correctness, not speed** (see `scripts/ensure-indexes.js`): without
  `unique` on `trafficvisitordays`, every view reports a new person and People silently equals
  Visits; without `unique` on `trafficdailies`, concurrent beacons create duplicate rows that both
  get summed; without the TTL on `trafficevents`, the raw tier never stops growing.
- **The referrer comes from the beacon's `document.referrer`, never from `req.headers.referer`.**
  That header describes the beacon's own fetch, which a page makes about itself, so it recorded
  every visit as arriving from the site it was already on — every `referrerHost` written before
  2026-08-13 is that, and answers nothing. Only the entry view carries one (`document.referrer`
  does not change across client-side navigation, so sending it every time would credit one link
  for the whole visit), and it lands on a permanent `type: 'referrer'` counter keyed by host, so
  "who sends us traffic" outlives the raw tier like every other number.
- Query strings are stripped before storage — `?k=` on a Chorus curate link is a credential — and
  an outbound click is recorded as scheme + host only. The referrer keeps its host and nothing
  else, so a search term cannot arrive with it.
- `node scripts/seed-traffic.js` writes 30 days of demo rollup rows (`--clear` removes them). It
  refuses production by database name and by `NODE_ENV`.

**`scripts/ensure-indexes.js` specs now take an `options` object** (`unique`, `expireAfterSeconds`).
A shape-matched index whose options differ is reported as `DRIFT` with the drop command — Mongo
cannot change those in place.

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

## A pattern is a skeleton, not a game

An **Algorithm** ("pattern" in the UI) points at a Sequence that holds map
*setups* — the questions, the axes, the frame — and nothing that was played.
Running one copies that skeleton into fresh maps the session owns.

- **Template maps are `isDraft: true`.** That flag already means "outside the
  live game": drafts are excluded from `GET /activities`, from frame
  `usageCount`, from topic rollups, and from the activity expiry sweep. A
  template needs every one of those exclusions, so it reuses the flag rather
  than adding a second one. The template's Sequence is `status: 'draft'`,
  which also keeps it out of `GET /sequences/public`.
- **A template carries no entries and no participants.** Entries live in their
  own collection keyed by `activityId`, so a copy is empty by construction as
  long as the copy is a *new activity*.
- **`utils/sequences.js` is the only implementation of that copy.** Both
  callers use it: running or forking a pattern (`routes/algorithms.js`
  `cloneSequence`) and duplicating a sequence in the builder
  (`POST /sequences/:id/duplicate`). They used to each have their own, and they
  disagreed: the duplicate endpoint cloned the Activity documents while the
  pattern path reused the same `activityId`s. That made every session of a
  pattern share one set of maps with the pattern and with each other — the
  first run filled the skeleton in, and the second arrived to someone else's
  entries. `live: true` (a session) produces playable maps; `live: false` (a
  fork, a builder copy) produces more templates.

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
