# Primitives — The Data Framework for the Activity Builder

An analysis of the four instrument apps — On a Spectrum, Synthesis, Threshold, Chorus — as
implemented (code read 2026-08-16, working tree), decomposed into the primitives they actually
use, and a proposed data framework that would let each be expressed as a **preset** inside an
activity builder. This is the design substrate for PLATFORM.md's Tier A ("an activity is a
manifest: a phase list plus primitives with configuration and copy") and for P7 (the registry),
P8 (primitive-owned storage), and P9 (the backend stays activity-agnostic).

The vocabulary comes from `docs/essay/ALanguagePrimitivesSocialDesign_draft.md` — the eight-slot
ontology: a pipeline (**Input → Aggregation → Representation**), wiring (**Temporal structure**,
**Feedback loop**), and governing conditions (**Stake/cost**, **Identity/attribution**,
**Scope/boundary**). The essay is context, not prescription; where the code needed concepts the
essay doesn't have, §3 names them and they become part of the framework.

Code is ground truth throughout. Sibling docs: `PLATFORM.md` (the plan of record),
`PLATFORM_NEXT.md` (deferred breaking changes), `apps/*/CLAUDE.md` + `PLAN.md` (per-app design).

---

## §1 The two engines, and where the builder lives

The repo contains **two generic engines**, not one:

