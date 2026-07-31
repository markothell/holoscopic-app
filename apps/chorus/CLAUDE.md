# Chorus

Memories about one person, collected from anyone with the link. Working name — nothing depends on
it. Local dev port **4005**, ships to `chorus.holoscopic.io` (add to backend `CLIENT_URL` at
cutover). Next.js 16 + React 19 + Tailwind v4 (`@theme inline` in `globals.css`, no config file).

**One deployment serves every memorial.** A memorial is `/c/<slug>`, where the slug is its
`Instance`'s — `/c/chorus`, `/c/chorus-ray`. Its pages are `/c/<slug>/m/<id>` and
`/c/<slug>/curate?k=…`. The root `/` is a front door that never shows a memorial. A new memorial is
therefore a row created in the platform admin (Instances → New → App: Chorus), with no deploy and
no env var — which is what PLAN §11 was built toward, and the whole of what it cost was making
`INSTANCE_ID` a parameter instead of a module constant.

Design source of truth is `PLAN.md` (§-numbered, settled decisions D1–D11 in §10). Read the
relevant § before changing behavior it describes. The Mongoose model files carry long header
comments explaining why each field exists.

**M0–M3 are built and verified**, including a real browser recording (14s of WebM/Opus, 48 captured
peaks, Deepgram transcript) and live socket updates. **iOS Safari is the one path still untested**
— it takes the MP4 branch and the no-duration-metadata workaround. **M4 is partly done**: `/curate?k=` and
reporting are built and verified (no key → 404; a hidden memory leaves the public wall and 404s on
its own page). **Remaining before launch**: an accessibility and performance pass, and export.

**Vercel project is `holoscopic-app-chorus`** (serving chorus.holoscopic.io) — there is no project
called `chorus`, and a `.vercel/project.json` naming one is a stale link that makes every
`vercel env pull` / `env ls` in this directory fail with "project was either deleted or
transferred". Repair with `vercel link --yes --project holoscopic-app-chorus`.

