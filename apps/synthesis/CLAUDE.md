# Synthesis

A networked pseudonymous group blog, at `synthesis.holoscopic.io`. Local dev port **4004**. Next.js 16 + React 19 + Tailwind v4 (no config file — `@theme inline` in `globals.css`), `@xyflow/react` for the graph, NextAuth credentials against the shared backend.

Design source of truth is `PLAN.md` (§-numbered, with settled decisions D1–D20 in §10) and `UNION.md` (the whole-corpus LLM spec that replaces the M3 Q&A chat). Both are current — read the relevant § before changing behavior they describe.

**The word "synthesis" is overloaded, so each sense has its own noun.** *Synthesis* = the app. An *idea* = the container (a child `Instance`, slug `idea-<code>`). The *Union* (∪) = the LLM's read of everything the group has published. A *statement* = something a member puts to the group to vote on. *Reaching Synthesis* = the state a group enters when a statement clears the ⅔ bar. The Mongoose model files carry long header comments explaining *why* each field exists; read those before touching a schema.

## The game

Each member privately grows a DAG of nodes on their own map. Publishing a thought makes it a community-visible post. Other members respond on the post's axes, which writes **two records** (D2): a public reply `Entry` on the post, and a *borrowed* node on the responder's own map. Adding your own thought or context to a borrowed node **promotes** it to `origin: 'own'` (M2). A whole-community LLM synthesis reads the published corpus.

Two node kinds only: `topic` (a hub label many thoughts attach to) and `thought` (a one-sentence claim + prose context, owning 1–2 axes). Context is a click-to-reveal popup, not a third shape.

Milestones M0–M3 are built, and so is the community synthesis — the Union, and the statement
mechanism through *Reaching Synthesis* (PLAN.md §Phase 5). Of the move into the circles app
(P18): the move/unmarry edge gestures and the visit-their-map view are in (D18–D19). What
remains is the circle↔idea membership bridge and sessions appearing on the circle-home map
(D17).

**A thought is text, and only text.** D20 gave one a recording; it was removed on 2026-08-17,
end to end — recorder, the `/api/audio/upload` blob route, the `@hs/audio` and `@vercel/blob`
dependencies, `NodeContent.audio`, `SynNode`'s `audioSchema`, and the funnel's `normalizeAudio`
call. Rows written while it existed keep an `audio` subdocument in MongoDB, undeclared in the
schema and read by nothing. Do not reintroduce it without reopening D20.

**The map's top-left corner is a members icon and `← ideas`, nothing more.** The idea's title is
already the home hub at the centre of the map, and the head-count and invite code live on the
people page (`components/ideas/PeopleOverlay.tsx`) — facts about the roster, on the roster's own
surface.

## Architecture

