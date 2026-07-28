# Unison — Master Plan (draft v0.3)

> **Settled (2026-07-24):** v1 has **no holon economy** (free to publish/reply;
> revisit only for LLM-query budgeting). The community is **pseudonymous and
> trusted** — everything published is attributed to its author's handle; **no
> anonymization**, no privacy redaction. **Drafts stay private until published**:
> an author builds on their own map first, and only published nodes become
> group-visible, reply-able, and part of the LLM corpus. **Marry = a new
> synthesis node** with two parents (the map is a DAG, not a tree).
>
> **The reply model (D2, settled):** replying to someone's post **never mutates
> the post you're visiting** — an author's blog is read-only to others. Instead,
> replying drops a **borrowed node onto _your own_ map**: it mirrors the post's
> layers, is stamped *originated-elsewhere*, carries your resolve-map placement,
> and links back to the source node. That web of cross-map links **is** the
> network. When you add **your own** thought/context to a borrowed node, it
> **promotes** to your own (its color flips from "elsewhere" to "mine").
>
> **Every map node is a `UnisonNode`** (two kinds: topic hubs + thoughts). A
> **public reply** is an `Entry` on the post (D2) — the shared `Entry` collection
> is used for replies only, zero schema change. The collective LLM sits behind a
> **provider-agnostic standard chat port**, so the model swaps by config with no
> integration-code changes. **UI is one cohesive, hand-styled system** (see §7):
> the resolve *interaction* is borrowed, but re-presented in Unison's own visual
> language — the way On a Spectrum built in-theme components rather than dropping
> in raw shared ones.

> **Unison** is a networked group blog for a trusted community (≤50 people). Each
> member privately grows a DAG of layered "posts." Reading someone else's
> published post and responding to it pulls a linked, *borrowed* copy of their
> idea onto your own map, which you can then build out and make your own — so
> every member's map becomes a personal weave of their own thinking and the
> community's. A collective LLM lets anyone "talk to" the whole group's published
> thinking, with citations back to specific thoughts.

This plan is grounded in the existing building blocks: the **resolve** quadrant
interaction, the **OasFrame** pole-pair "spectrum" model, the denormalized
flat-indexed **personal-map query** pattern from the Entry protocol, the
**instance-per-room** tenancy pattern from On a Spectrum, and the
`@xyflow/react` graph surface. Where Unison reuses a primitive it is called out
explicitly; where it must diverge, the divergence is justified.

---

## 1. Core objects

| Object | What it is | Backed by |
|---|---|---|
| **Community** | A trust boundary of ≤50 members. Owns its economy, membership, and LLM scope. | An `Instance` (child of a `unison` parent instance), mirroring OaS rooms. |
| **Topic (hub)** | A word-ish label that organizes a cluster. Many thoughts attach to it as DAG children. Carries no axes and is not itself a reply target. | A **`UnisonNode`** with `kind: 'topic'`. |
| **Thought (post)** | One authored idea: a one-sentence claim **carrying its `context` as a pair** (prose w/ links, revealed by clicking the thought — an interView-style popup, not a third shape) + its **axes**. Hangs off a topic hub. **A published thought IS the post** — the reply/borrow target. | A **`UnisonNode`** with `kind: 'thought'`. |
| **Axis (Spectrum)** | A pole pair (e.g. concrete↔abstract). A **thought** carries 1 (ranked line) or 2 (2×2 grid). Defines the coordinate space a reader positions their response in. Topic hubs have none. | **`OasFrame`-shaped `UnisonFrame` model**, deduped per community. |
| **Reply** | The public artifact of responding to a post: a quadrant stance + context, attached to the **post** so its author sees the aggregate. | An **`Entry`** duck-typing the post node as its activity (`activityId = postNodeId`, `position`, `text`) — the OaS pattern. |
| **Borrowed node** | The responder's private handle on that same response — a `thought` mirroring the source thought's claim + context + axes, promotable, part of *their* DAG. | A **`UnisonNode`** with `kind: 'thought'`, `origin: 'borrowed'` + `sourceNodeId` + `sourceEntryId`. |
| **Edge** | Same-map parent→child or **marriage** (a synthesis node with two parents); plus the cross-map **origin link** from a borrowed node to its source. | `parentIds[]` + `edgeKind` (same-map DAG) and `sourceNodeId`/`sourceEntryId` (cross-map link) on `UnisonNode`. |

