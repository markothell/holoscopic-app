# Architectural Decisions

## 2026-05-30 — Embedded arrays in Activity document (not separate collections)

**Decision:** Store `participants`, `ratings`, `comments`, and `votes` as embedded arrays inside the `Activity` document.

**Reason:** Enables loading the full live state of an activity in a single MongoDB query, which the real-time WebSocket layer broadcasts to all participants. Avoids expensive joins for what is essentially read-mostly data during a session.

**Trade-off:** Large activities (many participants, many ratings/comments) can hit MongoDB document size limits and make concurrent writes harder. The `addRating` method uses retry logic with exponential backoff to handle `VersionError` conflicts from concurrent WebSocket + REST submissions.

---

## 2026-05-30 — Custom short `id` field on all models (not `_id`)

**Decision:** Every Mongoose document has a custom `id: String` field (8 random chars), separate from MongoDB's auto-generated `_id`.

**Reason:** Shorter, URL-safe identifiers for cleaner API paths and frontend URLs. Activities are accessed by `urlName` in the UI, but rated/referenced by `id` in the API. The `_id` is never exposed to clients.

**Trade-off:** Must always query with `findOne({ id })`, never `findById()`. Requires discipline.

---

## 2026-05-30 — Single backend process for both REST API and WebSocket

**Decision:** Express and Socket.IO run on the same HTTP server in `websocket-server.js`.

**Reason:** Simplicity. Render deploys a single Node process. Socket.IO rooms and the in-memory presence maps are accessible from route handlers directly via the `io` instance passed to activity route factories.

**Trade-off:** Vertical scaling only. If the backend needs to scale horizontally, Socket.IO would need a Redis adapter for cross-process room broadcasts.

---

## 2026-05-30 — Routes loaded lazily after MongoDB connects

**Decision:** All `app.use('/api/...')` calls live inside `loadAPIRoutes()`, which only fires when `mongoose.connection` emits a successful connection event.

**Reason:** Models like `Activity` can't be imported safely before the connection is open. Lazy loading avoids undefined-schema errors during cold starts.

**Trade-off:** If MongoDB is down at startup, all API routes return 404 until Mongo comes up and `reconnected` fires. The `/health` endpoint exposes `apiRoutesLoaded` to surface this.

---

## 2026-05-30 — Activity and Sequence are NOT instance-scoped

**Decision:** `Activity` and `Sequence` documents have no `instanceId` field and are shared globally across all instances.

**Reason:** Activities were the original core domain, predating the multi-tenancy addition. Sequences were designed as facilitator tools that can be reused across contexts.

**Trade-off:** An activity created under one deployment is technically visible from another via the API if the caller knows the `id` or `urlName`. The quorum-gated governance flow (Topics → Inquiry → Algorithms) IS instance-scoped, so the community layer is isolated even if the activity layer is not.

---

## 2026-05-30 — Quorum sweep on every GET (no background job)

**Decision:** `GET /api/topics` and `GET /api/topics/:id` call `sweepExpired()` and `sweepQuorum()` synchronously before returning.

**Reason:** Simplicity. No cron job or queue infrastructure needed. Sweep runs at most once per topic per request, and topics are relatively low-frequency.

**Trade-off:** Reads have write side effects. Under high load, these GET requests do more work than expected. If topic volume grows significantly, this should become a background job.

---

## 2026-05-30 — Dual submission path (WebSocket + REST) for ratings and comments

**Decision:** Both WebSocket events (`submit_rating`, `submit_comment`) and REST endpoints (`POST /api/activities/:id/rating`, `POST /api/activities/:id/comment`) persist data and broadcast to the Socket.IO room.

**Reason:** Resilience. Clients that lose their WebSocket connection can still submit via REST. The REST path is also used by admin and import flows.

**Trade-off:** Two code paths must be kept in sync. If validation logic changes, both must be updated. The WebSocket path skips some validation (e.g., solo tracker mode creator check, maxEntries validation) that the REST path enforces — see `websocket-server.js` vs `routes/activities.js`.

---

## 2026-05-30 — Monorepo with `@hs/activities` as source-consumed package

**Decision:** `packages/activities` has no build step. Consumers import TypeScript source directly. `"main": "./src/index.ts"`.

**Reason:** Avoids a compile step during development. Next.js transpiles TypeScript natively, and Turbo handles caching.

**Trade-off:** If a non-Next.js consumer needs this package, it would need a build. Currently only the game frontend consumes it.