- **The Entry/Activity engine** (interView's): `Activity` (config + participants + stakes) +
  `Entry` (the universal contribution cell, upserted on `(activityId, userId, slotNumber,
  questionId)`) + `Topic`/`FrameOfReference`/`Sequence` + quorum sweeps. Its client half is
  `@hs/activities` with a static three-slot component `REGISTRY` keyed by a closed enum
  (`dissolve | resolve | snapshot`).
- **The Circle layer** (Threshold's, and the platform's future): `models/Circle.js` +
  `utils/circles.js` (cohort + seed queue + phase machine + tick + mail) +
  `utils/circleActivities.js` (a 9-hook module seam with opaque seed payloads and one
  notification type for every phase of every activity).

The Circle layer is the right chassis for the builder — it already encodes P9 (opaque payloads,
`String` phases, config keys derived from phase names, `circle_phase` as the one mail pathway),
it has a real registration seam, and the circle is the social unit the product is built around.
The Entry engine contributes its strongest part — the `Entry` cell and its
`toClient`/`toRedacted` pair — as a *storage primitive*, not as the chassis. Both OaS and
Synthesis already use `Entry` by duck-typing an arbitrary object as the "activity"
(`oasGames.js#duckActivity`, `synNodes.js` replies), with zero schema change: the strongest
evidence in the repo that Entry is already the generic contribution record.

**Vocabulary note on tiers.** PLATFORM.md §3's letters run *downward* in cost: Tier C =
standalone app (today's model), Tier B = package in the host app, **Tier A = composition, no
code** — the manifest tier this document serves. The "clean push" destination is Tier A; this doc
uses PLATFORM.md's lettering.

---

## §2 The four apps in the eight-slot ontology

One row per slot, one column per app. Details and file references in the per-app notes below.

| Slot | **Threshold** | **Synthesis** | **On a Spectrum** | **Chorus** |
|---|---|---|---|---|
| **Input** | voice/text story on one of 2 poles (≤60s default); complete-or-nothing bucket sort; support toggle on queued topics | thought (claim ≤280 + context + voice + 0–2 axes); DAG edges (child/marry/move); stance {x,y} + prose reply; statement text; free upvotes | subtopic/map nominations; frame coining (pole pairs); 1-token stakes; ≤3 items per map; full-permutation ranking per axis; rule-revision proposal | voice/text memory + title + name; 2 tag questions from shared vocabularies (pick or coin); one-hop "add to this memory"; flags |
| **Aggregation** | per-story agreement `a/(a+b)`, coherence, sorted into the threshold; circle rollup computed on read | per-post stance grid; statement backing vs live threshold (never latched); LLM Union over the whole corpus + positional summarizer; count of borrows (stored, unread) | per-item mean + population σ over rank-normalized scores; RMS spread combine for 2D; cross-game pulse by `rootGameId` and frame `key` | tag `useCount` by delta; thread counts; filtered wall counts — count-only, no other aggregation |
| **Representation** | the reveal (3 bands + reader's cutoff), circle-home map (ring + centroid + spurs), tide line | personal map (tidy tree/DAG), feed, post + ResolveGrid, Union text with citation chips, statements board + meter | topic web (radial graph), frame glyph (line/quadrant), reveal (bars with spread-height / dots with spread-halo) | wall + memory page, the prompt sentence on ruled lines, tag portrait, filter rail |
| **Temporal** | phased cycles (`share → rank → reveal`) on a 60s server tick + sweep-on-read; per-phase hours or no clock; queue always open; one cycle live at a time | **none** — open-ended living document; every state recomputed from current data; Union generated only on demand | 6 fixed phases on in-process timers + sweep-on-read; nested per-map `gather → rank → done` mini-machine with derived deadlines | **none** — live-on-submit, no rounds, no expiry; the only clocks are a 24h edit window and cache TTLs |
| **Feedback** | strict share-then-reveal: own-only during share, anonymous during rank, aggregate only at reveal | deliberately anchored: the full reply grid and all prose are visible *before* you respond (D9); private-then-publish on the map | inputs public and attributed live; individual rankings never shown; aggregate revealed only when the cohort commits | fully open: the wall is the landing page; the vocabulary's use-counts are shown on the compose form itself |
| **Stake** | none (explore mode); the costs are behavioural — recording effort, complete-or-nothing sort | 3-slot statement budget shared between authoring and voting (D14); everything else free | 1 holon per nomination/support/join, locked and returned (confirm / complete / expire / round close) — conservative, nothing burns | none by design (D9); replaced by 4 rate-limit buckets + hard caps + reversible curation |
| **Identity** | account; three-state ladder **server-enforced in one function**: own-only → anonymous → attributed by seed phase | account + **per-idea pseudonymous handle**; never anonymous, never redacted; server-trusted attribution | account (creation email-verified, joining not); inputs attributed, rankings private, pulse identity-stripped | **no accounts**: free-text name or anonymous; unexpiring HMAC contributor token = ownership + throttle handle only |
| **Scope** | membership is the boundary (D20); invitation gate; one parent instance holds all circles; snapshot shell readable, content member-only | the idea = a child `Instance`; join by code; ≤50 members; circle-owned sessions mirror membership (D17) | the room = a child `Instance`; 5-char code, anyone signed-in joins; completed games publicly readable | one open link `/c/<slug>`; knowledge of the URL is the whole access model; curator = URL key |

Per-app one-liners, as the code states them:

- **Threshold** ≈ `share(voice|text, one-per-pole, own-only) → sort(2 buckets, anonymous,
  atomic-submit) → reveal(agreement, attributed, reader-cutoff)`, over a supported topic queue,
  on the tick. Rides the generic circle machine; contributes ~120 lines of hooks.
- **Synthesis** ≈ private graph authoring × anchored public responding, where a response is
  **simultaneously public speech and private material** (the two-record write, D2), converging
  through a slot-budgeted statement vote into a living, never-latched synthesis, with an LLM
  Union whose citations come from the selection set, never the model.
- **On a Spectrum** ≈ a timed funnel of **nomination-with-stake-quorum** at every level
  (subtopics, maps, lenses), each confirmed map running a nested gather → rank → reveal, with
  rounds 3–4 consuming the previous round's revealed items (carry-forward), ending in a
  fork-with-edited-strings wearing rule revision's clothes.
- **Chorus** ≈ `{one anonymous open link} × {two shared vocabularies + text-or-voice body} ×
  {count-only aggregation} × {flat one-hop threading} × {no time, no stake, no identity}` —
  proof that a viable activity occupies the empty corner of the space.

---

## §3 What the code teaches beyond the essay

The eight slots hold up — every mechanism in all four apps lands cleanly in one. But composing
real activities needs nine concepts the essay's draft doesn't name. These are the difference
between describing an activity and *running* one, and each is proven by shipped code:

1. **Visibility is a per-phase property, not a per-activity one.** Threshold's redaction ladder
   (own-only → anonymous → attributed) is enforced server-side by phase name
   (`utils/threshold.js#listShares`). P8 already observes it belongs to *share-then-reveal*, not
   to Threshold. The framework needs `visibility: own | anonymous | attributed` declared per
   phase, driving both the content view and the participation view from one declaration.
2. **Draft vs committed input.** Threshold's rankings have `submittedAt: null` = draft; drafts
   count toward nothing. OaS marks per-axis done flags. Because completion predicates run after
   every write, "one turn = one write" is a *protocol* requirement (Threshold D36), not a UI
   choice. The framework needs commitment as a first-class state: either atomic turns or a
   stored done flag per (member, phase).
3. **Participants author the measuring instrument mid-activity.** Frames (pole pairs) are coined
   by players in both OaS and Synthesis — deduped orientation-free, frozen after creation, with
   durable cross-activity identity (`key`). Chorus's tag vocabularies are the same move for
   words. Config and content interleave; a builder that treats configuration as operator-only
   can't express three of the four apps.
4. **Provenance and borrowing.** Synthesis's respond writes two records (a public reply + a
   borrowed private node with `sourceNodeId` lineage); OaS's carry-forward requires a map's
   subject to be a *revealed item from the previous round*. Contributions reference prior
   contributions across pipelines — the essay's "graph of pipelines" made concrete as foreign
   keys the data framework must carry.
5. **The subject is a first-class object with its own lifecycle.** The Circle layer's *seed*
   (opaque payload + support toggle + queue + promotion) and OaS's nominations are both "what
   shall we do next" machinery — proposal, backing, confirmation, expiry — sitting *before* the
   pipeline runs. The builder needs the seed/queue primitive, not just phases.
6. **Aggregation is bound to input cardinality.** `a/(a+b)` only means something over exactly
   two buckets; mean+σ only over rankings; count only over tags. Aggregators are not freely
   swappable — each input primitive carries its compatible aggregator set.
7. **Representation is a data contract, not a chart.** Every reveal is bespoke and is the app's
   argument (the threshold bands, the spread-halo, the prompt sentence). What generalizes is the
   *contract*: Threshold ships positions and lets the reader pick the cutoff (D15/D25 — no
   stored classification); OaS ships mean+spread+count per item. The builder supplies contracts
   plus a registry of reveal components; it does not generate drawings.
8. **Containers and activities are different objects.** A circle (ongoing membership + history),
   an Instance-as-room (OaS game, Synthesis idea), and an open link (Chorus memorial) are three
   container kinds with different identity and boundary rules; activities run *inside* them.
   P6 already made the circle the scaling unit; the framework should treat "which container, and
   what identity does it demand" as the governing-conditions block of the manifest.
9. **Advancement is a policy, with four proven values.** Who moves the pipeline forward:
   `deadline` (clock), `complete` (everyone done), `manual` (facilitator), `queue`
   (material exists) — the Circle layer's `via` field is literally this enum, audited per
   transition. Chorus and Synthesis are the degenerate case: no advancement at all.

---

## §4 The primitive catalog

The composable units, extracted from what shipped. Each names the models that prove it and what
generalizing costs. Storage follows P8: **primitives own collections; activities configure
them.** Keying follows the pattern `ThresholdShare` already uses — denormalized ancestry
`(instanceId, containerId, seedId)` + `(userId, discriminator)` unique keys — because unique
keys *are* the semantics (one story per pole, one ranking per ranker).

### §4.1 Containers

| Primitive | Exists as | Notes |
|---|---|---|
| **Circle** | `models/Circle.js` + `utils/circles.js` | cohort + queue + phase machine + tick + mail. Activity-agnostic already. The default container. |
| **Room / idea** (child Instance) | `oasGames.js#createRoomInstance`, `synIdeas.js` | a child `Instance` with an app config block; free scoping on every model; join by code. Post-unification these become circles in `single`/session modes or circle-owned sessions (D17's bridge). |
| **Open link** | Chorus (`/c/<slug>`, app-guarded routes, no accounts) | the accountless container: URL = boundary, signed anonymous token = ownership handle, URL key = curation. P5 says account-optional is a platform property; this is its data shape. |

### §4.2 Subject: the seed

Exists, generic, on `Circle.seeds[]`: opaque `payload` (validated only by the module's
`normalizeSeed`), `supporterIds[]`, promotion, computed queue order, per-seed phase + deadline +
`result` (opaque) + `notifiedPhases[]` + transition audit. OaS's nomination adds **stake-quorum
backing** (see §4.4) and typed kinds; those generalize as seed options, not a second model.

### §4.3 Content primitives (the P8 collections)

- **Share** — a voice/text contribution. Generalizes `ThresholdShare` + `Memory` +
  `SynNode.content`: `{instanceId, containerId, seedId, userId, slot, title, text,
  audio{url,pathname,contentType,durationMs,peaks,sizeBytes}, transcript{status,text}}`.
  The audio wire shape is *already identical* across three models by deliberate mirroring, with
  one validator (`utils/audioPayload.js`), one recorder (`@hs/audio`), one transcription core
  (`utils/transcribe.js`), one mirror (`utils/blobMirror.js`). The per-primitive unique key must
  be declarable (Threshold's is `(seedId, userId, pole)` — the pole is part of the share's
  identity). M7's trigger has effectively fired: two activities share the wire shape and neither
  owns the collection.
- **Placement** — an opinion located against a structure. Three proven shapes, one family:
  **bucket** (`ThresholdRanking.placements[{shareId, pole}]`, atomic submit), **rank**
  (OaS `rank-x`/`rank-y` Entries, full permutation per axis, normalized to [0,1]), **position**
  (`Entry.position {x,y}` — interView maps and Synthesis stances). A generic Placement is
  `{instanceId, containerId, seedId, userId, targetId, axisOrSlot, value | order | bucket,
  submittedAt|committed}` with the shape discriminated by the input config. `Entry` remains the
  position variant's storage; bucket and rank get first-class rows rather than more duck-typing.
- **Vocabulary** — participant-extendable shared word sets. Generalizes `MemoryTag`:
  `{scopeId, set, label, key(normalized), origin: seeded|contributed, useCount, seedRank,
  hidden}`, unique `(scope, set, key)`, labels-on-the-wire, coin caps, and the
  `syncSeedTags` reconciler (add / retire-if-unused / reorder / never delete). Only the
  `set` enum pins it to Chorus today.
- **Frame** — a reusable axis. Three near-identical models exist (`OasFrame`, `SynFrame`,
  `FrameOfReference`); unify: `{scopeId, poleA, poleB (≤40, frozen), key (orientation-free),
  createdBy}`. Participant-coined, deduped both orientations, durable identity across
  activities — the platform's shared dimension registry.
- **Statement** — a candidate collective wording: `{scopeId, authorId, text, sourceRef,
  status, voterIds[]}` + the living threshold measure (§4.5). `SynStatement` exists because
  `Entry.votesPerUser` cannot express a budget spanning authoring *and* voting.
- **Node/edge graph** — `SynNode`'s DAG (2-parent marriage, cycle guard, `topicId` derivation,
  borrow provenance). The most structurally bespoke content primitive; generalize *last*, and
  only if a second graph activity appears (the repo's consumer-#2 rule).

### §4.4 Backing primitives (opinion about contributions and subjects)

| Primitive | Proven by | Shape |
|---|---|---|
| **Support toggle** | Circle seeds | one bit per member per subject, revocable, orders the queue. Costless. |
| **Stake-quorum** | OaS nominations (`addStake`, `claimStakeReturn`) | lock 1 token; N distinct stakers confirms; refund on confirm/complete/expire/close; atomic `$elemMatch` claim. A generic quorum engine with a per-kind on-confirm hook. Conservative by rule. |
| **Vote** | `Entry.voterIds` (`utils/entries.js#voteEntry`) | toggle, optional budget (`votesPerUser`), no self-vote, position-change resets others' votes. |
| **Slot budget** | `SynStatement` (D14) | N slots per member per scope, consumed by heterogeneous acts (author *or* back), freed on withdraw/unvote. |
| **Flag** | `Memory.flagCount` | count that sorts a moderation queue and never acts. |

### §4.5 Aggregators

Pluggable pure functions over a content+placement set, each bound to compatible input shapes:

| Aggregator | Input shape | Proven by |
|---|---|---|
| **Two-bucket agreement** — `a/(a+b)` per item, coherence, sorted | bucket placements | `threshold.js#computeResult` |
| **Rank statistics** — mean + population σ per item per axis; RMS combine for 2D | rank placements | `oasGames.js#computeMapResults` |
| **Count** — use counts by delta, thread counts | vocabulary applications, replies | `memories.js` |
| **Living threshold** — leading backing / live member count vs threshold; recomputed, never latched | statements + slot votes | `synStatements.js` |
| **Positional summarizer** — bucket stances per axis, name the dominant pole, name dissent | position placements + frames | `synUnion.js#computePositional` |
| **LLM synthesis** — whole-corpus prompt; citations assembled from the selection set, never parsed from output; cached per scope with `corpusVersion` staleness | any published content | `synUnion.js` + `llm/chatModel.js` |

The LLM aggregator's reusable discipline: prepare before streaming, meta-then-tokens SSE,
empty-corpus guard, selection-set citations, manual trigger + staleness badge. Its prompts
encode the activity's ontology and must become manifest configuration with a declared
interpolation vocabulary.

### §4.6 Wiring

- **Phase machine** (exists, generic): ordered phase list per cycle, reserved machine states
  (`pending/revealed/skipped/idle/closed`), per-phase clock from config, four advancement
  policies (`deadline | complete | manual | queue`) with a per-transition audit, the 60s locked
  tick as primary mover and sweep-on-read as fallback, save-before-mail dispatch.
- **Open mode** (the gap): Synthesis and Chorus have *no* phases — the seam currently assumes
  seeds + phases + done-ness, and two of four apps have none of the three. The manifest needs
  `temporal: cycles | open`; open activities skip the machine and the tick entirely.
- **Nested stages**: OaS's per-map mini-machine with deadlines *derived* from the parent
  round's remaining time. Express as a child phase list with a duration policy, or leave in
  module code (see §6).
- **Feedback declaration**: per-phase visibility (§3.1) *is* the feedback-loop slot made
  enforceable — reveal-before-input (Synthesis's anchored responding, Chorus's wall-first
  compose) vs reveal-after-input (Threshold, OaS rankings) becomes a property read off the
  manifest instead of scattered `if (phase === …)` checks.

### §4.7 Governing conditions

- **Identity modes**: `account-attributed` (Synthesis via per-scope handle; OaS inputs) ·
  `account-laddered` (Threshold's per-phase redaction) · `account-private` (OaS rankings:
  never shown) · `anonymous-token` (Chorus). Names always resolve server-side from the `User`
  doc or membership row, never the request — a platform rule all four apps already follow.
- **Stake modes**: `none` · `holons` (lock-return via `utils/holons.js`, transactional, typed
  free-string ledger) · `slots` · plus behavioural costs (atomic submit, recording effort)
  that are properties of input config, not the economy.
- **Boundary modes**: `membership` (+ invitation gate) · `code` · `open-link` (+ curator key).
  404-never-403 for absence is the platform convention.

---

## §5 The ActivityManifest (draft)

P7's registry row and P9's activity-agnostic backend, joined: the manifest is a document the
generic machine interprets — `circleActivities.register(key, createModuleFromManifest(m))`. The
seam's 9 hooks are exactly the interpreter's targets. Draft shape:

```js
ActivityManifest = {
  key, name, blurb,                      // P7 registry fields
  tier: 'A' | 'B' | 'C', status: 'experiment' | 'live' | 'retired', entryUrl,

  container: 'circle' | 'open-link',     // §4.1
  identity: 'attributed' | 'laddered' | 'anonymous-token',
  economy:  { kind: 'none' | 'holons' | 'slots', config },

  seed: {                                 // §4.2 — replaces normalizeSeed for declarative rules
    fields: { topic: {type:'text', max:120, required:true},
              poleA: {type:'text', max:40}, poleB: {type:'text', max:40},
              secondsPerNote: {type:'int', min:15, max:300, default:60} },
    rules: ['poleA != poleB'],            // named validators; escape hatch: module code
    backing: 'support' | 'stake-quorum' | 'none',
  },

  temporal: 'cycles' | 'open',
  phases: [                               // cycles only
    { name: 'share',
      input: { primitive: 'share', modality: ['voice','text'],
               key: ['seedId','userId','pole'],       // the unique key IS the semantics
               cap: '{seed.secondsPerNote}s', textMax: 2000 },
      visibility: 'own',                  // §3.1 — drives content AND participation views
      done: { kind: 'exists' },           // §3.2 — exists | committed
      hours: 72,                          // null = no clock; stored per-phase, validated
      copy: { subject: 'share a story about {topic}',
              body: '…', suppressWhen: 'done' } },    // §3 gap 5 — templates, not code
    { name: 'rank',
      input: { primitive: 'placement', shape: 'bucket', over: 'phase:share',
               buckets: ['{poleA}','{poleB}'], draft: true, submit: 'atomic-complete' },
      onOpen: [{ op: 'preplace-own', from: 'phase:share' }],   // §3 gap: cross-phase hooks
      visibility: 'anonymous', done: { kind: 'committed' }, hours: 72, copy: {…} },
  ],
  reveal: { aggregate: 'two-bucket-agreement',        // §4.5, keyed to input shape
            contract: 'positions-no-classification',  // reader-side cutoff
            visibility: 'attributed',
            component: 'threshold-bands' },           // client registry key, §6
}
```

The block above **is Threshold**, minus its bespoke reveal drawing — which stays a registered
component. That is the test the manifest passes or fails: Threshold expressible with zero module
code except representation.

---

## §6 The four presets — fit assessment

What each app needs from the framework, graded: **data** (expressible in the manifest today or
with §7's builds) / **module** (stays code behind a defined hook) / **out** (deliberately not
generalized).

| App | data | module | out |
|---|---|---|---|
| **Threshold** | everything in §5's sketch: phases, inputs, visibility ladder, clocks, copy, seed schema, aggregator | the reveal components (bands, circle map) | — |
| **Chorus** | open-link container, anonymous-token identity, vocabulary primitive (2 sets, coin caps, seed reconciler), share primitive, count aggregation, flat threads, curation-by-key, `temporal: open` | the prompt sentence (the product bet; `promptTemplate` config exists and was deliberately not used), the failure-copy UX contract | accounts, economy, phases — absent by design (D2/D3/D9) |
| **Synthesis** | idea-as-container, handles, frames, statement + slot budget + living threshold, stance placements, per-phase visibility (`private→published`), LLM aggregator with configured prompts, `temporal: open` | the two-record respond/borrow (D2), structure-mirroring on borrow (D8), promotion-by-edit, the DAG editor + map | — |
| **On a Spectrum** | stake-quorum backing, frames, rank placements + rank-stats aggregator, phase list + timers, thread lineage, room config | the nested map mini-machine with derived deadlines, carry-forward dependency (round N consumes round N−1's revealed items), subject×lens collision rules, rule revision | the dormant `routes/spectrum.js` stack (deleted post-cutover) |

Reading the column: Threshold is the Tier A proof case. Chorus is Tier A plus two new
governing-condition values (open-link, anonymous-token). Synthesis and OaS are **Tier B presets**
— manifest for their data framework and governing conditions, packages for their bespoke
mechanics — with their pieces (frames, stake-quorum, statements, LLM aggregator) available to
every future Tier A activity. That matches P1: the tier is packaging, never social behavior.

Rule revision deserves its own line: OaS's implementation is a fork with two editable strings.
The real primitive — a proposal as a structured delta over the manifest, ratified by a backing
primitive, applied as fork-or-mutate — becomes *possible* only once the rules are data. The
manifest is the precondition for "the rules belong to the players" meaning something.

---

## §7 What the machine needs (the build list)

From the gap analysis, ordered by leverage; each is small and none redesigns anything:

1. **Unfreeze the config schema.** `Circle.config` is strict Mongoose with hard-coded
   `shareHours`/`rankHours` — a manifest activity's `gatherHours` writes into nothing and gets
   no clock, *silently*. Replace with `phaseHours: Map` (or Mixed). One line; highest leverage.
2. **The `ActivityManifest` model + admin surface + interpreter.** The model (P7's fields + §5's
   body), a platform-admin tab, and `createModuleFromManifest()` targeting the existing 9-hook
   seam. Registration stays at boot; manifests load from the DB before `startJobs()`.
3. **Primitive-owned storage (M7).** `Share` and `Placement` collections per §4.3, write
   funnels + redaction in the primitive, declarable unique keys. New activities write these;
   `ThresholdShare`/`Memory`/`SynNode` stay put (migration opportunistic or never, per P8).
4. **Per-phase visibility as data.** One declaration driving `listShares`-equivalents and
   `participation` both. Kills the duplicated ladder.
5. **Commitment as a first-class state.** `committed` on Placement (exists as `submittedAt`) +
   a generic done flag, so `advanceOnComplete` stops depending on per-module queries and the
   turn-atomicity hazard (D36) is handled by the machine.
6. **Copy templates.** Per-phase `{subject, body, suppressWhen}` with a declared interpolation
   vocabulary (seed fields + circle fields), replacing `notificationFor` code for manifest
   activities. `config.memorial.promptTemplate` is the existing precedent.
7. **Generic circle creation + verb promotion.** The nine circle-generic verbs still living on
   `routes/threshold.js` (start/advance/skip/close/seeds/support/promote/mail/result) move to
   `/api/circles`; circle creation gets its admin surface (Q6's successor).
8. **Client component registry with runtime keys.** `@hs/activities`' static
   three-key `REGISTRY` becomes a registry of *primitive* components (inputs, reveals) the
   manifest selects by key — the fixed-set answer, not runtime code loading.
9. **Enum removals.** `Instance.app`, `Activity.activityType`, `Notification.type` each require
   an enum edit per new thing — all on §2-of-PLATFORM.md's forbidden list. `circle_phase`
   already exempts the circle layer; finish the job.
10. **Open temporal mode + open-link container.** `temporal: open` (skip machine + tick) and
    the accountless container block, so Chorus- and Synthesis-shaped presets are expressible.

Deliberately *not* on the list: generalizing the SynNode graph, the OaS nested mini-machine,
World Café / `memberCircleIds` (P13 — waits for the first café event), and any reveal-drawing
generator. Each waits for its consumer #2.

---

## §8 Open questions

- **PR-1 — Where does the manifest live?** An `ActivityManifest` collection (admin-editable,
  Tier A's "live immediately"), or checked-in JSON interpreted at boot (reviewable, versioned)?
  Leaning: collection, with an export script — the admin *is* the builder's UI.
- **PR-2 — Placement's storage.** One `Placement` collection with a shape discriminator, or
  keep the position shape on `Entry` and add only bucket/rank rows? Entry's upsert/vote/redact
  machinery argues for keeping it; a single collection argues for queryability.
- **PR-3 — How much validation is declarative?** `normalizeSeed` mixes field specs (declarable)
  with semantic rules ("poles must differ"). Named-rule escape hatches vs. a module-code
  fallback per manifest.
- **PR-4 — The revision primitive.** Once rules are data (§6), what ratifies a delta — the
  stake-quorum primitive, the slot-budget vote, or fork-and-see-who-shows-up (OaS's current
  answer)?
- **PR-5 — Socket convention for the circle layer.** It currently emits nothing (mail-paced by
  design); a synchronous Tier A activity needs a room convention (`circle:<id>`?) the layer
  doesn't have. Defer until a synchronous activity exists?

---

## §9 The builder v0 — single-round circle activities (settled with MO, 2026-08-17)

Scope decision (MO, 2026-08-17): no clean push — circles develop alongside the existing apps,
wired in per the original tiering. What the builder builds is a **simplified extraction**:
**single round only — prompt → group inputs → group feedback**, with a reveal-timing decision
and a feedback-mechanism decision. Synthesis's member maps, Threshold's sort phase, and OaS's
funnel all stay in their apps. §§4–7 remain the long-range shape; v0 needs almost none of it.

**The layer break (MO, 2026-08-17 — direction, deliberately unplanned).** Circle activities
are **intimate: all members visible to each other, no anonymity, ever** — the properties of an
in-person circle. The dividing line is the second layer of circle depth: interView, Synthesis,
and On a Spectrum develop as **multi-circle sessions**, appearing with a distinct logo style on
the circle map and linking out to their subdomains. Details unknown by MO's own statement —
this names a direction, not a plan; nothing about multi-circle sessions is committed here. What
*is* settled from it: the builder offers no anonymity dial, redaction ladders stay a property
of the outer layer's apps, and PR-11's minimum-n machinery is unnecessary inside circles.

**v0 needs no `ActivityManifest` collection and almost no new machine** (the one machine change
is concurrency, B1 below). One generic module — working key `gather` — registered once on the
existing 9-hook seam, whose behavior is driven entirely by the **seed payload** (already
`Mixed`, already validated only by `normalizeSeed`). The activity definition *is* the seed.
Mapping:

| v0 concept | Existing machinery |
|---|---|
| the activity | a seed on the circle; `phases: ['respond']` |
| the close (all-participated OR timer ends) | `advanceOnComplete` + `isMemberDone` (end reason `complete`) and `respondHours` (end reason `deadline`) — whichever fires first; `null` hours = no timer (D16) |
| the facilitator escape hatch | `advanceCircle` (creator or seed author), end reason `manual` |
| the reveal | the reserved `revealed` state; `onCycleReveal` writes the aggregate to `seed.result` |
| circle-home map + history | the `participation` + `snapshotExtras` hooks |
| mail at open and reveal | `circle_phase` dispatch, two templates |
| content storage | the P8 collections (§4.3): Share, Placement, Vocabulary — M7's build, now smaller |

### The response shapes (v0 input set)

Representation follows the input shape — the creator never picks a chart:

| Shape | A member contributes | The group feedback |
|---|---|---|
| **Story** | voice (≤N s) and/or text | a wall of stories |
| **Placement** | a spot on 1 axis (5 stops) or 2 axes (quadrant) + optional note | the dot map, with spread |
| **Story + placement** | tell it *and* place it on the creator's axes | stories arranged along the spectrum — Threshold-lite with self-sorting instead of the sort phase |
| **Words** | pick ≤k / coin ≤j from a seeded vocabulary | the portrait — words sized by count |

One response per member, upserted.

### The reveal decision — two combos, both named (no anonymity inside a circle)

1. **Open wall** — live and named; contributions visible as they arrive (Chorus mode).
   Reactions, if on, are live too.
2. **Sealed, then revealed** — own-only until the close, attributed at reveal (Threshold's
   ladder collapsed to two states, with the anonymous middle rung removed).

**Feedback mechanism in v0: reactions on | off.** Free, toggled, post-reveal in sealed mode.
No budgets, no votes, no economy.

*Build progress 2026-08-17 — the backend slice is built and green.* The machine change (B1):
`utils/circles.js` now resolves the activity module **per seed** (`seeds[].activity`, null = the
circle's own) and runs up to `config.maxLive` concurrent cycles (schema default 1, so every
existing circle — including live Threshold circles on production — behaves identically; all 90
pre-existing circle/threshold tests pass unchanged). The seed-payload clock override
(`payload.respondHours` read by `hoursForPhase`) implements B2 with no config-schema change. The
P8 collections exist: `models/Share.js` and `models/Placement.js`, unique keys as cardinality
rules, specs added to `scripts/ensure-indexes.js` (production needs a `--create-missing` run at
deploy). The `gather` module + funnel is `utils/gather.js` (registered on the seam by
`routes/circles.js`), REST verbs on `/api/circles` (generic: seeds/support/advance; gather:
respond/react). 29 new tests (`circlesMulti.test.js`, `gather.test.js`); full backend suite
green. Remaining: the words shape + Vocabulary model, transcription/blob-mirror wiring for
gather audio, and the `apps/circles` frontend (picker, respond, reveal).

### The creator process

1. **Start** — circle home → *Start an activity* (the picker pathway named 2026-08-15).
2. **Template** — one of the four shapes; presets hard-coded first (code, not config — the M5
   `TOPICS` precedent).
3. **Prompt** — the question, an optional context line, and the shape's own fields (axis pole
   pairs; seed words; voice seconds).
4. **Reveal** — open wall or sealed-then-revealed; reactions on/off; post-close text edits
   on/off (default on; positions and audio fix at the close, B5).
5. **Close** — it closes when everyone has participated or when the timer ends, whichever
   comes first; the timer is optional. Manual reveal stays available to the facilitator and
   the activity's author either way, as the escape hatch for a stalled activity.
6. **Preview → launch** — seen as a member will see it; launching mails the circle
   ("{creator} asks: {prompt}"). Reveal mails again ("where the circle landed").
7. The revealed artifact lands on the circle map and the circle record — **member-only** (B6).

### v0 settled decisions (MO, 2026-08-17; B-numbered, resolving PR-6…13)

- **B1 — Concurrency is a circle setting, default 3** (resolves PR-6). Up to N activities live
  at once; a close frees a slot, and the close is all-participated or timer-end. **This is the
  one real machine change in v0**: `Circle.liveSeedId` (singular) becomes a set, and
  `evaluate`/`endReasonFor`/`step` run per live seed instead of once.
- **B2 — The clock returns as an option; re-engagement stays out** (revises §9's first
  draft; resolves PR-10). An activity closes when everyone has participated **or** when its
  timer ends — the existing `advanceOnComplete` + `respondHours` pair, `null` hours = no
  timer. Deadline mail at reveal rides the existing dispatch for free. Reminder/nudge mail is
  deliberately undesigned until testing begins.
- **B3 — Any member starts one, via the existing seed + support queue** (resolves PR-7).
- **B4 — Input stays open after reveal** (resolves PR-8). Late responses join the artifact —
  Chorus's answer, accepted for the intimate layer. The known cost: for placement shapes a
  late dot is reveal-informed and moves the aggregate after people have seen it (see gotchas).
- **B5 — Post-close editing is an activity-creation setting, default on, and it is text-only**
  (resolves PR-9; refined 2026-08-17). Everything is upsertable until the close; at the close,
  **positions freeze** and only text stays editable (per the setting). **Audio is fixed from
  submission** — a recording is never replaced; re-recording lives in the recorder's review
  step, before send. The text-only rule bypasses gotchas 2 and 3 below outright. The
  statistically sensitive case (OaS's rankings) stays in its own app.
- **B6 — Reveal artifacts are member-only** (resolves PR-13).
- **B7 — The word is "activity"** (MO, 2026-08-17; resolves PR-12) — already the platform's
  word everywhere; no new vocabulary.
- **PR-11 is moot** — no anonymity inside circles, so no minimum-n machinery; the only
  remaining small case is the empty/one-response reveal state, a copy problem.

### Gotchas from B4 + B5 — resolved 2026-08-17 by the simplest rule each

1. **Stored vs live aggregate — handled by compute-on-read.** B5's text-only rule removes
   *edit*-driven drift, but B4's open input still moves the aggregate after the close (late
   responses arrive with new positions). Settled (MO: "existing/simplest"): compute the
   aggregate **on read** — Threshold's `circleResult` precedent — and treat `seed.result` as a
   cache at most. Covers both causes with one pattern that already exists.
2. **Reactions vs edits — bypassed by B5.** After the close, positions can't change, so the
   vote-reset question never arises; text edits keep their reactions. Before the close (open-
   wall mode, where reactions are live), the existing `utils/entries.js` rule applies
   unchanged: a position change resets others' votes. Nothing new to write.
3. **Audio hooks — bypassed by B5.** A recording is never replaced after submission, so the
   replacement path (and Chorus's `editMemory` trap) never executes.
4. **Auto-close vs late joiners.** Joining a circle is allowed at any time (D32). All-
   participated fires against the member roster *at that moment*; someone joining after the
   close simply contributes into the open post-reveal window (B4) — consistent, no special
   case needed.
