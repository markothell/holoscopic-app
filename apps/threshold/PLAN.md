# Threshold — Master Plan (draft v0.1)

**Status:** the backend is built and green (M0–M3a); the frontend is a scaffold. §6.2, §6.3 and
§9.2 are the three surfaces still to design — see `DESIGN-QUESTIONS.md`.
**Local dev port:** 4006. **Ships to:** `threshold.holoscopic.io` (add to backend `CLIENT_URL` at cutover).
**Backend surface:** `apps/backend/routes/threshold.js` + `utils/threshold.js`, on the generic
**Circle** layer (§3) that Threshold is the first consumer of.

This file is the source of truth for the design. Sections are numbered so code comments and
commits can cite them. Settled decisions are D1–D20 in §12; open questions in §13.

---

## 1. The product in one screen

A group finds out **where its dividing line is**.

You give the group a **topic** and a **polarity** — *Authority: Liberating / Constricting*. Everyone
records a short voice note (or types) about a time authority was one of those things, picking a
side as they submit. When everyone has shared, the group listens, then **sorts every story into
one of two buckets** — this one is on the liberating side, this one is constricting. You sort as
you listen and rearrange as much as you like; one final submit ends it.

The reveal is the point. Every story carries the fraction of the group that put it on each side, so
the set lays out as a spectrum: the stories everybody read the same way sit at the two ends, and
the ones the group **split on** sit in the middle. That middle is the **threshold** — the group's
actual dividing line, made of the specific stories that fell across it.

Two ways to run it:

- **Single** — one person posts a topic + polarity, takes signups, the group runs one cycle. This
  is how *On a Spectrum* works today.
- **Sharing Circle** — every member of a cohort seeds their own topic, and the circle runs one
  cycle per topic in turn. The final screen plots all of them together.

**These are the same code path.** A single Threshold is a Circle with exactly one seed, authored by
the creator (**D1**). There is no second implementation.

### What makes it work (constraints, not features)

- **Async by construction.** Nobody is in a room. Rounds advance when everybody's done *or* the
  clock runs out, and the transition emails the people who now have something to do (§7).
- **A minute is the unit.** The note length is set at creation (default 60s). Short enough that
  recording is not a performance; long enough for one real story.
- **You must take a side.** The ranking space has no neutral bucket (§6.2). The threshold is
  discovered from *disagreement between rankers*, never declared by one of them.
- **Anonymous while ranking, attributed after** (**D9**). You rank the story, not the person.

---

## 2. Core objects

| Object | What it is |
|---|---|
| **Circle** | A cohort + a round machine. Generic — knows nothing about polarities or audio. §3 |
| **Seed** | One member's contribution to the circle: for Threshold, a topic + polarity + note length. Lives inside the Circle document as an opaque `payload`. §3.2 |
| **Cycle** | One seed's run: `share → rank → reveal`. One pass, no second round (**D2**). |
| **Share** | One person's story about one seed — audio and/or text, plus the pole they chose. §5.1 |
| **Ranking** | One person's *whole bucket assignment* for one seed. One document, not one per story. §5.2 |
| **Threshold** | The computed output of a cycle: every share's `agreement`, laid out as a spectrum. §6.1 |

---

## 3. The Circle layer

New, generic, platform-level. Lives in the backend beside the other funnels:
`models/Circle.js` + `utils/circles.js` + `utils/circleActivities.js` (the registry).

It is documented here because Threshold is building it and Threshold is its only consumer. When
consumer #2 arrives, this section moves to `apps/backend/CLAUDE.md` and the root directory map.

**Why not `Sequence`.** `Sequence` looks like the home for this and is not:

- It is the live interView facilitator tool — 50 files in `apps/holoscopic-game/src` reference it
  (`/create/sequences`, `/sequence/[urlName]/manage`, `SequencePanel`, `dagLayout.ts`).
- It is **global, not instance-scoped** (root `CLAUDE.md` says so explicitly, alongside `User`).
  A circle needs `instanceId`.
- Its semantics are inverted. `Sequence.activities[]` requires an `activityId` ref up front — a
  facilitator authors a DAG of *distinct* activities before anyone joins. A circle's nodes don't
  exist until members seed them at runtime, and every node is the same shape.
- It has **no completion trigger**. `openActivity` / `openNextActivity` / `autoClose`+`duration`
  are manual or clock, never "everyone is done" — which is the whole mechanic here.

`Sequence` is untouched by this work (**D3**).

### 3.1 What Circle owns

Membership and invitation, the seed list, the phase machine, deadline bookkeeping, notification
dispatch, and the completion predicate's *scheduling* — never its *content*.

### 3.2 `Circle` model

