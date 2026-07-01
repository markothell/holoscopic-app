# Architecture

## System Overview

Holoscopic is a real-time collective sensemaking platform. Participants join an "activity" — a 2D map with named axes — and place a dot representing their perspective, add a comment, and vote on others' comments. Results are shown live as a scatter plot with associated commentary.

The system has three user-facing surfaces:
- **Game frontend** (Next.js, port 3000): where end users play
- **Platform admin** (Next.js, port 3002): where operators create and manage "instances"
- **Backend** (Express + Socket.IO, port 3001): serves REST API and WebSocket connections for both

## Multi-Tenancy Model

The backend is a single process that serves multiple deployments. Every request is mapped to an `Instance` document via the `resolveInstance` middleware. The resolution checks (in order): an explicit `x-instance-id` header, the request `Origin`/`Referer` matched against `Instance.domains[]`, and finally the auto-created default instance.

The `Instance` document carries all per-deployment config: Holon economy parameters (costs and rewards), quorum thresholds, allowed domains, access mode (public vs invite), and optional start/end dates. There is no separate config file per deployment.

**Not all data is instance-scoped.** `Activity` and `Sequence` documents are global. `Topic`, `Algorithm`, `AlgorithmProposal`, `HolonTransaction`, and `InstanceMembership` are instance-scoped and must always be queried with `instanceId`.

## The Activity Model

`Activity` is the central document. It embeds all participant data, ratings (positions), comments, and email sign-ups as arrays within a single document. This is intentional for real-time access — the full activity state is loaded and broadcast in one round-trip.

Each participant has one record in `participants[]`. Each rating (position) is stored in `ratings[]` keyed by `userId + slotNumber + questionId`. Each comment is in `comments[]` with the same keying. Votes on comments are further embedded inside each comment document.

`maxEntries` controls the participation mode:
- `1/2/4` → standard multi-participant, each user gets that many named slots
- `0` → solo tracker mode: only the creator can add entries, unlimited slots

`activityType` selects the UI flow: `dissolve` (continuous sliders), `resolve` (4-quadrant), or `snapshot` (multi-question quadrant grid). Legacy type names `holoscopic` and `findthecenter` exist in older DB records and are normalized by the frontend package.

## The Sequence Model

A `Sequence` is an ordered collection of activities run as a cohort. It has a `members[]` list (enrolled users), optional `invitedEmails[]` for access control, and an `activities[]` list with per-activity metadata (order, open/close timestamps, round number, parentActivityIds for DAG layout, autoClose duration).

Sequences have a lifecycle: `draft` → `active` → `completed`. Within a sequence, individual activities can be opened and closed independently. Hidden rounds allow the facilitator to keep future activities invisible to participants until revealed.

## Real-Time Architecture

The backend runs Socket.IO on the same HTTP server as Express. Clients connect and `join_activity` to subscribe to a Socket.IO room identified by the activity's custom `id`. The backend maintains two in-memory maps — `connections` (socket→{userId, activityIds}) and `activities` (activityId→Set of userIds) — for fast presence tracking.

Ratings and comments can be submitted via either WebSocket events or REST API calls. Both paths persist to MongoDB and broadcast via `io.to(activityId).emit(...)` to all room subscribers. The REST path does the same broadcast, so clients don't need to use WebSocket to get live updates — they just need to be in the Socket.IO room.

The connection limit (default 25, configurable via `MAX_CONNECTIONS`) is enforced at Socket.IO connection time. Above 80% capacity, a warning is emitted. At 100%, new connections are rejected.

## The Holon Economy

Holons are an in-game currency tracked per user per instance in `InstanceMembership.holonBalance`. All Holon movements go through `utils/holons.js`:
- `transact()` — atomic balance update + creates a `HolonTransaction` audit record
- `spend()` — validates balance, then calls `transact()` with negative amount

Costs and rewards are defined in `instance.config.holons`. Key operations that cost Holons: nominating a topic (`nominationCost`), supporting a topic (`supportCost`), publishing an algorithm (`algorithmPublishCost`). Key rewards: topic reaching quorum (`topicQuorumReward`), hosting a session (`sessionHostReward`), participating (`sessionParticipantReward`).

## The Three-Tier Governance Loop

The game has a progression from individual activities to collective governance:

1. **Topics** (`/api/topics`): Community members nominate discussion topics by spending Holons. Other members support nominations (also spending Holons). When a nomination reaches `quorum.topicSupportThreshold` supporters within `topicWindowHours`, it becomes "confirmed" and the nominator earns a reward. The nominator then links a Sequence (the "Inquiry") to the topic.

2. **Inquiry** (`/api/topics/inquiry`): Confirmed topics with a linked sequence become Inquiry sessions. The nominator and all supporters are auto-enrolled. This is where the actual mapping activities happen.

3. **Algorithms** (`/api/algorithms`): Published patterns derived from session outcomes. Can be forked (with royalty decay tracking up to `forkDepthCap` levels). Running an algorithm requires a `Proposal` — participants sign up until quorum is reached, which clones the algorithm's sequence and starts the session.

## Frame Nominations

A secondary workflow for highlighting notable entries: a facilitator nominates specific participant entries (from one activity) to appear as pre-placed items in a result activity. This is tracked via `FrameNomination` documents linking source activity + user slot → result activity. Selection methods: `manual`, `top_voted`, or `top_voted_per_quadrant`.

## Data Flow for a Typical Session

1. Facilitator creates a `Sequence` (draft), adds `Activity` documents to it, sets access control.
2. Facilitator starts the sequence (`status → active`), opens the first activity.
3. Participants join via sequence URL → enroll as `Sequence.members`.
4. Participant joins an activity page → WebSocket `join_activity` → added to `activity.participants[]`.
5. Participant places dot → WebSocket `submit_rating` (or REST `POST /api/activities/:id/rating`) → `activity.ratings[]` updated, `rating_added` broadcast to room.
6. Participant writes comment → same dual path → `comment_added` broadcast.
7. Participants vote on comments → REST only → `comment_voted` broadcast.
8. Facilitator closes activity, opens next one.
9. After all activities complete, facilitator completes the sequence.
