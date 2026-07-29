# Chorus — Master Plan (draft v0.1)

*Working name.* Many voices, one person. Sits naturally beside Synthesis in the naming family and
is trivially renamed — nothing below depends on the word. Alternatives considered: Recollect,
Kindred, Memoriam.

**One deployment = one person.** A Chorus instance is a memorial (or a tribute — the subject need
not be dead) for a single named person. Anyone with the link can add a memory without an account.
Later this becomes a widget inside the larger community app, where many people each have their own
collection; §11 lists the small set of things we do *now*, at ~zero cost, to make that a routing
change rather than a rewrite.

Local dev port **4005**. Ships to `chorus.holoscopic.io` (add to backend `CLIENT_URL` at cutover).

---

## 1. The product in one screen

A visitor lands on a photo of Ellen, her name, a few lines about her, and a wall of memories other
people left. One button: **Share a memory.** The compose flow is a sentence with blanks:

> This is a story where **Ellen** was `[ + ]` and I was `[ + ]` having an experience of `[ + ]`.

Tapping a blank opens a drawer of tag chips; you pick as many as fit, or type your own. The
sentence fills in as readable prose — that filled sentence *is* the thing people screenshot and
send on. Then a short name for the memory, your name (or one tap for **anon**), and the story
itself: typed, or spoken into the phone.

Anyone can browse, filter by tag, read, and listen. On any memory: **Add to this memory** — you
were there too, or you remember it differently. Linked memories travel together.

That's the whole app. Everything below is in service of not making it bigger than that.

### What makes it spread (design constraints, not features)

1. **Zero friction to contribute.** No account, ever. The memory is live the instant it's posted.
2. **The sentence is the hook.** A fill-in-the-blank prompt converts far better than a blank
   textarea, and its output is a shareable artifact.
3. **Voice is the differentiator.** A grandchild will not type 400 words. They will talk for 90
   seconds. Recording has to be one tap and never lose audio.
4. **The share moment is post-submit,** not on the landing page. Right after you contribute is the
   only moment you'll forward the link — the confirmation screen is a share sheet.
5. **The collective portrait.** A tag cloud sized by use — *who Ellen was, according to everyone* —
   is the emotional payoff and costs one aggregation query (§7.3).

---

## 2. Core objects

| Object | What it is |
|---|---|
| **Memorial** | The subject. Not a document — it's the `Instance` plus `Instance.config.memorial` (photo, name, blurb, seed tags, curator key). |
| **Memory** | One person's story. Title, the three tag slots, a sharer name (or anon), and a body that is text, audio, or both. |
| **Thread** | A set of memories about the same moment, formed by *Add to this memory*. Every memory belongs to exactly one thread, usually alone. |
| **Tag** | A chip in one of **two** vocabularies. Seeded by the curator, extended by contributors, deduped case-insensitively, ranked by use. |
| **Contributor** | An anonymous, server-minted identity in the browser. Owns edit/delete rights on its own memories. Never displayed. |

### 2.1 The two tag vocabularies

The prompt has three blanks but only **two** vocabularies — settled by the request, and it's the
right call:

- **`role`** — fills *both* "**Ellen** was ___" and "**I** was ___". One shared word list.
  (*teacher, the new kid, stubborn, patient, in over my head, a stranger*)
- **`experience`** — fills "having an experience of ___".
  (*being seen, getting lost, first jobs, grief, laughing too hard, being forgiven*)

Sharing one vocabulary across the first two blanks is the good accident: filtering on `stubborn`
surfaces every story where *somebody* was stubborn, whichever side of it they were on. Keep that.

Each slot is **multi-select**. Chips join with `&` in the rendered sentence.

---

## 3. Data model