```js
Circle {
  id, instanceId,                  // instance-scoped, unlike Sequence
  activity: 'threshold',           // key into the registry (§3.4)
  title, urlName,                  // urlName unique per instance
  createdBy,

  mode: 'single' | 'circle',       // 'single' caps seeds at 1 (D1)
  status: 'draft' | 'open' | 'running' | 'complete',

  // Circle-level phase. 'seeding' is skipped in single mode — the creator's
  // seed is written at creation.
  phase: 'draft' | 'seeding' | 'cycle' | 'complete',
  phaseDeadline: Date,             // seeding deadline; cycle deadlines live on the seed

  config: {
    // Any phase's hours may be null = no clock for that phase (D16).
    seedHours:  Number,
    shareHours: Number,
    rankHours:  Number,
    // Advance as soon as every member is done, without waiting out the clock.
    advanceOnComplete: Boolean,    // default true
    // Payload defaults the seed form starts from — activity-specific, opaque.
    seedDefaults: Mixed,
  },

  members: [{ userId, username, email, joinedAt }],
  invitedEmails: [String],
  requireInvitation: Boolean,

  seeds: [{
    id, authorId, order,
    payload: Mixed,                // OPAQUE to the circle — validated by the module
    phase: 'pending' | 'share' | 'rank' | 'revealed',
    openedAt, phaseDeadline, revealedAt,
  }],
  cycleIndex: Number,              // index into seeds[]; which cycle is live

  startedAt, completedAt,
}
```

`seeds[].payload` being `Mixed` is the seam. The circle never reads inside it.

### 3.3 The round machine

**Three ways a phase ends, and all three are always live** (**D16**):

| Trigger | Condition |
|---|---|
| **Complete** | every member is done, and `config.advanceOnComplete` |
| **Deadline** | `seed.phaseDeadline` has passed — omitted per phase, for no clock at all |
| **Manual** | the author says so, at any moment, from any state |

Whichever fires first. "Every member is done" is not knowable by the circle — it calls
`isMemberDone` on the registered module, once per member, and advances when all return true.

**Manual advance is not a fallback for a stuck circle, it is a first-class control.** A facilitator
watching eleven of twelve people finish on a Friday should be able to move the group on without
waiting out a deadline set two weeks ago, and a circle configured with no clocks at all
(`shareHours: null`) is a purely hand-driven one. On a Spectrum has the same escape hatch
(`roundMode: 'manual'` plus `POST /games/:code/advance`); this generalizes it rather than inventing it.

**Who may advance:** the circle's creator, always and for any phase. Plus **the seed's own author,
for the phases of their own cycle** — in a Sharing Circle that person is the author of the activity
being run, which is what makes the control theirs to hold. Both are recorded on the transition
(`advancedBy`) so a cycle that ended early is explainable afterward.

```
draft ──start──▶ seeding ──all seeded | deadline──▶ cycle[0].share
                                                        │
                    ┌───────────────────────────────────┘
                    ▼
              share ──all shared | deadline──▶ rank ──all ranked | deadline──▶ revealed
                    │                                                              │
                    └────────────────── next seed, if any ◀────────────────────────┘
                                                │
                                          none left ──▶ complete
```

**A seeding round that nobody completes still advances.** A member who misses the seeding deadline
simply has no topic in the circle; a cycle whose share round nobody entered is revealed empty and
skipped. The machine never blocks on a person (**D4**).

### 3.4 The activity module interface

`utils/circleActivities.js` — a `register(key, module)` table, mirroring how
`packages/activities`' `REGISTRY` maps an activity type to its components, but server-side.

```js
register('threshold', {
  // Validate + normalize a seed payload. Throws to reject.
  normalizeSeed(payload, { circle, userId }) -> payload,

  // The ordered per-cycle phases. 'revealed' is terminal and implicit.
  phases: ['share', 'rank'],

  // THE completion predicate. Drives every advance.
  isMemberDone({ circle, seed, phase, userId }) -> Promise<boolean>,

  // The activity's own writes at each boundary.
  onPhaseOpen({ circle, seed, phase }),
  onPhaseClose({ circle, seed, phase }),
  onCycleReveal({ circle, seed }),       // compute + store the threshold (§6.1)
  onCircleComplete({ circle }),          // cross-seed rollup (§6.3)

  // Subject + body for the transition email, per recipient.
  notificationFor({ circle, seed, phase, userId }) -> { subject, text } | null,
});
```

Seven hooks, one of which (`isMemberDone`) does the real work. That is small enough to be honest
with a single consumer — nothing here is speculation about a second one.

### 3.5 The ticker — this is not sweep-on-read

On a Spectrum advances on in-memory timers with **sweep-on-read** as the durable fallback, and its
`CLAUDE.md` notes the consequence: *a game nobody reads doesn't advance until the next snapshot
request*. That is tolerable for a synchronous room where somebody always has the page open.

**It is fatal here.** Threshold's entire premise is that nobody has the page open — the transition
is what generates the email that brings people back. A circle whose share round closes only when
someone loads it will sit dead forever (**D5**).

So: a periodic tick in the web process, guarded by `utils/jobs.js#withLock`.

```js
setInterval(() => withLock('circles:tick', 4 * 60_000, sweepCircles), 60_000);
```

