# Unison

A networked pseudonymous group blog, at `unison.holoscopic.io`. Local dev port **4004**. Next.js 16 + React 19 + Tailwind v4 (no config file — `@theme inline` in `globals.css`), `@xyflow/react` for the graph, NextAuth credentials against the shared backend.

Design source of truth is `PLAN.md` (§-numbered, with settled decisions D1–D10 in §10) and `SYNTHESIS.md` (the community-synthesis spec that replaces the M3 Q&A chat). Both are current — read the relevant § before changing behavior they describe. The Mongoose model files carry long header comments explaining *why* each field exists; read those before touching a schema.

## The game

Each member privately grows a DAG of nodes on their own map. Publishing a thought makes it a community-visible post. Other members respond on the post's axes, which writes **two records** (D2): a public reply `Entry` on the post, and a *borrowed* node on the responder's own map. Adding your own thought or context to a borrowed node **promotes** it to `origin: 'own'` (M2). A whole-community LLM synthesis reads the published corpus.

Two node kinds only: `topic` (a hub label many thoughts attach to) and `thought` (a one-sentence claim + prose context, owning 1–2 axes). Context is a click-to-reveal popup, not a third shape.

Milestones M0–M3 are built. Community synthesis is the active work.

## Architecture

| Where | What |
|---|---|
| `src/services/api.ts` | All HTTP. Attaches `x-instance-id` + `x-user-id` + bearer game token. `apiStream` is the POST-based SSE reader (EventSource can't POST). |
| `src/services/unisonService.ts` | Typed calls over `apiFetch` |
| `src/hooks/useCommunity.ts` | Community picker + active-community identity |
| `src/components/graph/` | The map: `MapGraph`, `nodes`, `ThoughtPopup`, `ProvenanceBreadcrumb` |
| `src/components/resolve/` | Response composer + aggregate reply grid |
| `src/components/overlays/` | `OverlayShell` + Feed / Post / Synthesis overlays |
| `apps/backend/routes/unison.js` | REST surface, mounted at `/api/unison` behind `resolveInstance` + `enforceVerifiedUser` |
| `apps/backend/utils/unisonNodes.js` | **The node write funnel** — DAG edges, marry, publish, respond/borrow, upvote, feed |
| `apps/backend/utils/unisonCommunities.js` | Community create/join + the ≤50-member gate |
| `apps/backend/utils/unisonIndex.js` | Embedding index over the published corpus |
| `apps/backend/utils/unisonSynthesis.js` | Corpus selection, positional summaries, prompts, cache |
| `apps/backend/utils/unisonIndexHooks.js` | Production wiring injected via `setIndex()`; fires on every corpus change |
| `apps/backend/sockets/unison.js` | `unison:join` / `unison:leave` community rooms |

## Two instance ids, on purpose

`PARENT_INSTANCE_ID` is `unison` — the deployment. A **community is its own child Instance** (slug `uni-<code>`), created lazily.

- `/communities*` routes address a community by its shareable **code**, because you have no instance id until you've created or joined one.
- Everything else (`/nodes*`, `/frames*`, `/feed`, `/synthesis`) operates on `req.instanceId` from the `x-instance-id` header.

Sending the parent id where a community id belongs returns empty results rather than an error. That is the most common way Unison work goes silently wrong.

## The one privacy contract

Nodes default to `visibility: 'private'`. Nothing is community- or LLM-visible until published, and this is enforced **server-side on every read path** and in the embedding index — never client-side. `UnisonEmbedding` denormalizes `visibility` so retrieval can re-filter defensively.

This is about *drafts, not identity*. Once published there is no redaction: attribution is always by handle (D3). Use `toClient`, never `toRedacted` — the interView author-stripping pattern does not apply here.

## Write funnels

Never write these collections directly:

| Collection | Funnel |
|---|---|
| `UnisonNode` | `utils/unisonNodes.js` — DAG edges, cycle guard, same-owner check, `topicId` derivation, provenance |
| `UnisonMembership` / community `Instance` | `utils/unisonCommunities.js` — including the ≤50 gate |
| `Entry` (replies) | `utils/entries.js`, per the root CLAUDE.md rule |
| `UnisonEmbedding` | `utils/unisonIndex.js` |
| `UnisonSynthesis` | `utils/unisonSynthesis.js` |

Replies **duck-type a published node as their activity**: a reply Entry has `activityId = <published node id>`. There is no `Activity` document for a post. Zero `Entry` schema change was needed and none should be added.

## Testing

`npm test --workspace=apps/backend` (`node --test`). Funnel functions take an injectable `store` parameter defaulting to `mongoStore`, so unit tests run with fakes and no DB or LLM. Follow that pattern for new funnel functions — it is why `unisonNodes.test.js` and friends run fast and offline.

## Visual language

Unison has its **own** hand-styled system, like On a Spectrum — not a patchwork of shared components. Borrow the resolve *logic* from `@hs/activities` (the `{x,y} ∈ [0,1]` model, `QUADRANT_POSITIONS`, pole-A orientation); write the *presentation* Unison-native. One graph aesthetic across My Map, the reply map, and synthesis citations: **shape = kind, color = origin, dashed = cross-map link**. Mobile-first `max-w-md` columns, graph as the one full-bleed surface.

## Gotchas

- **Index hooks are fire-and-forget.** The funnel does not await or catch them. `markStale()` runs even when no LLM is configured — corpus staleness is not conditional on embeddings being wired up.
- **Synthesis never regenerates on its own.** Staleness surfaces only as a badge; a member has to press Synthesize/Expand (SYNTHESIS.md §9).
- **Promotion has no route of its own.** `PATCH /nodes/:id` with a `content` body *is* the "make it mine" gesture — `editContent` calls `promoteIfBorrowed` internally.
- **Frames are frozen at creation.** Pole text is never mutated, and frames dedupe per community on a sorted-lowercase `key`, so two authors coining the same lens share one id and stay comparable.
- **Marriage is like-with-like only** (D4). Thought⨯Thought inherits the **first-selected** parent's topic when the parents sit under different hubs.
- **New models need `{ id: false }`** in schema options, like every model in this repo, or Mongoose's `id` virtual shadows the custom `id` field.