| Where | What |
|---|---|
| `src/services/api.ts` | All HTTP. Attaches `x-instance-id` + `x-user-id` + bearer game token. `apiStream` is the POST-based SSE reader (EventSource can't POST). |
| `src/services/synthesisService.ts` | Typed calls over `apiFetch` |
| `src/hooks/useIdeas.ts` | Community picker + active-community identity |
| `src/components/graph/` | The map: `MapGraph`, `nodes`, `ThoughtPopup`, `ProvenanceBreadcrumb` |
| `src/components/resolve/` | Response composer + aggregate reply grid |
| `src/components/overlays/` | `OverlayShell` + Feed / Post / Union overlays |
| `src/components/statements/` | `StatementsOverlay` + `SynthesisMeter` — the board, and the ⅔ bar |
| `apps/backend/routes/synthesis.js` | REST surface, mounted at `/api/synthesis` behind `resolveInstance` + `enforceVerifiedUser` |
| `apps/backend/utils/synNodes.js` | **The node write funnel** — DAG edges, marry, publish, respond/borrow, upvote, feed |
| `apps/backend/utils/synIdeas.js` | Community create/join + the ≤50-member gate |
| `apps/backend/utils/synIndex.js` | Embedding index over the published corpus |
| `apps/backend/utils/synUnion.js` | Corpus selection, positional summaries, prompts, cache |
| `apps/backend/utils/synStatements.js` | **The statement write funnel** — slots (D14), votes, the ⅔ bar, withdraw |
| `apps/backend/utils/synIndexHooks.js` | Production wiring injected via `setIndex()`; fires on every corpus change |
| `apps/backend/sockets/synthesis.js` | `syn:join` / `syn:leave` community rooms |

## Two instance ids, on purpose

`PARENT_INSTANCE_ID` is `synthesis` — the deployment. A **community is its own child Instance** (slug `idea-<code>`), created lazily.

- `/communities*` routes address a community by its shareable **code**, because you have no instance id until you've created or joined one.
- Everything else (`/nodes*`, `/frames*`, `/feed`, `/synthesis`) operates on `req.instanceId` from the `x-instance-id` header.

Sending the parent id where a community id belongs returns empty results rather than an error. That is the most common way Synthesis work goes silently wrong.

## The one privacy contract

Nodes default to `visibility: 'private'`. Nothing is community- or LLM-visible until published, and this is enforced **server-side on every read path** and in the embedding index — never client-side. `SynEmbedding` denormalizes `visibility` so retrieval can re-filter defensively.

This is about *drafts, not identity*. Once published there is no redaction: attribution is always by handle (D3). Use `toClient`, never `toRedacted` — the interView author-stripping pattern does not apply here.

## Write funnels

Never write these collections directly:

| Collection | Funnel |
|---|---|
| `SynNode` | `utils/synNodes.js` — DAG edges, cycle guard, same-owner check, `topicId` derivation, provenance |
| `SynMembership` / community `Instance` | `utils/synIdeas.js` — including the ≤50 gate |
| `Entry` (replies) | `utils/entries.js`, per the root CLAUDE.md rule |
| `SynEmbedding` | `utils/synIndex.js` |
| `SynUnion` | `utils/synUnion.js` |
| `SynStatement` | `utils/synStatements.js` — slots, votes, the ⅔ bar |

Replies **duck-type a published node as their activity**: a reply Entry has `activityId = <published node id>`. There is no `Activity` document for a post. Zero `Entry` schema change was needed and none should be added.

## Testing

`npm test --workspace=apps/backend` (`node --test`). Funnel functions take an injectable `store` parameter defaulting to `mongoStore`, so unit tests run with fakes and no DB or LLM. Follow that pattern for new funnel functions — it is why `synNodes.test.js` and friends run fast and offline.

## Visual language

Synthesis has its **own** hand-styled system, like On a Spectrum — not a patchwork of shared components. Borrow the resolve *logic* from `@hs/activities` (the `{x,y} ∈ [0,1]` model, `QUADRANT_POSITIONS`, pole-A orientation); write the *presentation* Synthesis-native. Mobile-first `max-w-md` columns, graph as the one full-bleed surface.

The map's shape language is **cut facets on a dark field** — every node is a symmetrically chamfered plane, never a rounded box, and never an asymmetric one. One device per fact: **shape = kind** (hexagon hub / chamfered card thought), **size = nesting** (a hub shrinks per hub above it), **stroke = origin**, **dashed = provisional** (private — the *exception*, since new thoughts auto-publish, so a badge on "live" would be noise; hubs are private scaffold and so read dashed), **ring = notable** (an offset outline of the node's own shape — the home hub and a join node, nothing else). That is the whole vocabulary; resist adding to it. A mark a reader can't act on is noise however small — a thought's context gets no badge, because tapping the thought reveals it either way. Parent→child edges are deliberately quiet (`--line-strong`); only a marriage gets colour, because tidy-tree geometry (`lib/graph.ts`) already says who the parent is.

**Node outlines are SVG paths, never CSS borders**, and node boxes are deterministic (`NODE_W` / `THOUGHT_H` / `hubHeight` in `lib/graph.ts`) so those paths can be drawn at exact coordinates. A `clip-path`ed element clips its own `border` and `box-shadow` away — that's what rendered hubs as unoutlined blobs in the first pass — and only a real stroke can carry a dash around a hexagon. Shadows are `filter: drop-shadow`.

## Gotchas

- **Index hooks are fire-and-forget.** The funnel does not await or catch them. `markStale()` runs even when no LLM is configured — corpus staleness is not conditional on embeddings being wired up.
- **The Union never regenerates on its own.** Staleness surfaces only as a badge; a member has to press the button (UNION.md §9).
- **Promotion has no route of its own.** `PATCH /nodes/:id` with a `content` body *is* the "make it mine" gesture — `editContent` calls `promoteIfBorrowed` internally.
- **Frames are frozen at creation.** Pole text is never mutated, and frames dedupe per community on a sorted-lowercase `key`, so two authors coining the same lens share one id and stay comparable.
- **Marriage is like-with-like only** (D4). Thought⨯Thought inherits the **first-selected** parent's topic when the parents sit under different hubs.
- **New models need `{ id: false }`** in schema options, like every model in this repo, or Mongoose's `id` virtual shadows the custom `id` field.