`withLock` is already built for exactly this — one atomic `findOneAndUpdate` on a lease, and it
deliberately refuses re-entry by the same process, so a sweep running longer than its interval
cannot overlap itself. Render runs one web instance today; the lease is what makes a second one
safe later.

`sweepCircles()` queries `{ status: 'running' }` and evaluates each live phase. Sweep-on-read stays
as a belt-and-braces path on `GET /circles/:urlName`, same as OaS.

### 3.6 Mail is a side effect of a transition that already committed

`utils/email.js#sendEmail` is the only place mail leaves this platform, it never throws, and a send
is always a side effect of something that already succeeded. That contract holds here: the phase
advance is saved first, then mail goes out per recipient, and a failed send is logged and dropped.
A `Notification` document is written too (`utils/notify.js`), so the in-app surface is correct even
when mail is unconfigured.

**Threshold is the first thing in this repo that sends scheduled mail to non-operators.** Password
reset is the only user mail today, and it is request-triggered. That makes three things new work,
not free:

- **Dedupe.** A transition must email a given member once. The lock in §3.5 prevents a double tick;
  a `notifiedAt` stamp on the seed phase prevents a retry after a partial failure re-sending to
  everyone.
- **Unsubscribe.** A per-member `emailOptOut` on the circle, and a link that sets it without a
  login. Open question — §13, Q3.