**Two records per response — by design.** Responding to a post writes **both** an
`Entry` (public, post-owned, frozen — powers the author's reply map) **and** a
borrowed `UnisonNode` (private, responder-owned, promotable). They share seed
content but diverge: the Entry is "what I said to you," the node is "my evolving
version." This is precisely the OaS split — the graph object is a model, the
positioned/aggregatable content is Entries — applied to Unison: `UnisonNode` is
the map/DAG layer; the `Entry` collection is the post-attached reply layer.

---

## 2. The private DAG

Each member has a private map: `UnisonNode.find({ instanceId, ownerId })` — a
flat indexed scan, same shape as the personal-map query in the Entry protocol.

**Two growth operations:**

- **Create child** — new node with `parentIds: [parent]`, `edgeKind: 'child'`.
  Unlimited depth, unlimited fan-out. Same as OaS subtopic branching.
- **Marry** — new **synthesis node** with `parentIds: [a, b]`, `edgeKind:
  'marriage'`. This is the one structural break from every other Holoscopic
  graph: **the map is a DAG, not a tree.** Marriage is how two lines of thought
  converge into a combined idea.

**Invariants:**
- `parentIds` reference only nodes the **same owner** owns — the DAG is
  intra-map. Cross-map relationships are never `parentIds`; they are the
  `sourceNodeId` origin link on a borrowed node (§3).
- **Cycle guard**: on create/marry/re-parent, walk ancestors of the proposed
  parents and reject any edge that would close a loop. Enforced in
  `utils/unisonNodes.js`, never client-side.
- A node with no parents is a **root** (a top-level facet of the member's map).
  A borrowed node arrives as a root (or child of wherever the responder files
  it); its `sourceNodeId` link is orthogonal to the DAG.

**Rendering:** `@xyflow/react`, reusing the OaS `GameGraph`/interView `PlayerMap`
patterns. Marriages render as a node with two incoming edges; **shape = kind**
(topic hub vs. thought — context is a click-to-reveal popup on a thought, not a
third shape) and **color = origin** (own vs. borrowed-from-elsewhere, flipping on
promotion). Origin links to other members' nodes render as a distinct, dashed
cross-map edge.

---

## 3. Publish → borrow → promote (the networking loop)

This is the heart of Unison. Responding to another member's idea grows **your
own** map, never theirs.

```
author drafts nodes on their own map (private)
        │  publish
        ▼
node joins the community feed  ──►  a reader opens it (read-only)
                                        │  respond: place a stance on the post's
                                        │  axes (resolve quadrant) + write context
                                        ▼
         ┌──────────────────────────────┴──────────────────────────────┐
         ▼                                                              ▼
  REPLY  Entry on the POST                        BORROWED node on the READER'S map
   · activityId = post.id                          · mirrors source layers (snapshot)
   · position = the stance                         · origin = 'borrowed'
   · text = the context                            · sourceNodeId + sourceEntryId (dashed link)
   · powers the author's reply map                 · promotable; part of reader's DAG
   —— the post's own NODES are UNCHANGED ——        │  reader adds their OWN thought/context
                                                    ▼
                                        PROMOTES: origin = 'own' (color flips to "mine")
```

- **Read-only for the author.** A published post's *nodes* are never mutated by
  anyone else. Responding adds a **reply record to the post** (visible to its
  author) and a **borrowed node to the responder's own map** — the accumulation
  of cross-map links is the network.
- **The response composer** = the source node's axes rendered as the resolve
  interaction: 2 axes → a 2×2 quadrant, 1 axis → a ranked line. You place a
  stance (`{x,y}` in `[0,1]`, the standard coordinate space) and write your
  context. Re-styled into Unison's own visual language (§7) — not the raw
  `@hs/activities` grid.
- **The reply `Entry`** (`activityId = post.id`, `position`, `text`,
  `questionId:'context'`, `username`=handle) is the public, frozen artifact. One
  re-editable reply per member per post via the `(activityId,userId,slot,
  questionId)` upsert key. This is what the author's quadrant reply map reads.
- **The borrowed `UnisonNode`** on the responder's map seeds from a snapshot of
  the source's layers, stamped `origin:'borrowed'` + `sourceNodeId` +
  `sourceEntryId` + `sourceOwnerHandle`. A thought node, color = borrowed. It
  stands on its own even if the source (or the reply) later changes.
- **Promotion.** Adding your own thought or context to a borrowed node
  **promotes** it (`origin:'own'`, color flips). The single "make it mine"
  gesture — no separate adopt step. Provenance links are retained.
- **The author's reply map** (a first-class surface, not an afterthought): for
  post P, `Entry.find({ activityId: P.id })` rendered on P's axes with the
  restyled ResolveGrid aggregate — click a dot → responder handle + context.
  Visible to the post author always; group-wide visibility is a small config
  choice (D6).

---

## 4. Data model

### New: `UnisonNode` — the one content model, **two node kinds**

Settled node model (2026-07-24, M0): `topic` and `thought` are **distinct node
kinds**, not three co-resident layers on one node. A **topic is a hub** — a
word-ish label that many thoughts attach to as DAG children. A **thought carries
its context as a pair** (the one-sentence claim + prose `context`, revealed by
clicking the thought — an interView-style popup, not a third shape) and owns
**1–2 axes**. "Many thoughts attached to a topic" is therefore literal DAG
structure (thought nodes whose parent is a topic node), not a field on one node.

**The publishable post = a published thought** (thought + context + axes). It is
the unit that enters the feed, is read-only to others, is replied to, is mirrored
by a borrowed node, and is pointed at by `sourceNodeId`. Topic hubs are private
organizing scaffold; `visibility` still lives on both kinds (so surfacing a hub
in the feed stays a reversible M1+ option), but the canonical post is the thought.
**`axisFrameIds` lives on the thought** — a topic hub has none.

```
id                8-char, custom (never _id)
instanceId        community, required, indexed
ownerId, ownerHandle                    // pseudonymous author of THIS node
kind: 'topic' | 'thought'               // distinct kinds (was: layers-on-one-node)
content: {                              // kind-appropriate fields:
  topic,                                //   'topic': the hub label
  thought,                              //   'thought': the one-sentence claim
  context,                              //   'thought': prose w/ link markup (the pair)
}
axisFrameIds: [String]                  // 1 or 2 UnisonFrame ids → response grid (THOUGHT only)
topicId: String | null                  // nearest topic-hub ancestor, denormalized; null on topics/root thoughts

// Same-map DAG topology
parentIds: [String]                     // 0 = root, 1 = child, 2 = marriage
edgeKind: 'root' | 'child' | 'marriage'

// Origin / cross-map provenance (the network)
origin: 'own' | 'borrowed'              // 'borrowed' flips to 'own' on promotion
sourceNodeId: String | null             // the published thought this was a response to
sourceEntryId: String | null            // the reply Entry this node was born from
sourceOwnerHandle: String | null        // denormalized, for "from elsewhere"

visibility: 'private' | 'published'
publishedAt: Date | null
promotedAt: Date | null                 // when origin went borrowed → own
timestamps
```
Indexes: `{instanceId, ownerId}` (my map), `{instanceId, visibility}` (feed /
LLM corpus), `{instanceId, topicId}` (thoughts under a hub — the "topic is a
hub" relationship as a query), `{parentIds}` (multikey, edge walks),
`{sourceNodeId}` (the network graph). The **stance** for a borrowed node lives
on its reply Entry, not here — positions are meaningful on the *source thought's*
axes, which is the author's reply map, not the responder's free-form DAG.

**M0 funnel** (`utils/unisonNodes.js`): `createRoot`, `createChild`, `marry`
(two distinct parents), `reparent`, `publish`/`unpublish`, and frame dedupe
(`resolveFrame`). The **cycle guard** (ancestor walk on create/marry/reparent)
and the **same-owner `parentIds` invariant** are enforced here, never
client-side. A borrowed thought (M1) mirrors a source thought with
`origin:'borrowed'` + `sourceNodeId`; adding your own thought/context promotes
it to `own` (M2). Marriage defaults to a `thought` (a synthesis is a new claim).

### New: `UnisonFrame` (OasFrame clone)
Deduped pole pairs per community — the reusable axis vocabulary. `poleA` = the
"most" end (filled dot; right on x, top on y), identical orientation rules to
OaS so the spectrum glyph logic carries over.

### Reused: `Entry` (replies) — **zero schema change**
The post-attached reply record. `activityId` = post node id (duck-typed as the
activity, no `Activity` doc — OaS pattern), `position` = quadrant stance, `text`
= context, `questionId` = `'context'`, `username` = handle, `topicId` = null.
All writes through `utils/entries.js`; the `(activityId,userId,slotNumber,
questionId)` upsert key = one re-editable reply per member per post. Author's
reply map = `Entry.find({ activityId: postId })` → the resolve aggregate view.
Never redacted (`toClient`, not `toRedacted`) — the group is pseudonymous.
**Replies are public** (D6): the reply map is a comment section, visible to
everyone in the community viewing the post, not just its author.

### New: `UnisonThread` / chat (see §6).

**Reuse scorecard:** resolve interaction + aggregate view ✅ · **Entry protocol
for replies** ✅ · frame model ✅ · denormalized flat-index map-query pattern ✅ ·
instance-per-room tenancy ✅ · `@xyflow/react` graph surface ✅ · holon utils ✅
(only if a budget lands later). **Genuinely new:** the `UnisonNode`
DAG-with-marriage model, the borrow→promote loop, and the collective LLM.

---

## 5. Backend surface

Follows the OaS shape (single funnel util + thin routes + socket for presence):

- `models/UnisonNode.js`, `models/UnisonFrame.js`, `models/UnisonThread.js`
- `utils/unisonNodes.js` — the single write funnel: create/child/marry (cycle
  guard), publish/unpublish, **respond** (writes the reply Entry via
  `utils/entries.js` **and** creates the borrowed node in one call), **promote**
  (borrowed → own on first owner-authored layer), frame dedupe. Balances (if any)
  only via `utils/holons.js`.
- `routes/unison.js` — REST, `resolveInstance` already applied; return plain
  envelopes (`{ node }`, `{ nodes }`, `{ answer, citations }`). Registered
  inside `loadAPIRoutes()`.
- `sockets/unison.js` — a per-member room `unison:<instanceId>` for feed/presence;
  broadcasts `node_published` (a post entered the feed) and `reply_upserted`
  (a public reply landed on a post — the comment section / reply map updates
  live, like OaS's `entry_upserted`). A member's own private map edits are local
  + REST.
- LLM endpoints: `POST /unison/chat` (RAG answer + citations), plus an
  embedding-refresh hook on publish/promote.

---

## 6. The collective LLM ("talk to the group")

A retrieval-augmented chat over the community's **published** corpus that
answers in the group's voice and **cites specific thoughts** with deep links.

- **Corpus** = **published** `UnisonNode` layers **plus all public reply
  Entries**, scoped to the community instance. Both are group-visible, so both
  are fair game and both cite cleanly (a node → its author; a reply → "handle,
  in reply to <post>"). Private (unpublished) nodes — including still-borrowed
  drafts — are never indexed. Authors are always named by handle.
- **Index**: embed each published node (topic+thought+context as one chunk, or
  per-layer) and each reply Entry; store vectors. v1 can start with in-Mongo
  cosine over a small corpus (≤50 people → thousands of chunks, not millions) and
  graduate to a vector store only if needed. Refresh on publish, on
  promote-of-a-published-node, and on reply.
- **Answer**: retrieve top-k chunks → prompt the model → stream response →
  attach `citations: [{ kind: 'node'|'reply', nodeId, layer?, replyId?,
  ownerHandle, anchorUrl }]`. Every claim links back to `/unison/n/<nodeId>` (a
  node layer) or the reply on that post, and names the author's handle — no
  anonymization.
- **Guardrails**: answer *only* from retrieved group content ("here's what the
  group has said…"); refuse/deflect when the corpus is silent rather than
  hallucinate; never leak private nodes.
- `UnisonThread` persists chat history per user for continuity.

### Provider-agnostic model port (integration principle)

The whole LLM surface talks to **one narrow, model-shaped interface** — the app
never imports a vendor SDK directly. Swapping the model behind it is a config
change, not a code change.

```ts
// The only shape the app knows about.
interface ChatModel {
  // messages in → streamed text out; structured citations assembled by the
  // caller from the retrieval set, not parsed from model output.
  stream(req: {
    system: string;
    messages: { role: 'user' | 'assistant'; content: string }[];
    signal?: AbortSignal;
  }): AsyncIterable<string>;
  embed(texts: string[]): Promise<number[][]>;  // same port serves the index job
}
```

- **One adapter, config-selected.** Concrete adapters (`claude`, `openai`,
  `gateway`, `local`) live behind a factory keyed off env
  (`UNISON_MODEL_PROVIDER`, `UNISON_MODEL_ID`, base URL, key). `routes/unison.js`
  and the embedding job depend on `ChatModel` only.
- **Recommended implementation**: the **Vercel AI SDK** (`streamText` /
  `embed`) — provider-agnostic by construction, so `ChatModel` is a thin wrapper
  over a swappable `model` handle; or point every provider at an **OpenAI-
  compatible `/chat/completions` endpoint** (e.g. Vercel AI Gateway) so one URL
  fronts any model. Either keeps the integration code identical across models.
  *(Pin the concrete adapter + current default model id at build time via the
  `vercel:ai-sdk` skill and the `claude-api` reference — never hardcode a model
  id from memory.)*
- **Default** behind the port: latest Claude. Because the port is the only
  coupling point, moving to another model — or A/B-ing two — touches config, not
  `utils/unisonNodes.js`, the routes, or the client.

---

## 7. Frontend (`apps/unison`, port 4004)

Next.js 16 + React 19 + Tailwind v4, same stack as spectrum. NextAuth credentials
+ signed game token → backend `enforceVerifiedUser`, identical to OaS.

Surfaces:
1. **My Map** — the DAG editor (`@xyflow/react`): add child, marry, edit layers,
   set axes, publish. Own nodes and borrowed nodes coexist here, distinguished by
   color; promoting a borrowed node flips its color in place.
2. **Post view** — read another member's published node (read-only), with its
   **public reply map** below it: a comment section rendered as the aggregate
   resolve grid (every member's stance on the post's axes + their context),
   visible to everyone. The **response composer** is the same axes as an
   editable re-styled resolve grid: place a stance + write context → writes your
   public reply **and** drops a borrowed node on My Map.
3. **Community feed** — recently published across the group.
4. **Ask the Group** — the LLM chat with inline citation chips that deep-link to
   a node layer or a reply on its post.

### Design language — one cohesive, hand-styled system

Unison gets its **own** visual system, the way On a Spectrum did — not a
patchwork of raw shared components. Concretely:

- **Own theme file**: `globals.css` with Tailwind v4 `@theme inline` (no config
  file), a deliberate type + color palette. (Distinct from OaS's paper/ink and
  interView's warm-light; Unison picks its own, but built the same way.)
- **Borrow the interaction, not the skin.** The resolve quadrant/line *logic* —
  the `{x,y}∈[0,1]` model, `QUADRANT_POSITIONS`, pole-A orientation — comes from
  `@hs/activities` as pure logic/types. The **presentation is a Unison-native
  component** styled to match the map, the composer, and the chat — mirroring how
  OaS wrote its own `FrameGlyph`, `GameGraph`, and one `BottomSheet` overlay
  rather than dropping in game components.
- **One graph aesthetic** across My Map, the post-view reply map, and the chat:
  shape = layer, color = origin, dashed = cross-map link. The reply map's dots
  and the chat's citation chips reuse the same node visual vocabulary so a cited
  thought looks like its node.
- Mobile-first `max-w-md` columns with the graph as the one full-bleed surface,
  matching the OaS layout discipline.

Domain: `unison.holoscopic.io`. Add to CORS `CLIENT_URL`. Homepage lists it as
the newest game. Local dev port **4004** (spectrum 4000 · backend 4001 ·
platform 4002 · game 4003 · unison 4004).

---

## 8. Tenancy, membership, privacy

- Community = child `Instance` (`parentInstanceId` → `unison`, slug
  `uni-<code>`), created lazily like OaS rooms; hidden from public instance lists.
- **≤50 gate** enforced on join in `unisonNodes.js` / membership route.
- **Pseudonymous identity**: within a community you are your handle. `User` is
  global; the handle is what every node, reply, and citation attributes to.
- **Private-first**: nodes default `visibility: private`; nothing is community-
  or LLM-visible until published. This is the one privacy contract and must be
  enforced server-side on every read path and in the embedding job. It is about
  *drafts*, not identity — once published there is no redaction.
- **Attribution is always named** by handle (unlike interView's server-side
  author redaction). No anonymization toggle; `toClient`, never `toRedacted`.
- **Replies are public** (D6): the reply map on a post is a comment section
  visible to the whole community — not gated to the post author.

---

## 9. Phasing

- **M0 — Private map**: `UnisonNode` + `UnisonFrame`, DAG editor with child +
  marry (like-with-like), topic-hub + thought authoring (context as click-popup),
  cycle guard, the Unison theme + native resolve component. No networking yet.
- **M1 — Publish, reply & borrow**: publish flow + community feed; the response
  composer writes a public reply Entry **and** a borrowed node; the post view
  shows the live public reply map (comment section). Author's map stays untouched.
- **M2 — Promote**: adding own thought/context flips a borrowed node to own;
  color transition; provenance retained.
- **M3 — Collective LLM**: embed/retrieve/cite chat over the published nodes +
  public replies, behind the provider-agnostic port.
- **M4 — Polish**: notifications, profile history, economy (only if a budget is
  wanted).

---

## 10. Decisions

**Settled (2026-07-24):**
- **D1 — Economy → none for v1.** No stake ledger on nodes; publishing and
  replying are free. Holons reconsidered only as an LLM-query throttle later.
- **D3 — Attribution → always named by handle; no anonymization.** The
  community is pseudonymous and trusted; every published node, reply, and
  citation shows its author's handle. No anon toggle, no privacy redaction, no
  `Entry` schema change. (Drafts still stay private until published — that's a
  visibility gate on *content*, not on *identity*.)
- **D4 — Marriage → a synthesis node, like-with-like only.** `marry(a,b)` mints a
  new node with `parentIds:[a,b]`, `edgeKind:'marriage'`; no cross-kind marriage.
  **Thought⨯Thought → a synthesis thought** that inherits its topic — if the two
  parents sit under different topics it inherits the **first-selected** parent's
  topic. **Topic⨯Topic → a new merged topic hub** (author names it). Gesture:
  **tap one node, tap a second, then Marry** (MAP-2).
- **D5 — Response layers → a response is always Context.** The composer captures
  a stance (position) + context prose; layer shape-coding describes a node's role
  in the DAG, not a response-time choice.
- **D2 — Response = two records.** Responding writes **both** a public reply
  `Entry` on the post (`activityId = postNodeId`, `position`, `text` — powers the
  reply map, never mutates the post's nodes) **and** a **borrowed `UnisonNode`**
  on the responder's own map (`origin:'borrowed'`, `sourceNodeId`,
  `sourceEntryId`). Adding your own thought/context **promotes** the node to
  `origin:'own'`. (Supersedes both the original "satellite on the author's map +
  adopt" model *and* the interim "everything is a node, Entry unused" model: the
  `Entry` collection is back, for replies only, zero schema change.)
- **D6 — Replies are public.** The reply map on a post is a comment section
  visible to the whole community, like a normal blog — not author-only.

**Settled UI flows (2026-07-24) — interaction layer:**
- **D7 — Navigation → Map is home.** My Map is the persistent home surface; Post /
  Feed / Ask open as overlays over it, then dismiss back to the map. (Mobile-first,
  graph as the one full-bleed surface.)
- **D8 — Borrow landing → silent + structure-mirroring.** Responding drops the
  borrowed thought silently (a toast, no placement prompt), recreating the post's
  structure on the responder's map: filed under the source's **topic** with the
  **thought as title**. Reuse the responder's matching topic hub if one already
  exists (match by trimmed, case-insensitive label), else create it.
- **D9 — Reply map → always visible + upvotable.** The reply map shows under every
  post (empty / one / many), blog-comment style; the post author can join.
  Replies are **upvotable** — reuse the `Entry.voterIds`/`voteCount` mechanic (free
  in v1, no economy) so the group rallies behind a shared sentiment instead of
  re-typing it. (Inherited caveat: re-positioning your own reply resets others'
  upvotes on it.) Presentation: aggregate resolve grid on top (the original resolve
  dot layout) + comment list below.
- **D10 — Feed → switchable ordering.** The community feed offers recency (flat,
  default), by-topic, and by-author lenses via a reorder control — not one fixed
  shape.

**Still open:** _(none blocking — M0 backend foundation landed; next is M0b routes
+ the M0 frontend scaffold.)_
```
