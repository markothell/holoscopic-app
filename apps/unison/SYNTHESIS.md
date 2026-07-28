# Unison — Community Synthesis (spec, draft v0.2)

> **Replaces** the M3 "Ask the Group" open Q&A with **pure synthesis**: a cached,
> whole-community statement of where the group currently stands — drawn from the
> published corpus **and** how members positioned themselves on each post's
> spectrums. Grounded in the M3 plumbing (the `ChatModel` port, embedding index,
> citations-from-set rule, privacy scoping, index hooks) — mostly selection +
> positional summarization + prompt + caching, not new infrastructure.

## 1. Goal

One artifact per community: *"here's where the group stands right now."* Two
depths (both settled, §11):
- **Brief** (default): a 2–4 sentence synthesis — prevailing sentiment, the main
  tension/dissent, distinctive positions attributed by handle.
- **Full** (on a button): a longer structured read — consensus / points of tension
  / notable voices.
Both draw **only** from published thoughts + public replies + reply positions,
with citations back to specific posts/replies. No question box.

## 2. Scope — whole community, positions included (settled)

Synthesize the **entire published corpus** for the community instance. Not per-post,
not per-topic.

**Positions are in (corrected from v0.1).** Reply `{x,y}` stances are *not* globally
comparable (each post has its own axes), but **per post / per spectrum they are
meaningful sentiment data** and must be part of the synthesis. They enter as
**per-post positional summaries** computed locally (no LLM) and fed into the
CONTEXT alongside the textual chunks — so the synthesis reflects both *what people
said* and *where they placed themselves*.

## 3. What changes vs. M3 Q&A

| | M3 Q&A (`prepareAnswer`) | Community synthesis (`prepareSynthesis`) |
|---|---|---|
| Input | a user question | none (whole corpus), a `depth` (brief/full) |
| Selection | top-k **relevance** to a query | **coverage** of the corpus (all, or representatives) |
| Signals | reply/thought text only | text **+ per-post positional summaries** |
| When it runs | per question, live | on the **Synthesize button**, cached + reused across viewers |
| Query embedding | yes | **no** (no query) |
| Output | an answer | brief statement (default) or full structured read |

The M3 `retrieve()` query path is **not used** — synthesis wants representative
coverage (incl. dissent), not query relevance.

## 4. Corpus selection

Reuse the embedding store (`unisonembeddings`, `instanceId`-scoped, published-only)
for storage + Phase-2 coverage sampling — not for query retrieval.

`selectCorpus(instanceId)`:
- Load all published chunks (`store.list(instanceId)` filtered to
  `visibility:'published'`) — thought chunks + reply-prose chunks.
- **Small corpus (v1 scale):** feed all. **Large corpus (Phase 2):** k-means / MMR
  over the stored vectors → representatives per cluster (keeps minority views).
- Privacy inherited: store holds only published rows; filtered again defensively.

## 5. Positional summaries (the corrected piece)

`computePositional(instanceId)` — **local math, no LLM**. For each published
**post (thought)** that has positioned replies:
- Pull the replies' `Entry.position` (`{x,y}∈[0,1]`) and the post's axes
  (`node.axisFrameIds` → `UnisonFrame` pole labels; poleA = the "most" end — right
  on x, top on y, per OaS orientation).
- Compute, on that post's own axes:
  - **where replies cluster** — 2 axes → dominant quadrant by `x/y ≷ 0.5` named with
    the pole labels ("considered + collective"); 1 axis → lean toward a pole.
  - **agreement vs. split** — spread/variance of the points (tight = consensus,
    wide = contested).
  - **count**.
- Render one CONTEXT line per post, e.g.:
  `[P3] On "a ritual is a decision you no longer make" (instinctive↔considered × personal↔collective): 7 replies cluster in considered+collective; a dissenting few lean instinctive.`
- Each positional line carries a **citation to its post** (kind `node`).