- **Volume.** A 12-person circle with 12 seeds is 12 × 3 × 12 ≈ 430 messages. That is fine for
  Resend and not fine for a member's inbox. `notificationFor` returning `null` for someone with
  nothing to do is the main lever (don't mail the people who already finished).

---

## 4. Identity

**Accounts, yes** (**D6**). Threshold needs identity that persists across rounds and an email
address to notify — Chorus's anonymous-contributor model cannot express either.

Same stack as spectrum and holoscopic-game: holoscopic accounts via NextAuth credentials, mutations
carrying a short-lived HS256 game token from `/api/auth/game-token`, verified by the backend's
`enforceVerifiedUser`. `routes/threshold.js` mounts **with** the guard — Chorus's bare mount is a
Chorus decision, not a pattern.

**No holon economy** (**D7**). The instance runs `config.mode: 'explore'`, like Chorus. Nothing in
Threshold is scarce: everybody shares, everybody ranks, and there is nothing to stake on. No
`transact`, no `spend`, no `InstanceMembership` balance.

**One parent instance holds every circle** (**D20**). The tenant here is the `Circle`, addressed at
`/t/<urlName>`, not the `Instance` — `NEXT_PUBLIC_INSTANCE_ID` names the parent, exactly as
spectrum's does, and one deployment serves unlimited circles.

The other two shapes in this repo are both answers to a question Threshold does not ask. Chorus
makes a memorial an `Instance` because a memorial is created *in the admin* and carries per-memorial
config an `Instance` is built to hold — curator key, seed vocabulary, subject photo. On a Spectrum
gives each room a child `Instance` because each room runs *its own token economy*, with balances on
`InstanceMembership`. Threshold circles are created in the app by facilitators, and there is no
economy at all (D7); a circle's whole configuration — phase clocks, `advanceOnComplete`, members,
invited emails — already lives on the `Circle` document. A child instance per circle would be an
empty shell, and each one is another row that can win `Instance.getDefault()`.

The consequence to hold onto: **the instance is not an access boundary here, membership is.** Every
circle in a deployment shares one instance, so `assertMember` is the only thing standing between two
circles (§8.1). A deployment serving more than one *parent* would need Chorus's answer — the tenant
in the path — and nothing today needs that.

`Instance.app` gains `'threshold'` (`models/Instance.js:150`), plus the `POST /api/instances` create
path and the platform admin's app picker. Note the standing rule: **`gameNumber` belongs to
`interview` alone** — a Threshold instance must leave it null, or it can win `Instance.getDefault()`
and start answering unrelated traffic.

---

## 5. Data model

Shares and rankings get **their own models**, not `Entry` (**D8**).

This is a departure from "the `Entry` collection is the source of truth for all participation
content," so the reasoning is on the record:

- **`Entry.position` is `{x, y}`, both required, both 0–1.** Threshold has no 2D position at all.
- **A ranking is a whole list, not a per-item fact.** Its natural key is `(seedId, rankerId)`,
  which does not fit Entry's `(activityId, userId, slotNumber, questionId)` upsert key. Modelling
  it per-item means N documents that are only ever written and read as a set, and a partial write
  is a corrupt ranking.
- **A share carries audio, a transcript, and a pole choice.** Entry has none of those, and adding
  them makes Entry a union type serving two products with no overlap.

Chorus set this precedent: `Memory` exists because a memory is not a map entry. The same is true
here. `Entry` stays untouched.

All writes go through **`utils/threshold.js`**, the single funnel — same contract as
`utils/memories.js` and `utils/entries.js`. Never write these collections anywhere else.

### 5.1 New: `ThresholdShare`

```js
ThresholdShare {
  id, instanceId,
  circleId, seedId,               // denormalized ancestry, both indexed
  userId, username,

  pole: 'A' | 'B',                // which side of the polarity this story is about
  slot: 1 | 2,                    // a member may share one per pole (D10)

  title:  String,                 // short label — what the ranking UI shows
  text:   String,                 // typed story, or empty if spoken

  audio: {                        // shape mirrors Memory.body.audio
    url, contentType, durationMs, peaks: [Number], sizeBytes,
  },
  transcript: {
    status: 'skipped'|'pending'|'done'|'failed',
    text: String,
  },

  createdAt, updatedAt,
}
```

Unique index on `{ seedId, userId, slot }` — resubmitting a slot upserts, same rule as entries.
Index `{ seedId, createdAt }` for the ranking payload.

**A member may share on one pole or both, never twice on the same pole** (**D10**). "One or two
notes" from the brief resolves cleanly this way, and it makes `slot` derivable from `pole` rather
than a second free dimension.

### 5.2 New: `ThresholdRanking`

```js
ThresholdRanking {
  id, instanceId,
  circleId, seedId,
  rankerId,

  placements: [{                  // EVERY share in the seed, exactly once
    shareId,
    pole: 'A' | 'B',              // no neutral bucket — you must choose (D11)
  }],

  submittedAt: Date,              // null while a draft
}
```

Unique index on `{ seedId, rankerId }`. One document. `isMemberDone` for the rank phase is a single
`findOne` on that key with `submittedAt` set.

**Placement is a bucket, not a rank — there is no within-bucket ordering** (**D11**). Ordering was
in the first draft and it conflicted with the display: sorting the reveal by agreement (§6.1) and
sorting it by mean per-ranker order are two different axes fighting for the same list, and
agreement is the one that answers the question the activity asks. Dropping order leaves exactly one
ordering axis, and it makes the task tractable on a phone for ~24 stories.

**Draft first, submit once.** Placements save as you go — you sort while you listen — and
`submittedAt` stays null until an explicit final submit. Nothing counts toward advancement, and
nothing is visible to the aggregate, before that. Rearranging freely right up to submit is the
point; a ranking is a judgment about the whole set, so it can't be formed one story at a time.

**A ranking must be complete to submit** — every share placed. A partial ranking would make the
agreement fraction in §6.1 depend on who bothered, which silently biases the result.

**Do you rank your own story?** Yes — it is in the list and you place it like any other, because
excluding it makes each ranker's denominator different. Its own author's placement is included in
the aggregate; with N ≥ 4 the effect is noise, and the alternative (a hole in every ranking) is
worse. Revisit if small circles feel it (§13, Q2).

### 5.3 The computed threshold

Stored on the seed at reveal, so the display never recomputes:

```js
seed.result = {
  computedAt: Date,
  rankers: Number,                // how many complete rankings fed this
  shares: [{                      // sorted by agreement, descending
    shareId,
    agreement: Number,            // 0.0 … 1.0 — fraction who placed it on pole A
    coherence: Number,            // |2·agreement − 1| — 1 = unanimous, 0 = dead split
    splits: { a: Number, b: Number },
  }],
  unanimous: Number,              // how many at coherence === 1
  meanCoherence: Number,          // the circle-final graph's per-topic value
}
```

**No band classification is stored** (**D15**). See §6.1.

---

## 6. The mechanics

### 6.1 Computing the threshold — a gradient, not a cut

For each share, across the `R` complete rankings:

```
agreement = (# rankers who placed it on pole A) / R      →  0.0 … 1.0
coherence = |2 · agreement − 1|                          →  0.0 … 1.0
```

`agreement` is a **position**: 1.0 is unanimously pole A, 0.0 unanimously pole B, 0.5 a dead split.
Sorting the shares by it lays the whole set out as one spectrum running pole B → contested middle →
pole A. `coherence` is the same fact as a **magnitude**: 1.0 = everybody agreed, 0.0 = the group
split down the middle.

**The threshold is where coherence bottoms out, and it is read off the gradient rather than
declared** (**D15**). The first draft cut the shares into three stored bands at a cutoff `c`, and
that was wrong in two ways: it throws away the difference between 12/12 and 9/12 — which is exactly
the thing worth seeing — and it bakes a tuning parameter into stored data, so changing your mind
about `c` means recomputing every past cycle.

So: **`agreement` is stored, no classification is.** Any banding is a *view* parameter applied at
render time. Playing with where the line sits costs a re-render, never a migration, and "show me the
ones that were 100%" is a filter on data that's already there.

A cutoff still has to exist somewhere for the circle-final graph to say anything crisp across
topics, and `meanCoherence` per topic may be enough on its own. That's Q1 — now a display question,
not a schema one.

Edge cases the funnel must handle: `R = 0` (nobody ranked → reveal empty, `meanCoherence: null`);
`R = 1` (every share reads as unanimous by construction — show the placement, suppress the
coherence framing entirely, since one person cannot disagree with themselves).

### 6.2 The ranking space — **deferred to a design conversation**

The mechanic is settled (D11: two buckets, no neutral, no ordering, draft-then-submit);
**the interaction is not designed and is not designed here.**

What is fixed going in, as constraints on that conversation:

- Two buckets, no neutral option, no "skip." An unplaced share blocks submit (§5.2).
- **Sort while listening.** Placing a story is something you do mid-playback, not a form you fill
  in afterward from memory.
- **Rearranging is free until submit**, and submit is a deliberate, separate act. Nothing counts
  until then, so the surface must make "not yet finished" legible — its own state, not a disabled button.
- Every share must be listenable *from inside* that surface — the whole task is comparison.
- It has to work on a phone with one thumb, for up to ~24 shares (12 people × 2 poles).
- The pole labels are the seed's own words, not "A" and "B".

### 6.3 The threshold display — **deferred to a design conversation**

Two screens, both new mechanics, both worth designing properly rather than specified inline:

- **Per-cycle**: the shares laid out along `agreement`, poles at the ends and the split in the
  middle, each story a card you can play. The unanimous ends and the contested middle both have to
  read at a glance — the middle is the subject of the screen, not a leftover bucket, and the 12/12
  stories at the ends are what make it mean something.
- **Circle-final**: all N topics together, so you can see which topics the group is coherent on and
  which one splits it. This is the payoff screen for Sharing Circle mode and the reason the whole
  layer exists. See Q1 — whether a topic reduces to one number or keeps its gradient is the open
  part.

Nothing else in this plan depends on how these look. Build §3–§5 first.

---

## 7. Audio

The recorder is **extracted, not copied a fifth time** (**D12**).

New `packages/audio` workspace. **The boundary is the browser, not the UI** (**D18**) — reading the
Chorus components settled a question this section originally got wrong.

| Into `@hs/audio` | |
|---|---|
| `recorder.ts` | mime detection, base mime, peak resampling, the IndexedDB stash (`createStash`) |
| `useRecorder.ts` | **headless** — MediaRecorder lifecycle, AudioContext analyser, timed duration, teardown, the stash write |
| `PlayerProvider.tsx` | the single `Audio` element for a whole app. Renders no markup, only context |

| Stays in each app | |
|---|---|
| `Recorder.tsx` | the recorder's *look and words*, driving `useRecorder` |
| `AudioPill.tsx` | the player chrome, driving `usePlayer` |

The first draft moved `Recorder.tsx` and `AudioPill.tsx` into the package too. They turn out to be
mostly Chorus's theme tokens — `bg-dial`, `bg-card-raised`, `text-ink-soft` — and copy written for
someone recording their grandmother. Sharing them would either force Chorus's radio-dial amber onto
Threshold, contradicting "its own hand-styled system" (§9.2), or need a theming layer costing more
than it saves. So a failure crosses the boundary as a **code** (`denied` | `failed` | `empty`) and
each app writes its own sentence.

**The stash database name is a parameter, not a constant.** Chorus passes `'chorus'` and therefore
still finds recordings stashed before the extraction — renaming it would orphan exactly the
recordings the stash exists to rescue, which is the one way this refactor could have cost somebody
a voice.

The argument for extracting rather than copying is Chorus's own gotcha list — every entry is a bug
already paid for, and each one would be rediscovered:

- **Upload the BASE content type, no `codecs` parameter.** Vercel Blob matches `allowedContentTypes`
  by exact string; Chrome writes `audio/webm;codecs=opus` closed up and Safari writes a space. The
  first live iPhone recording died on that space.
- **Feature-detect the mime type.** Chrome/Android/Firefox give WebM/Opus; Safari and all iOS give
  MP4/AAC. Hardcoding webm builds a `MediaRecorder` fine and emits an unplayable blob.
- **Never read duration off the file.** iOS MP4 has no duration metadata → `Infinity` in every
  player and an un-scrubbable track. The client times the recording; that number is what the player
  measures against.
- **The stash is only worth writing if something reads it.** A recording that failed to upload is
  handed back when the compose surface next opens.

Chorus adopts the package in the same change, so there is one copy from the start rather than a
fork to reconcile later. This is the one item here that touches another agent's app — coordinate
before starting (§9, M2).

Threshold adds on top: a **hard cap at the seed's `secondsPerNote`** (auto-stop, visible countdown),
which Chorus has no equivalent of.

**Storage.** Client-upload to Vercel Blob under `threshold/<circleId>/<seedId>/*`, with the app
owning one server route to mint the token (`/api/audio/upload`), exactly as Chorus does. Backend
allowlist is the existing suffix match (`BLOB_HOST_SUFFIX`) — no backend change needed for a new
store.

**Mirroring is not optional and not a later milestone** (**D13**). Vercel Blob has no snapshots, no
versioning and no undelete — a deleted object is simply gone, and a share is a recording of
something somebody said once. That property alone is the reason, and it needs no incident to
justify it. So `utils/blobMirror.js` fires on every share write from day one, and
`scripts/backup-blobs.js` grows a Threshold pass alongside its memorial pass. The database is the
source of truth for what should exist; an unreferenced object is an abandoned draft.

**Transcription.** `utils/transcribe.js` is the shared core (**D19**) — extracted from
`memorialTranscribe.js`, which is now a thin adapter beside `thresholdTranscribe.js`. The reason to
generalize rather than write a sibling, as `blobMirror` did: there, the generic core already existed
and the wrapper was seven lines. Here only six of ~178 lines were app-specific, so a sibling would
have duplicated the callback-URL derivation, the timeout handling **and the HMAC forgery guard**.
Two copies of a security control are two copies that drift. A transcript is what makes a share readable, searchable, and rankable by someone
who cannot play audio — but it is **optional by design**, exactly as in Chorus: audio records,
plays, and ranks without it, and `/health` reports `transcription` without gating.

---

## 8. Backend surface

`apps/backend/routes/threshold.js`, mounted in `loadAPIRoutes()` at `/api/threshold`, behind
`enforceVerifiedUser`. Plain-object envelopes (`{ circle }`, `{ shares }`, `{ ranking }`), `{ error }`
with a meaningful status.

| Method | Path | Notes |
|---|---|---|
| `POST` | `/circles` | create; `mode` decides whether a seed is required inline |
| `GET` | `/circles/:urlName` | the snapshot — circle, live seed, my state. Sweeps on read |
| `POST` | `/circles/:id/join` | membership + invitation check |
| `POST` | `/circles/:id/start` | draft → seeding (or straight to cycle 0 in single mode) |
| `POST` | `/circles/:id/advance` | manual phase advance; creator, or seed author for their own cycle (§3.3) |
| `POST` | `/circles/:id/seeds` | one per member; rejected outside the seeding phase |
| `POST` | `/seeds/:id/shares` | upsert by `(seedId, userId, slot)` |
| `DELETE` | `/seeds/:id/shares/:slot` | while the share phase is open |
| `GET` | `/seeds/:id/shares` | **redacted during rank, attributed after reveal** (§8.1) |
| `POST` | `/seeds/:id/ranking` | the whole placement array, atomic, must be complete |
| `GET` | `/seeds/:id/result` | the computed bands; 404 before reveal |
| `GET` | `/circles/:id/result` | cross-seed rollup; 404 before complete |

Generic circle operations (join, start, advance, member list) live in `utils/circles.js` and are
exposed through this router rather than a parallel `/api/circles` one — until consumer #2 exists,
a second public surface is speculation.

**Realtime is not in v1.** Nothing here is synchronous; the snapshot re-fetched on focus is enough.
No socket rooms, no `entry_upserted` analogue.

### 8.1 Redaction is server-side, always

Three visibilities, one per phase (**D17**):

| Seed phase | `GET /seeds/:id/shares` returns |
|---|---|
| `share` | **your own stories only** — reading the others before telling yours anchors the group on whoever posted first |
| `rank` | every story, with **no `userId` and no `username`** on any but your own |
| `revealed` | every story, attributed |

This is the platform's existing rule (`entries.toRedacted`) and it is not negotiable: *do NOT
return another user's identity — redaction happens in the API layer, never client-side.* Shipping
attribution to the browser and hiding it in CSS is the failure mode this rule exists to prevent.

**Underneath all three, membership decides who reads anything at all.** `listShares` asserts it on
the way in, and so do the two result routes. A `urlName` is chosen by a facilitator and travels in
links — it is a name, not a secret — and every circle in a deployment shares one instance (D20), so
this check is the whole boundary between two circles. The circle *shell* — title, phase, member
count — stays readable to anyone signed in, because somebody following an invitation has to see
what they are being asked to join.

**Say the honest thing in the UI, though.** In a small circle a voice recording identifies its
speaker regardless of what the payload says. The compose surface should tell people that before
they record, not imply an anonymity the medium cannot provide.

---

## 9. Frontend (`apps/threshold`, port 4006)

Next.js 16 + React 19 + Tailwind v4 (`@theme inline` in `globals.css`, no config file) — the house
pattern. **New Vercel project and a new subdomain, which is a new deploy target** (`render.yaml`
needs `CLIENT_URL` extended, and root `CLAUDE.md` says deploy targets escalate) — §13, Q4.

### 9.1 Routes

| Route | What |
|---|---|
| `/` | what Threshold is; create or join |
| `/t/<urlName>` | the circle — whatever its current phase is, this is the one page you return to |
| `/t/<urlName>/seed` | post your topic + polarity (seeding phase) |
| `/t/<urlName>/share` | record or type, pick a pole (share phase) |
| `/t/<urlName>/rank` | the ranking space (§6.2) |
| `/t/<urlName>/cycle/<seedId>` | one cycle's threshold display (§6.3) |
| `/t/<urlName>/result` | the circle-final graph (§6.3) |
| `/me` | circles I'm in, and what's waiting on me |

Every email links to `/t/<urlName>` and lets the page route to the current task — a link to a phase
that has since advanced is the most likely thing to go stale.

### 9.2 Visual language

Its own hand-styled system, like Chorus, Synthesis and On a Spectrum. Not designed yet; part of the
same conversation as §6.2 and §6.3.

Carry over one rule from the copy policy: **user-facing copy states what a thing is, never
"not a…" or "instead of…"**.

### 9.3 Beacon

`src/components/Beacon.tsx` gets **a fifth copy**, and `'threshold'` joins the server's `app`
allowlist in `utils/traffic.js`. The wire shape must match the other four exactly — the server
validates against the allowlist, so a drifted copy fails silently as a dropped event.

---

## 10. What v1 does not include

- Realtime updates (§8).
- A second pass / revise round — **D2** settles one pass. The machine loops over seeds, so adding
  a second pass later means adding a phase to `phases: []`, not restructuring.
- Public/discoverable circles. Every circle is link-or-invite.
- Holons, stakes, quorum (**D7**).
- Editing a share after the share phase closes.
- Cross-circle aggregation (a "pulse" page). OaS has one; it earned it with volume.

---

## 11. Phasing

| | Milestone | Contents | Done when |
|---|---|---|---|
| **M0** | Circle layer — **DONE** | `models/Circle.js`, `utils/circles.js`, `utils/circleActivities.js`, the ticker in `jobs/index.js`, index specs in `scripts/ensure-indexes.js`. | **28 tests pass** (`utils/circles.test.js`, no DB, injectable store). A 3-member circle runs seed → 3 cycles → complete on the completion path; the deadline path advances one phase per expiry; manual advance, D4's never-block rule, notification dedupe and opt-out, the registry's guards. Full backend suite still green (259/259). |
| **M1** | Threshold text-only — **DONE** | `models/ThresholdShare.js` (audio field present, unwritten), `models/ThresholdRanking.js`, `utils/threshold.js` (funnel + the circle activity module), `routes/threshold.js`, `Instance.app` + `APPS` + the platform admin picker, index specs. | **20 tests pass** (`utils/threshold.test.js`). A 3-person circle runs seed → share → rank → reveal across three cycles to complete; the gradient is checked against a hand-computed four-ranker expectation (1.0 / 0.75 / 0.5 / 0.0); D9 and D17 visibility are asserted on the payload, not the render. Server boots with the route mounted and both tickers running. **`scripts/check-circles.js`** adds 10 checks against a real dev database — Mixed-path persistence, the unique indexes, the tick on a genuinely expired deadline. |
| **M2** | `packages/audio` — **DONE** | Extracted from Chorus; Chorus adopted it in the same commit (`c8fc10b`). 8 package tests, Chorus typechecks and builds. | Verified on preview against the dev store: **Android** 2026-08-05 (WebM/Opus, 48 real peaks, transcribed) and **iPhone** 2026-08-06. Both branches of the format split now exercised end to end — record, upload, play back. No behaviour change in Chorus. |
| | ↳ *why the iPhone run mattered* | Safari takes the MP4/AAC branch, writes **no duration metadata**, and spells the `codecs` parameter **with a space** — the last of which killed the first live iPhone recording at the upload step while Android sailed through. A WebM recording exercises none of the three, so until 2026-08-06 the extraction was unproven exactly where recording had actually broken before. This was also the first time Chorus's iOS path was ever verified at all. | — |
| | ↳ **preview environment** — **DONE** | `preview` branch + free Render backend on the dev cluster + Vercel branch-scoped env vars. Documented in `apps/chorus/PREVIEW.md`. | Both pipelines deploy on push to `preview`; a browser-shaped probe (with `Origin`) confirms the write path, and the blob probe confirms the dev store. |
| **M3a** | Threshold audio — **durability DONE** | `ThresholdShare.audio.pathname`, `blobMirror.mirrorShare`, the fire-and-forget hook in `utils/threshold.js` (injected in `loadAPIRoutes`), and a Threshold pass in `scripts/backup-blobs.js`. | 284 backend tests pass, including that a recorded share is mirrored, that a **failing** mirror cannot reject the story, and that a typed share never calls it. The nightly sweep counts shares (`0 threshold shares` on dev today). |
| **M3b** | Threshold audio — the app half | The recorder UI with the hard cap, the blob upload route, transcription + its callback route. **Needs the frontend to exist**, so it follows M5. | A real browser recording round-trips: upload → mirror → transcript → plays back inside the ranking surface. Verified on a physical iPhone. |
| | ↳ **the scaffold** — **DONE** | `apps/threshold` on port 4006: every §9.1 route, the NextAuth stack, `services/api.ts`, `lib/types.ts` mirroring both serializers, the fifth `Beacon` copy + `'threshold'` in `utils/traffic.js#APPS`. `/t/<urlName>` fetches the snapshot and routes to the live phase. | Builds clean (12 routes), `tsc --noEmit` passes, all routes serve 200 locally, `/api/auth/game-token` 401s unauthenticated. **`globals.css` is a placeholder, not §9.2** — the four undesigned surfaces render a marker naming the section that decides them, so nothing gets built on top of a guess. |
| **M4** | Async + email | Transition mail, `Notification` rows, dedupe, opt-out, `/me`. | A circle advances and mails with every browser closed — the failure the ticker exists to prevent (§3.5). Verified by watching an inbox, not by reading `/health`. |
| **M5** | Design | §6.2 ranking space, §6.3 both displays, §9.2 visual language. | — |
| **M6** | Launch | Accessibility + performance pass, `CLIENT_URL`, Vercel project, Beacon, `ensure-indexes.js` against production. | — |
| | ↳ **indexes before the first write** | Three of the new indexes are `unique` and therefore correctness, not speed. `ensure-indexes.js` **skips a collection that does not exist yet**, and it says so — so running it once against production before Threshold takes any traffic is the whole job, and running it after means building a unique index over rows that may already violate it. Order matters here in a way it does not for the performance indexes. | `ensure-indexes.js` under `NODE_ENV=production` reports the three as created, with no SKIP lines for `circles`, `thresholdshares` or `thresholdrankings`. |

M0 and M1 are the whole architectural bet and neither needs a designer. Start there.

---

## 12. Decisions (settled)

- **D1** — A single Threshold is a Circle with one seed. One code path, never two. §1
- **D2** — One pass per cycle: `share → rank → reveal`. No revise round. §2
- **D3** — `Sequence` is not extended and not touched. Circle is a new layer. §3
- **D4** — The machine never blocks on a person. A missed seed is no topic; an empty share round
  reveals empty and moves on. §3.3
- **D5** — Advancement runs on a **locked periodic tick**, not sweep-on-read. Sweep-on-read is a
  fallback only. §3.5
- **D6** — Accounts required; `enforceVerifiedUser` on the router. §4
- **D7** — **No holon economy.** Instance runs `config.mode: 'explore'`. §4
- **D8** — Shares and rankings get their own models, not `Entry`. §5
- **D9** — Anonymous while ranking, attributed after reveal, redacted **server-side**. §8.1
- **D10** — One share per pole, so at most two per member per seed. §5.1
- **D11** — Two buckets, no neutral, **no within-bucket ordering**. Placements draft as you listen;
  one explicit final submit, complete or not at all. §5.2
- **D12** — The recorder is extracted to `packages/audio`, not copied. Chorus adopts it. §7
- **D13** — Blob mirroring ships with the first recording, not later. §7
- **D14** — No realtime in v1. §8
- **D15** — The threshold is a **gradient**. `agreement` is stored per share; band classification is
  a render-time view parameter, never stored. §6.1
- **D16** — A phase ends on complete, deadline, **or manual advance by the author** — all three
  always live, any phase's clock omittable. §3.3
- **D17** — **During the share phase you see only your own stories.** Reading everyone else's
  before telling yours anchors the group on whoever posted first. All stories appear at once when
  ranking opens. §8.1
- **D18** — `@hs/audio`'s boundary is **the browser, not the UI**. It ships a headless
  `useRecorder`, a markup-free `PlayerProvider`, and pure helpers; the recorder's look, its words,
  and the player chrome stay in each app. Failures cross as a code, never a message. §7
- **D19** — Deepgram transcription is **one shared core** (`utils/transcribe.js`) with a thin
  adapter per app, not a sibling per app. The callback token is an HMAC over the bare id and must
  never be namespaced — that would silently drop every transcript in flight across a deploy. §7
- **D20** — **One parent instance holds every circle.** The tenant is the `Circle` at
  `/t/<urlName>`; a circle is never its own `Instance`. Membership, not the instance, is the access
  boundary. §4, §8.1

---

## 13. Open questions

- **Q1 — How does the gradient read, and does the final graph still need a cutoff?** D15 makes this
  a display question rather than a schema one: `agreement` is stored continuously, so the per-cycle
  reveal can be a pure spectrum. But the circle-final graph compares N topics, and "which topics
  split this group" may need a crisper statement than N gradients side by side — either a cutoff
  applied at render, or `meanCoherence` per topic standing alone. Decide against a real circle. §6.1
- **Q2 — Does a member rank their own story?** Currently yes, for a uniform denominator. If small
  circles feel distorted by it, the alternative is excluding it and normalizing per-ranker. §5.2
- **Q3 — Email opt-out mechanics.** A no-login unsubscribe link needs a signed token; the existing
  contributor-token HMAC is the obvious basis. Also: is opt-out per circle or per account? §3.6
- **Q4 — Deploy target.** New Vercel project + `threshold.holoscopic.io` + `CLIENT_URL`. Root
  `CLAUDE.md` escalates new deploy targets, so this is a yes/no before M6. §9
- **Q5 — What happens to a circle that stalls?** A 12-seed circle at 3 days per phase is 108 days.
  Is there a way for the creator to skip a seed, shorten a phase mid-flight, or end early? Probably
  yes, and it is not designed.
- **Q6 — Does the seeding round need its own review?** Twelve topics arrive at once with no
  filtering. A duplicate or an incoherent polarity ("Authority: Good / Complicated") burns a whole
  cycle, and nothing currently catches it.