Blob store: `chorus-memories` (public, iad1, `store_eIUuI62jhmFnk5eS` — it was
`store_ELLOQEAjs3dvD6g5` until 2026-07-31, and a token for the old one now fails with *"This store
does not exist"*, which reads like a code bug and is not one). The platform admin writes memorial
subject photos to this same store, so both projects need it connected. **Recording works only if
that store is CONNECTED to the project** — connecting is what injects `BLOB_READ_WRITE_TOKEN` into
each environment. A store connected to nothing (`vercel blob list-stores` → `Projects: –`) leaves
production with no token while local development keeps working from whatever is in `.env.local`,
so this fails in exactly one place and looks like a code bug. The browser reports it as
*"Vercel Blob: Failed to retrieve the client token"*, which is the SDK's message for any
non-token response; `/api/audio/upload` answers a named 503 first so the cause is readable.

    vercel blob list-stores                       # Projects column must name the project
    curl -X POST https://chorus.holoscopic.io/api/audio/upload \
      -H 'Content-Type: application/json' -d '{}'  # 503 = no token, 400 = token present

## The app

A visitor lands on a photo, a name, and a wall of memories. One button: **Share a memory**. The
sheet opens on **two direct questions** — *"Who was Ellen in this story?"* and *"What was this an
experience of?"* — each showing the most-used words from its vocabulary plus a **＋ More** chip that
opens the full list. Then a short name, your name (or one tap for anon), and the story typed or
spoken. On any memory: **Add to this memory**.

**The sentence is how a memory READS, no longer how one is written.** Composing used to happen
inside "This is a story where *Ellen* was ___ and I was ___ having an experience of ___", with each
blank a tappable ＋. Testers could not tell what the ＋ was for and found three clauses too much to
parse, so the form became the two questions above and the middle slot was dropped entirely.
`PromptSentence` still renders the sentence on memory pages and wall cards — that artifact is the
whole product bet and it survives intact.

**`selfTags` ("I was ___") is legacy.** Nothing collects it now; the model, the wire and the
`role` vocabulary all still carry it, and memories written before the change render and filter
exactly as they always did. Every clause of the sentence is independently optional as a result.

## What makes this app different from every other one in this repo

| | Everywhere else | Chorus |
|---|---|---|
| Identity | holoscopic account, NextAuth, game token | **none** — an anonymous signed contributor token |
| Route guard | `enforceVerifiedUser` | **mounted bare**, with its own rate-limit bucket |
| Economy | holons, quorum, stakes | **none** — instance runs `config.mode: 'explore'` |
| Curation | `requireAdmin` + a User role | a `curatorKey` in a URL (`/curate?k=…`) |

None of those are shortcuts — they are D2, D9 and D10, and each exists because a memorial's value
is that someone who knew the person can contribute from a texted link without signing up for
anything. Don't "fix" them by adding auth.

## Architecture

| Where | What |
|---|---|
| `src/app/c/[slug]/` | **One memorial.** `layout.tsx` resolves the slug, 404s an unknown one, and provides it to everything below |
| `src/components/MemorialProvider.tsx` | `useMemorial()` → `{ slug, instanceId, subjectName, api }` for client components |
| `src/services/api.ts` | All HTTP. `memorialApiFor(slug)` binds one memorial; attaches `x-instance-id` and, on writes, `x-contributor-token`. Safe to import from a Server Component — nothing touches `window` at module scope. |
| `src/lib/types.ts` | Wire types, mirroring `utils/memories.js#toClient` exactly |
| `src/components/PromptSentence.tsx` | **The signature element** — the filled sentence at two densities. Read-only; every clause optional |
| `src/components/MemoryCard.tsx` | One memory on the wall. Stretched-link card (see gotchas) |
| `src/lib/filters.ts` | Filter state lives in the URL, so a filtered wall is a shareable link. Every href builder takes the memorial's `base` (`/c/<slug>`) |
| `src/components/tags/TagLink.tsx` | A tag as a filter link — `rule` inside a sentence, `chip` as a control |
| `src/components/tags/FilterRail.tsx` | Active filters + the words people actually used |
| `src/components/tags/TagPortrait.tsx` | *Who she was, according to everyone* — size ∝ `useCount` |
| `src/components/ui/Sheet.tsx` | The one overlay pattern. Sheets stack; only the topmost handles Escape |
| `src/components/compose/ComposeButton.tsx` | Trigger + compose sheet + the post-submit share step. Both entry points, one component |
| `src/components/compose/TagQuestion.tsx` | One question, its most-used words as chips, and the ＋ that opens the drawer |
| `src/components/compose/TagDrawer.tsx` | One question's whole vocabulary. The search field *is* the add-your-own field |
| `src/components/compose/Recorder.tsx` | Tap-to-record, live timer + peaks, review, re-record |
| `src/lib/recorder.ts` | Mime detection, peak resampling, the IndexedDB stash |
| `src/components/audio/PlayerProvider.tsx` | **One** `Audio` element for the whole app |
| `src/components/audio/AudioPill.tsx` | Playback at two sizes, both on that one element |
| `src/app/api/audio/upload/route.ts` | Blob client-upload token — the only server route this app owns |
| `apps/backend/utils/memorialTranscribe.js` | Deepgram enqueue + callback token, injected via `setTranscriber` |
| `apps/backend/routes/memorial.js` | REST surface at `/api/memorial` |
| `apps/backend/utils/memories.js` | **The write funnel** — memories, tags, threads, moderation |
| `apps/backend/scripts/seed-memorial.js` | Creates the memorial instance + seeded memories |

Pages are **Server Components** that fetch on the server with `cache: 'no-store'`. Most visitors
arrive from a text message on a phone with one bar — the wall must be in the HTML, not behind a
client fetch, and a stale wall is the one thing that makes a contributor think their memory didn't
save.

## The write funnel

Never write `Memory` or `MemoryTag` outside `apps/backend/utils/memories.js`. It owns:

- **`allTags`** — always the union of the three slot arrays. The wall's tag filter is a multikey
  index on it, so a stale union means memories silently vanish from filters.
- **Tag minting** — dedupe on normalized key, `useCount` moved by *distinct tag per memory* and by
  *delta* on edit. Nothing ever recomputes counts from scratch, so a wrong delta skews the tag
  portrait permanently.
- **`threadId`** — a new memory heads its own thread; an addition inherits its target's.
- **The blob host allowlist** — an unchecked audio URL is stored content-injection on a public page.
- **`toClient`** — the only client-facing projection. `contributorId`, `ipHash`, `flaggerIds` and
  `curatorKey` never cross the wire.

Funnel functions take an injectable `store` defaulting to `mongoStore`, so `memories.test.js` runs
under `node --test` with no DB, no Blob, no Deepgram. Keep that when adding functions.

## Gotchas

- **Resolve the three tag slots sequentially, sharing one cache.** `subjectTags` and `selfTags`
  draw from the *same* `role` vocabulary, so "she was stubborn and I was stubborn" resolves one key
  twice. Run concurrently and both lookups miss, both mint, and the unique index on
  `{instanceId,set,key}` rejects the second write — a 500 on a perfectly good memory. That's what
  `resolveSlots()` exists for. Still three slots server-side even though the client only fills two:
  the edit path and every memory written before the change carry `selfTags`.
- **The wall cursor is a compound keyset** (`<iso>|<id>`), not a bare `createdAt`. Two memories in
  the same millisecond with a page boundary between them will silently drop one otherwise.
- **`next/font` variables live on the `<body>` class, not `:root`.** Any CSS that resolves
  `var(--font-newsreader)` at `:root` — which is where `@theme` puts its variables — gets an
  invalid value and falls back to system sans, with no error. The rules in `globals.css` reach for
  the `next/font` variables directly.
- **An addition prefills its parent's title**, so wall cards must render `replyTo` ("Added to …")
  rather than the title, or a thread reads as the same story posted twice.
- **The memory card is a stretched link, never a wrapping `<a>`.** The whole card must be tappable
  *and* its tags must be links; an `<a>` inside an `<a>` is invalid and browsers split the markup,
  breaking both. So the card is an `<article>` whose lead line holds a link with
  `after:absolute after:inset-0`, and anything interactive inside it needs `relative z-10` — that
  includes `AudioPill`, or tapping play navigates instead of playing.
- **Tags in a sentence keep the ruled line (`variant="rule"`).** Rendering them as chips there
  turns the signature element into a tag UI, which is the one thing the visual language rules out.
  Chips are for filter *controls* only.
- **The socket room key is the RESOLVED instance id, never the slug.** The URL and the
  `x-instance-id` header carry the slug (`chorus`); the funnel broadcasts to
  `memorial:<req.instanceId>` (`6691dd8d`). Joining on the slug subscribes to a room nothing
  publishes to, and it fails completely silently — the socket connects, the join is accepted, no
  event ever arrives. `LiveWall` takes the id from `GET /config`, which is why `useMemorial()`
  carries both.
- **`resolveInstance` never fails, so `/api/memorial/*` guards on `Instance.app === 'chorus'`.** An
  unrecognised `x-instance-id` falls through to the default interView edition. Before the guard,
  `GET /config` answered for that edition — and its `syncSeedTags` call *wrote* MemoryTag rows into
  it, from an unauthenticated request. The guard 404s (never 403s) so an absent memorial and a
  hidden one look the same. `/hooks/deepgram` is the one exemption; it reads `?i=`.
- **There is no default slug.** `memorialApiFor` takes one and nothing supplies a fallback — a
  wrong guess would show one family another family's memories rather than fail.
- **New models need `{ id: false }`** in schema options, like every model in this repo.
- **The compose sheet must never close on a failed send.** Those fields hold the only copy of
  something that may have taken ten minutes to write. Same rule governs the M2 recording stash.
- **Clients send tag *labels*, never ids**, for the three prompt slots — that's what makes a picked
  tag and a typed-in one one code path. `TagDrawer` mirrors the server's per-slot caps so nothing
  is silently dropped at submit.
- **The sentence renders only the clauses a memory actually has.** `PromptSentence` drops an
  unanswered slot rather than ruling an empty line, and swaps its lead to "This is a story about …"
  when neither *was* clause exists — otherwise a memory with only an experience reads as "This is a
  story where having an experience of grief." It returns `null` when nothing was answered, so any
  caller that frames it (`border-y` on the memory page) must check first or frame an empty box.
- **Audio: never read duration off the file.** iOS writes MP4 with no duration metadata, which
  surfaces as `Infinity` in every player and an un-scrubbable track. The client times the recording
  and that stored number is what the player measures against.
- **Audio: feature-detect the mime type.** Chrome/Android/Firefox give WebM/Opus, Safari and all
  iOS browsers give MP4/AAC. Hardcoding webm constructs a `MediaRecorder` fine and then emits an
  unplayable blob — the classic way this ships broken on iPhone.
- **The transcript callback reads its instance from `?i=`, never `req.instanceId`.** Deepgram sends
  no headers of ours, so `resolveInstance` falls back to the default instance and would write the
  transcript into the wrong memorial. The `?t=` token is the only thing authenticating the caller.
- **Turbopack does not reliably hot-reload `globals.css` here.** A CSS edit that appears to do
  nothing is usually still the old stylesheet, not a bad selector — check the computed value before
  rewriting the rule, and restart `dev:chorus` (deleting `.next`) to pick it up. This has burned
  time twice.
- CORS, two separate things:
  - `X-Contributor-Token` / `X-Curator-Key` must stay in the backend's `allowedHeaders`. Drop them
    and the browser preflight strips the headers, which reads as "everyone is anonymous", not as an
    error.
  - The chorus origin must be in the backend's `CLIENT_URL`. Server-rendered reads work without it
    (server-to-server sends no `Origin`), so the page looks completely healthy right up until the
    first write fails — dev already has `http://localhost:4005`; production needs
    `chorus.holoscopic.io` at cutover.

## Visual language

Chorus has its **own** hand-styled system, like Synthesis and On a Spectrum. **"Eau de nil & dial
light"**: the ground is the pale blue-green of mid-century domestic paintwork — *not* the
cream-and-terracotta a memorial brief defaults to — so it reads as painted plaster rather than
paper and lets photographs carry the warmth. The one accent is amber, the glow of a radio dial,
which is also what a recorded memory literally is. Amber appears in exactly three places: the ruled
blanks, the audio affordance, and the primary action.

Newsreader carries the voice (the sentence, the stories); Archivo is the working hand (names,
labels, controls). Body copy is 17px — this audience skews older than any other app in the repo.

**The signature is the sentence.** Filled answers sit ON a ruled amber line rather than inside a
pill, each answer on its own line with the "&" falling between them. The form is the product, so
the form stays visible in the answer: pills would have made it a tag UI, the rule keeps it a
sentence. Full size on a memory page (the screenshot artifact), compressed on wall cards — twenty
cards each repeating the boilerplate is noise, not rhythm.

## Environment

- `NEXT_PUBLIC_API_URL` (default `http://localhost:4001/api`)
- `NEXT_PUBLIC_ABOUT_URL` — where `/` points for "what Chorus is" (default
  `https://holoscopic.io/chorus`)

`NEXT_PUBLIC_INSTANCE_ID` is gone. Which memorial a page is for comes from its `/c/<slug>` route.

- `BLOB_READ_WRITE_TOKEN` — **required for recording**. Without it `/api/audio/upload` returns a
  named 503 and only typed memories work.

Backend side: `BLOB_HOST_SUFFIX` (default `.public.blob.vercel-storage.com`), `MEMORIAL_IP_SALT`,
and `GAME_TOKEN_SECRET`/`NEXTAUTH_SECRET` — the contributor token and the Deepgram callback token
are both signed with the existing shared secret.

Transcription needs `DEEPGRAM_API_KEY` plus a publicly reachable callback base. **Production derives
that base from `RENDER_EXTERNAL_URL` and needs nothing set** — verified live: with `PUBLIC_API_URL`
absent from Render, `/health` reports `ready` and a recorded memory came back transcribed.
`PUBLIC_API_URL` is an override, for a dev tunnel or a non-Render host; it must include the `/api`
mount point, because the callback path is appended to it. With any of it missing, transcripts stay `skipped` and audio still records and
plays.

**`GET /health` reports `transcription`** — `ready` | `no-api-key` | `no-secret` |
`no-callback-url`. Check it instead of making a test recording and waiting to see whether text
appears. It reports what is CONFIGURED, not what is reachable: a stale `PUBLIC_API_URL` pointing at
a dead tunnel still reads `ready`, which is why `dev-tunnel.js` removes the line on exit and why a
leftover one should be deleted by hand if it survives a crash.

## Running it

```bash
npm run dev:backend    # 4001
npm run dev:chorus     # 4005
node apps/backend/scripts/seed-memorial.js          # the demo memorial + tags + 6 memories
node apps/backend/scripts/seed-memorial.js --reset  # rebuild the seeded memories
```

Then open `http://localhost:4005/c/chorus`. A **real** memorial is made in the platform admin
(`npm run dev:platform`, Instances → New instance → App: Chorus), which provisions the curator key
and starting vocabulary on create; the seed script is for the demo.