Positional lines join the textual chunks in the CONTEXT. (Replies with a stance but
no prose still contribute here even though they aren't embedded/text-retrievable.)

## 6. Orchestrator

New `utils/unisonSynthesis.js`, sibling to `utils/unisonChat.js`:
- `prepareSynthesis({ store, model, instanceId, depth })`:
  - `selectCorpus` (text chunks) + `computePositional` (positional lines).
  - **Empty guard:** no published content → `{ empty:true, text:"The group hasn't
    published anything to synthesize yet." }`, no model call.
  - Render a numbered CONTEXT block interleaving text chunks and positional lines
    (reuse `renderContext`'s `"[n] handle: text"` shape; positional lines as shown).
  - `citations = assembleCitations(set)` — from the set, never parsed from output.
  - Return `{ system: SYNTHESIS_PROMPT[depth], messages, citations }`.
- Model call: `getSynthesisModel().stream(...)` (see §8 — Sonnet).

## 7. Prompts (brief + full)

Shared rules carry over verbatim from M3's `SYSTEM_PROMPT` (published-only, no
invention, attribute by handle, no system tags). Depth-specific tail:

**Brief:**
> Write a 2–4 sentence synthesis of where the group currently stands, from ONLY the
> CONTEXT (published thoughts, replies, and how members positioned themselves on
> each post's spectrums). Lead with the prevailing sentiment; name the main tension
> or strongest dissent if any; attribute distinctive positions by handle. State the
> group's position — don't address a reader or ask questions.

**Full:**
> Write a structured read of where the group stands, from ONLY the CONTEXT. Three
> short parts: **Consensus** (what most agree on), **Tension** (the main
> disagreements or splits — cite the positional splits where relevant), **Voices**
> (2–4 distinctive positions, each attributed by handle). Keep each part tight; no
> outside facts, no invented positions or handles.

## 8. Model — Sonnet (settled: upgrade)

Synthesis runs on **`claude-sonnet-5`** via a dedicated `UNISON_SYNTHESIS_MODEL`
env (falls back to the chat model). It's one call amortized across all viewers, so
the quality gain (capturing consensus vs. tension) is worth it even though Q&A runs
Haiku. Reuses the same chat adapter/port — just a different model id.

## 9. Caching & trigger (settled: lazy + manual button)

Nothing auto-generates. The synthesis is produced **when a member opens the tool
and hits "Synthesize"** (and reused across viewers until the corpus changes).

- New `models/UnisonSynthesis.js`: one doc per `instanceId`, holding `corpusVersion`
  and a `brief` and `full` sub-artifact each `{ text, citations, generatedAt, model,
  atCorpusVersion }`.
- **Staleness:** `utils/unisonIndexHooks.js` (already firing on
  publish/unpublish/edit/promote/reply) also **bumps the instance `corpusVersion`**.
  A cached depth is *stale* when its `atCorpusVersion` ≠ current.
- **Routes:**
  - `GET /unison/synthesis` → the cached `{ brief?, full?, corpusVersion, stale }`
    (may be empty/absent) — for showing the last result + a stale badge on open.
  - `POST /unison/synthesis { depth }` → (re)generate that depth, update cache,
    return it. This is what the **Synthesize** (brief) and **Expand** (full) buttons
    call. Unconfigured LLM → 503 (as M3).

Cost: one Sonnet call per button press when stale; cached hits are free. A burst of
replies costs nothing until someone next hits Synthesize.

## 10. Frontend (replaces AskOverlay)

The Ask surface becomes a **synthesis view** (Q&A replaced):
- No input box. On open: `GET /synthesis` → show the last brief result if present,
  with an "as of <time>" line + **stale** badge if the corpus changed since.
- **"Synthesize" / "Refresh"** button → `POST {depth:'brief'}`, render the streamed
  statement + citation chips (reuse the existing chip component + deep-linking).
- **"Expand"** button → `POST {depth:'full'}`, render the structured read.
- Empty state ("nothing published yet") and 503 ("not set up yet") as M3.
- Dock label: "Ask" → **"The Group"** (or "Where we stand").

## 11. Decisions (settled)

1. **Replace Q&A** — yes, the synthesis view replaces the question box.
2. **Trigger** — lazy + **manual**: generated on the Synthesize button, cached,
   regenerated (on button) when stale.
3. **Output** — **both**: brief 2–4 sentences by default, a button for the full
   structured read.
4. **Model** — **upgrade to Sonnet** (`UNISON_SYNTHESIS_MODEL=claude-sonnet-5`).
5. **Positions** — **included**, as per-post/per-spectrum summaries (§5).

## 12. Backend surface (files)

- `models/UnisonSynthesis.js` (new) — per-instance cache + `corpusVersion`.
- `utils/unisonSynthesis.js` (new) — `selectCorpus`, `computePositional`,
  `prepareSynthesis`, cache read/write, `markStale(instanceId)`.
- `utils/unisonIndexHooks.js` (edit) — also `markStale` on corpus change.
- `routes/unison.js` (edit) — `GET /synthesis`, `POST /synthesis`.
- `llm/` (edit) — a `getSynthesisModel()` (or reuse the chat adapter with
  `UNISON_SYNTHESIS_MODEL`).
- Tests (fake `ChatModel`, no network): `selectCorpus` (published-only, empty),
  `computePositional` (quadrant/pole naming, consensus vs. split, orientation),
  citation assembly, empty-guard, staleness.

## 13. Reuse vs. build

- **Reuse:** `ChatModel` port + chat adapter, embedding store (Phase-2 clustering),
  `cosine()`, `renderContext` + `assembleCitations`, SSE/streaming, privacy scoping,
  index hooks, the citation-chip UI + deep-linking.
- **Build:** `prepareSynthesis` + the two prompts, `selectCorpus`,
  `computePositional`, `UnisonSynthesis` cache + `markStale`, the two routes, the
  synthesis view (replacing AskOverlay), the synthesis-model wiring.

## 14. Phasing

- **S1 — feed-all + positions:** whole corpus (assume small) + per-post positional
  summaries → brief & full on the button, cached per instance, Sonnet, replace the
  Ask surface. Covers v1 scale.
- **S2 — coverage sampling:** k-means/MMR over stored vectors for large corpora.
- **S3 — polish:** debounced/scheduled regen option, tunable structure, per-topic
  synthesis if wanted later.