Two new collections, both instance-scoped like everything else in this repo. Precedent is Synthesis:
its content didn't fit `Entry`'s shape (position / vote / text), so it got `SynNode` and a
dedicated write funnel. Same reasoning here — a memory has audio, a transcript, three tag slots,
and an anonymous author. It is not an `Entry`. The root CLAUDE.md rule ("never write the entries
collection outside `utils/entries.js`") is respected by not touching `Entry` at all.

### 3.1 New: `Memory`

```js
{
  id:          String,   // short random, per repo convention; schema opts { id: false }
  instanceId:  String,   // the memorial — indexed, on every query, no exceptions

  title:       String,   // "short name", <= 80
  sharerName:  String,   // '' means anonymous; render "Anonymous"
  contributorId: String, // anonymous device identity (§5). NEVER returned to clients.

  // Three display slots, two vocabularies. Values are MemoryTag ids.
  subjectTags:    [String],  // "<Name> was ___"      (role vocabulary)
  selfTags:       [String],  // "I was ___"           (role vocabulary)
  experienceTags: [String],  // "an experience of ___" (experience vocabulary)
  // Denormalized union of the three, for the multikey filter index. Written by
  // the funnel only — the same trick as Entry.voterIds.
  allTags:        [String],

  body: {
    kind: 'text' | 'audio' | 'both',   // at least one required
    text: String,                       // <= 5000
    audio: {
      url:        String,   // Vercel Blob public URL — host-allowlisted server-side
      pathname:   String,   // memorial/<instanceId>/<memoryId>.<ext>
      mimeType:   String,
      sizeBytes:  Number,
      durationMs: Number,   // measured CLIENT-side; see §6.4 (iOS lies)
      peaks:      [Number], // ~64 amplitude samples for the static waveform
      transcript: {
        text:      String,
        status:    'pending' | 'ready' | 'failed' | 'skipped',
        provider:  String,
        updatedAt: Date,
      },
    },
  },

  threadId:  String,  // === own id when standalone; see §3.3
  replyToId: String,  // the memory this was added to, for "added to Ray's memory"

  status:       'live' | 'hidden' | 'removed',
  hiddenReason: String,
  flagCount:    Number,
  flaggerIds:   [String],   // contributorIds, dedupe only

  ipHash:    String,   // salted hash, abuse throttling only — never a raw IP
  createdAt: Date,
  updatedAt: Date,
}
```

**Indexes**
- `{ instanceId: 1, status: 1, createdAt: -1 }` — the wall, cursor-paginated.
- `{ instanceId: 1, allTags: 1 }` — multikey tag filter.
- `{ instanceId: 1, threadId: 1 }` — a thread in one query.
- `{ instanceId: 1, contributorId: 1 }` — "your memories", ownership checks.

### 3.2 New: `MemoryTag`

```js
{
  id, instanceId,
  set:    'role' | 'experience',
  label:  String,   // as typed:   "In over my head"
  key:    String,   // normalized: "in over my head"  — dedupe axis
  origin: 'seeded' | 'contributed',
  useCount: Number,
  hidden:   Boolean,   // curator can retire a tag without orphaning memories
  createdAt: Date,
}
```

Unique on `{ instanceId, set, key }`. Two contributors typing "In Over My Head" and "in over my
head" get one tag and stay comparable — the same dedupe-on-normalized-key move as `SynFrame`
and `OasFrame`. `useCount` orders the picker, so the vocabulary self-organizes toward what people
actually say. Contributed tags become visible to everyone on first use; that emergent shared
language is the point.

Guard rails: label <= 24 chars, max 2 *new* tags minted per blank per submission, curator can
`hidden: true` a tag (it disappears from pickers and filters; memories keep it in their arrays and
just stop rendering it).

### 3.3 Threads — why `threadId` and not a link array

*Add to this memory* only ever attaches to an **existing** memory. It can never merge two
established threads. That single constraint means a flat `threadId` is sufficient and correct:

- Standalone memory: `threadId = own id`.
- Added memory: `threadId = target.threadId`, `replyToId = target.id`.

A whole cluster is one indexed query, membership is transitive for free, and there's no
union-find, no link-array fan-out, and no way to build a cycle. "Linked memories appear whenever
one of them is selected" is literally `find({ instanceId, threadId })`.

### 3.4 Extend: `Instance.config.memorial`

Additive subdoc on `instanceConfigSchema`, exactly like the existing `oas` block. Nothing about
the subject lives in env vars or in the frontend build — that's §11's cheap insurance.

```js
memorial: {
  subjectName:     String,        // "Ellen"
  subjectPhotoUrl: String,        // Blob or any URL
  blurb:           String,        // few lines under the name
  lifespan:        String,        // free text, optional — "1941 – 2024"
  promptTemplate:  String,        // default: "This is a story where {name} was {role}
                                  //  and I was {role} having an experience of {experience}."
  seedRoleTags:       [String],   // curator preloads
  seedExperienceTags: [String],
  allowCustomTags: { type: Boolean, default: true },
  audioMaxSeconds: { type: Number,  default: 180 },
  curatorKey:      String,        // random 32-char, minted at creation (§8)
  accent:          String,        // one CSS accent colour
}
```

The memorial instance runs `config.mode: 'explore'`, which the `Instance` model already defines as
"holon economy off entirely." **Chorus has no token economy, no quorum, no stakes.** It is the
first app in the repo that has none, and that should stay true.

Curator edits these fields in the existing platform admin (`apps/platform` → `/instances/[id]`
config tab). No new admin surface in v1.

---

## 4. Backend surface

`apps/backend/routes/memorial.js`, mounted **without `enforceVerifiedUser`**:

```js
app.use('/api/memorial', memorialLimiter, memorialRoutes);
```

That middleware only bites when a request carries `x-user-id` / `body.userId`; Chorus never sends
either, so mounting bare is about declaring intent, not dodging a guard. It gets its own stricter
`express-rate-limit` bucket (writes: ~10/hour/IP) because anonymous writes are the abuse surface.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/config` | Subject + both tag vocabularies + counts. **One call boots the app.** |
| `POST` | `/session` | Mint a contributor id + signed token (§5) |
| `GET` | `/memories` | `?tags=&thread=&cursor=&limit=` — live only, cursor-paginated |
| `GET` | `/memories/:id` | The memory **plus its whole thread** |
| `POST` | `/memories` | Create. Contributor token required |
| `PATCH` | `/memories/:id` | Edit own, within the edit window |
| `DELETE` | `/memories/:id` | Delete own |
| `POST` | `/memories/:id/flag` | Visitor report |
| `GET` | `/tags` | Both vocabularies with `useCount` (drives picker + portrait) |
| `POST` | `/hooks/deepgram` | `?token=` — transcript callback (§6.3) |
| `GET`/`POST` | `/curate/*` | `?k=<curatorKey>` — list all incl. hidden, hide/unhide, retire a tag |

### 4.1 The write funnel

`apps/backend/utils/memories.js` is the **single write funnel** for both new collections —
create, edit, hide, flag, thread join, tag mint/dedupe/count. Routes are thin wrappers that do
request shaping, ownership checks, and error-status mapping, and nothing else. Same shape as
`utils/synNodes.js`.

It takes an injectable `store` parameter defaulting to `mongoStore`, so `memories.test.js` runs
under `node --test` with fakes — no DB, no Blob, no Deepgram. That's why the Synthesis tests are fast
and offline; keep the property.

Invariants the funnel owns:
- `allTags` is always the union of the three slots. Never written from a route.
- `threadId` defaults to the new memory's own id.
- Tag mint is dedupe-on-key and bumps `useCount` atomically.
- An audio `url` must be on the allowlisted Blob host. A client cannot point a memory at
  arbitrary remote audio.
- `contributorId` is stripped from every client-facing projection (`toClient`).

### 4.2 Realtime

`sockets/memorial.js` — one room per memorial, `memory_created` / `memory_hidden` /
`transcript_ready` broadcasts, so an open wall animates in new memories. Read-only channel; every
mutation stays REST, matching OaS and Synthesis. Optional at M1, worth it by M3 — a wall that grows
while a family sits with it open is the emotional core.

---

## 5. Identity: nobody logs in

**Contributors.** On first visit the client calls `POST /session`. The server mints
`contributorId` (uuid8) and returns it inside an HMAC-signed token (`GAME_TOKEN_SECRET`, the
existing shared secret). Client stores it in `localStorage`; every write sends
`x-contributor-token`. Middleware `resolveContributor` verifies the signature and attaches
`req.contributorId`.

This buys exactly two things and no more: **ownership** (edit/delete your own memory) and
**throttling**. It is not authentication, it does not survive a cleared browser, and the design
must never depend on it doing so. Losing your token means losing the ability to edit — an
acceptable, near-invisible failure.

**Sharer name** is free text with an **anon** toggle right beside it — one tap, greys the field,
stores `''`. Anon must be as easy as typing a name, or people who feel they don't belong in the
story won't post at all.

**Curator** authenticates with nothing but the `curatorKey` in a URL: `/curate?k=…`. That link can
be texted to a family member with no holoscopic account. It's the right primitive for the
multi-collection future and costs one random string today.

---

## 6. Audio

**Vercel Blob for storage + Deepgram for transcription.** The critical property: audio bytes never
touch Render. The browser uploads straight to Blob; Deepgram pulls straight from Blob; the backend
only ever handles URLs and metadata.

### 6.1 Upload path

```
MediaRecorder → Blob (in memory + IndexedDB stash)
   → POST /api/audio/upload  (Next route handler on apps/chorus, issues a client-upload token)
   → browser PUTs multipart direct to Vercel Blob, with onUploadProgress
   → POST /api/memorial/memories  (Render) with { url, pathname, durationMs, peaks, ... }
```

`@vercel/blob/client`'s `handleUpload` is the only server route the Next app owns. Multipart +
progress matters: a 3-minute recording on a bad cell connection needs a visible progress bar or
people abandon.

Blob URLs are public and unguessable. That's correct for a public memorial wall — don't add
signing complexity that buys nothing.

### 6.2 Playback

`<audio preload="metadata">` against the Blob URL. Blob honours HTTP range requests, so playback
starts immediately and the scrubber works. **No HLS, no transcoding, no Mux** — a ≤3-minute mono
Opus voice clip is ~1.5 MB and doesn't need any of it.

One **global player context**: exactly one memory plays at a time, playback survives scrolling and
navigation between wall and memory page. Cards play inline — tapping play must never navigate.

### 6.3 Transcription

On create, the funnel fires a Deepgram job (`nova-3`, `smart_format`, `punctuate`) with a
`callback` pointing at `POST /api/memorial/hooks/deepgram?token=…`. Deepgram fetches the audio from
the public Blob URL itself. The callback verifies the token, resolves the memory, writes
`transcript.text` and `status: 'ready'`, and emits `transcript_ready`.

Fire-and-forget, like Synthesis's index hooks: no `DEEPGRAM_API_KEY` → `status: 'skipped'` and the app
degrades cleanly (audio still plays, it's just not searchable or readable). Transcription must
never be able to fail a submission.

Transcripts pay for themselves three times: accessibility, a "read instead" toggle for people who
can't play audio right now, and full-text search later.

### 6.4 Recording gotchas — read these before writing the recorder

- **Feature-detect the mime type.** `audio/webm;codecs=opus` on Chrome/Android/Firefox;
  `audio/mp4` on Safari/iOS. Use `MediaRecorder.isTypeSupported` — do not hardcode webm, it is the
  single most common way voice recording ships broken on iPhone.
- **iOS mp4 files frequently carry no duration metadata.** Time the recording client-side with a
  timer and store `durationMs` yourself. Never read duration back off the file.
- **`getUserMedia` needs a user gesture on iOS** and must be called from the tap handler directly,
  not after an await.
- **Stash the recording in IndexedDB before uploading.** Losing someone's recorded memory to a
  failed upload or an accidental refresh is the worst possible failure in this app. On failure keep
  the sheet open with a Retry that reuses the same blob; on reload, offer to restore.
- **Tap-to-start / tap-to-stop, not hold-to-record.** Hold is unusable past ~20 seconds.
- Sample amplitude off an `AnalyserNode` while recording into ~64 ints for the static waveform —
  free, and it's most of what makes the player feel designed.
- Cap at `audioMaxSeconds` (default 180) with a visible countdown from `-0:30`.

---

## 7. Frontend (`apps/chorus`, port 4005)

Next.js 16 + React 19 + Tailwind v4 (`@theme inline` in `globals.css`, no config file), matching
Synthesis and spectrum. **No NextAuth** — the first app here without it.

### 7.1 Routes

| Path | What |
|---|---|
| `/` | Landing: photo, name, blurb → the wall → filter chips → tag portrait |
| `/m/[id]` | One memory + its thread + *Add to this memory* |
| `/share` | Compose as a page, for QR codes and deep links (it's a sheet everywhere else) |
| `/curate` | `?k=` moderation |
| `/api/audio/upload` | Blob client-upload token handler — the only server route |

### 7.2 Compose — one sheet, four steps, thumb-reachable

```
┌──────────────────────────────┐
│  This is a story where       │
│  Ellen was  [ + ]            │   ← tap a blank → bottom drawer of chips
│  and I was  [ + ]            │     search field doubles as "＋ add 'stubborn'"
│  having an experience of     │     multi-select, joins with &
│  [ + ]                       │
├──────────────────────────────┤
│  Give it a short name        │
│  Your name    [ anon ]       │   ← one tap greys the field
├──────────────────────────────┤
│   [ Type ]    [ Record ]     │   ← two big tabs
│                              │
│        ●  0:42  ▁▃▇▅▂        │   ← live timer + waveform, tap to stop,
│                              │     review player, re-record
├──────────────────────────────┤
│      Share this memory       │
└──────────────────────────────┘
```

The sentence must stay readable as it fills. That's the whole design bet: it turns a form into a
piece of writing you're proud of before you've written anything.

Post-submit lands on `/m/[id]` with a `navigator.share` sheet prefilled — *"Send this to someone
who knew Ellen."* Dignified, not celebratory: no confetti on a memorial.

### 7.3 Browse

- **Wall** — stacked cards: title, the filled sentence in small type, sharer name, an audio pill
  with duration (inline play), and `+3 added` when the thread has siblings.
- **Filter** — a horizontally scrolling chip rail; active filters as a removable row. One flat
  filter across all three slots (§2.1).
- **Tag portrait** — the vocabulary rendered with size ∝ `useCount`. *Who Ellen was, according to
  everyone.* One aggregation over `MemoryTag`. This is the screenshot.
- **Thread view** — on `/m/[id]`, siblings appear beneath as *Also on this memory*.

### 7.4 Visual language

Chorus gets its **own** hand-styled system, like Synthesis and spectrum — not a patchwork of shared
components. Warm, quiet, high-contrast, generous type. Mobile-first `max-w-md` column; the subject
photo is the one full-bleed surface. One overlay pattern (a bottom sheet) used for compose, the
tag drawer, and share. Accent colour comes from `config.memorial.accent`, so each memorial can feel
like its person without a code change.

---

## 8. Moderation & safety

Live-on-submit, curator removes. The sharer sees their memory on the wall instantly — that is what
makes them forward the link — and the curator holds a remove/hide action behind `/curate?k=`.

- `status: 'hidden'` retains the document (recoverable, and it keeps thread integrity);
  `'removed'` is the hard case, curator-only.
- Visitors can flag; `flagCount >= 3` surfaces it at the top of the curator queue but **never**
  auto-hides. Brigading a memorial is easier than moderating one.
- Rate limits: ~10 memories/hour/IP, ~2 new tags per blank per submission.
- The compose sheet says plainly that memories are public before you post. A memorial names a real
  person, and often third parties, who did not consent to any of it. A visible takedown path
  (curator link in the footer, plus a per-memory "request removal") is a requirement, not polish.

An LLM auto-screen (the `ANTHROPIC_API_KEY` is already wired for Synthesis) is a clean later addition
behind the same funnel — deliberately not in v1.

---

## 9. Phasing

| | Scope | Done when |
|---|---|---|
| **M0** ✅ | `Memory` + `MemoryTag` models, `config.memorial`, funnel + tests, `GET /config` + `/memories`, landing + wall against seeded data | The wall renders a real memorial from config with fake memories |
| **M1** ✅ | Compose, text-only, end to end: tag drawers, custom tags, anon toggle, title, `POST /memories`, contributor session | A stranger can post a text memory on a phone with no account |
| **M2** ⚠ | Audio: recorder, Blob client upload, IndexedDB stash, global player, waveform, Deepgram + callback | A 90-second spoken memory records, uploads, plays back, and transcribes |
| **M3** ✅ | Threads, tag filtering, tag portrait, share sheet, sockets | Shippable. This is the public launch cut. |
| **M4** | `/curate`, flags, takedown, perf/a11y pass, export | Safe to hand a family the link and walk away |

Ship-worthy at **M3**; do not launch a memorial without **M4** close behind.

**M2 is verified end to end except for browser capture.** With the `chorus-memories` Blob store,
`DEEPGRAM_API_KEY`, and a cloudflared tunnel supplying `PUBLIC_API_URL`, a real speech file
(generated with macOS `say`) went the whole way: uploaded to Blob → `POST /memories` → the funnel's
hook enqueued Deepgram → Deepgram fetched the audio from Blob → posted back through the tunnel →
the callback wrote the transcript → the memory page rendered it under "Read it instead", verbatim.
Blob serves the audio over HTTP 206 with `accept-ranges: bytes`, so the player scrubs.

The browser half is confirmed too: a recording made in desktop Chrome stored 14s of
`audio/webm;codecs=opus` with **48 captured peaks** and came back transcribed — so mime detection,
the AnalyserNode capture, the client-measured duration, and the client PUT all work.

**iOS Safari is the one untested path.** It takes the MP4 branch, and it is where the
no-duration-metadata workaround and the user-gesture rule actually fire. §6.4 exists for that
browser specifically; treat it as unverified until someone records on an iPhone.

### Settled while building M0

Four things the design above didn't anticipate, all now in the code and the tests:

- **The three tag slots resolve sequentially, sharing one cache** (`resolveSlots`). `subjectTags`
  and `selfTags` draw from the same `role` vocabulary, so "she was stubborn and I was stubborn"
  resolves one key twice; run concurrently, both lookups miss, both mint, and the unique index
  rejects the second write — a 500 on a good memory. Caught by a test, not by review.
- **The wall cursor is a compound keyset** (`<iso>|<id>`), not a bare `createdAt`. Two memories in
  the same millisecond with a page boundary between them silently drop one otherwise. Rare in
  production, certain during seeding.
- **`toClient` carries `replyTo`** (the parent's id/title/sharer). *Add to this memory* prefills
  the parent's title, so without it the wall renders an addition and its original as the same story
  posted twice. Wall cards show "Added to …" in place of the repeated title.
- **`listWall` returns `total`.** A memorial's memory count is a figure people read and repeat, so
  it must not change with pagination.

### Settled while building M1

- **The compose sheet never closes on a failed send.** The draft in those fields is the only copy
  of something that took ten minutes to write. This got tested for real by an unplanned CORS
  failure mid-build: the error surfaced in the footer, the sentence and all three fields survived,
  and the same send succeeded once the origin was allowed. That behavior is the point of the app
  and it should never regress — it's also the shape the M2 recording stash has to take.
- **The client enforces the tag caps too.** `resolveTagLabels` silently drops labels past the
  coin cap, which is right for the server (never fail a memory over a tag) and wrong for the
  client — somebody types three new words, submits, and finds one missing with no explanation.
  `TagDrawer` mirrors `TAGS_PER_SLOT_MAX` and `NEW_TAGS_PER_SLOT_MAX` and says why a control is
  disabled.
- **Clients send tag *labels*, never ids.** A picked tag and a typed-in one become the same code
  path, which is what lets "add your own" live inside the search field instead of behind its own
  control.
- **`.blank-empty` must set `line-height: 1`.** An inline-block inherits the paragraph's line
  height for its own box, so at the sentence's leading its `border-bottom` drifts half a line below
  the baseline — the ruled line detaches from the ＋ sitting on it and reads as a stray mark.

### Settled while building M3

- **New memories are announced, never inserted.** A memorial is read slowly, and
  content moving under someone mid-sentence is worse than a slightly stale wall. A quiet count
  appears; tapping it refreshes and returns to the top. The one exception is a reader already at
  the very top, who has nothing to lose — there it simply refreshes.
- **The socket room is keyed by the RESOLVED instance id, not the slug.** The client had
  `NEXT_PUBLIC_INSTANCE_ID` ("chorus") while the funnel broadcasts to `memorial:<req.instanceId>`
  ("6691dd8d"). The socket connected, the join was accepted, and no event ever arrived — a failure
  with no error anywhere. `GET /config` returns the resolved id for exactly this.
- **Sorting needed `threadCount` denormalized.** A per-request aggregate can't participate in a
  keyset cursor. `syncThreadCount` maintains it on create, hide, unhide and withdraw — missing any
  one leaves the wall ordered by a number that used to be true.
- **Every sort spec ends in `id`.** Without a unique tiebreaker two rows compare equal and a page
  boundary between them drops one. The cursor also carries its sort name, so a cursor minted under
  one ordering can't be replayed against another.
- **Filter state lives in the URL** (`/?tags=a,b`), so the wall stays a Server Component with no
  refetch flicker, a filtered view is a link somebody can send ("every story where she was
  stubborn"), and Back behaves.
- **The card became a stretched link.** Whole-card tappability and clickable tags conflict —
  nested `<a>` is invalid HTML and browsers split the markup, breaking both. An `<article>` whose
  lead line carries `after:absolute after:inset-0` gives both, and everything interactive inside
  needs `relative z-10`. Missing that on `AudioPill` would have made play navigate instead.
- **Tags in a sentence stay ruled; only controls are chips.** The first pass made every tag a
  pill, which quietly converted the signature element into a tag UI — precisely what §7.4 forbids.
- **The filter rail offers only words with `useCount > 0`.** An unused seed tag filters to an
  empty wall, which reads as a broken page rather than an honest empty set.
- **The portrait is `role` tags only.** Experiences describe the moment, not the person; mixing
  them turns a portrait into a word cloud.

### Settled while building M2

- **The recorder needs a `starting` state.** `getUserMedia` does not resolve while the permission
  prompt is on screen — which is *every contributor's first recording* — so between the tap and the
  microphone opening the button was dead, silent, and double-tappable into a second recorder.
- **Transcription is injected (`setTranscriber`), not imported.** Same shape as Synthesis's
  `setIndex`: the funnel never pulls in an HTTP client, the default is a no-op, and a test asserts
  that a throwing transcriber cannot fail the write.
- **The transcript callback must read its instance from the query string.** Deepgram sends none of
  our headers, so `resolveInstance` falls back to the *default* instance and would quietly write
  the transcript into another memorial's namespace. The signed `t` token is likewise the only thing
  stopping a stranger who learns the URL from rewriting what somebody said.
- **Don't enqueue a job whose callback can't arrive.** With no public `PUBLIC_API_URL` (i.e. local
  dev) the enqueue is skipped, because a queued job Deepgram can never call back strands the memory
  on `pending` forever, promising a transcript that will never come.
- **The upload route fails loudly when unconfigured.** A missing `BLOB_READ_WRITE_TOKEN` returns a
  named 503, not an opaque 500 — the failure would otherwise land in the seconds right after
  someone recorded, the worst possible moment for a vague error.
- **Upload before create, and only clear the stash after the memory exists.** If the upload fails
  the sheet keeps a retryable draft and the recording is still in IndexedDB; a memory is never
  posted whose audio silently went missing.
- **The Blob store must be created `--access public`.** `--access` is fixed at creation. A private
  store would force a presigned URL per playback — expiring links on a page people screenshot and
  forward, and no CDN caching — for content that is public by design anyway.
- **The transcriber hook takes named arguments.** The funnel called `transcriber(memory)` while
  `requestTranscript` takes `{ memory }`, so `memory` was undefined, no audio URL was found, and it
  returned `'no-audio'` — every recorded memory silently went untranscribed with nothing logged.
  Both halves had passing tests; the seam between them had none. `memorialTranscribe.test.js` now
  wires the *real* pair together with only `fetch` stubbed, and that test was confirmed to fail
  against the old code.

---

## 10. Decisions (settled)

- **D1** — One instance = one person. Multi-collection is a later routing change, not a data change (§11).
- **D2** — No accounts for contributors, ever. Anonymous signed contributor token, ownership + throttling only.
- **D3** — Live on submit; curator removes. Never a pre-publish approval queue — it kills the share moment.
- **D4** — Two tag vocabularies, three slots. `role` fills both "they were" and "I was."
- **D5** — Contributors mint tags; dedupe on normalized key; `useCount` ranks the picker.
- **D6** — Vercel Blob + Deepgram. Audio bytes never pass through Render. No transcoding, no HLS.
- **D7** — Threads are a flat `threadId`, not a link array — *add-to* can't merge threads, so it's sufficient.
- **D8** — New `Memory` collection, not `Entry`. `Entry` is untouched. Precedent: `SynNode`.
- **D9** — No holon economy, no quorum. Instance runs `config.mode: 'explore'`.
- **D10** — Curator authenticates with a URL key, not an account.
- **D11** — All subject data lives in `Instance.config.memorial`, never in env or the frontend build.

### Deliberately not in v1

Reactions/hearts (emotionally loaded on a memorial — needs thought, not defaults); comments (the
thread *is* the comment); photo/video per memory; a search box (transcripts make it cheap later);
accounts; email digests to the curator; the LLM auto-screen; any holon mechanic.

---

## 11. Preparing for the community-app widget (cost: ~zero)

Everything here is either already required by the repo's own rules or one line:

1. **Every document carries `instanceId`** and every query filters on it — mandatory anyway.
2. **All subject config lives on the `Instance`**, so the same deployed frontend serves any
   memorial. Nothing is hardcoded or baked at build time.
3. **The frontend resolves its memorial from the `x-instance-id` header**, defaulted from
   `NEXT_PUBLIC_INSTANCE_ID`. Swapping that default for a path segment (`/c/[code]`) or a subdomain
   is the *entire* multi-collection change on the read side.
4. **`curatorKey` exists from day one**, so a collection someone else creates already has an owner
   who isn't a holoscopic admin.
5. **Blob pathnames are namespaced** `memorial/<instanceId>/<memoryId>.<ext>` — no reshuffle later.
6. **Tags are per-instance**, so vocabularies never collide across collections.

What's left for the widget version: a create-a-collection route that mints a child `Instance`
(slug `mem-<code>`, `parentInstanceId` set) — the exact pattern OaS rooms and Synthesis communities
already use — plus the routing swap in (3). No migration, no model change.

---

## 12. Open questions

- **Name.** "Chorus" is a placeholder; it's ~30 minutes to change while nothing is built.
- **Curator notifications.** A new memory should probably reach the family somehow. Email needs a
  provider decision (nothing in the repo sends mail today); a digest on the curate page is the
  free version.
- **Export.** Families will want the memories as an artifact — a printable book or a PDF. Big
  emotional payoff, entirely out of v1 scope, worth designing the data for. The model above is
  already sufficient.
- **Curator seeding.** Should the curator be able to plant a handful of memories before sharing the
  link? An empty wall converts badly. Probably yes — it's `isSeed`-shaped and nearly free.
