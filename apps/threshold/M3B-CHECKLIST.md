# M3b — Threshold audio, the app half

M3a (durability) is done: shares are mirrored off-site on write and swept nightly. This is the
half that needs a frontend and some accounts.

---

## Yours — provisioning

Nothing below can be done from the repo; each one creates or configures an account resource.

- [ ] **A Vercel project for Threshold.** Root Directory `apps/threshold`, framework Next.js. Same
      shape as `holoscopic-app-chorus`. Name it deliberately — the onrender/Vercel hostname is
      minted from the name at creation and never follows a rename (see the warning at the top of
      `render.yaml` for how that bites).
- [ ] **A Blob store for Threshold.** See *Open question 1* below. **Local development already
      works** — `apps/threshold/.env.local` points at the shared dev store, where the `threshold/`
      pathname prefix keeps objects clear of Chorus's `memorial/` ones. That is a testing
      convenience, not the production answer.
- [ ] **Connect that store to the Threshold Vercel project in BOTH environments.** Connecting is
      what injects `BLOB_READ_WRITE_TOKEN`; a store connected to nothing leaves production with no
      token while local development keeps working from `.env.local`, so it fails in exactly one
      place and reads like a code bug.
- [ ] **`threshold.holoscopic.io`** pointed at that project (only when you want it public).
- [ ] **Add the origin to `CLIENT_URL`** on the production backend, and the preview origin to the
      preview backend. Skipping this looks completely healthy until the first browser write —
      the trap that cost a phone test last time (`apps/chorus/PREVIEW.md`).

## Mine — buildable the moment the above exists

- [x] **`apps/threshold` scaffold** — Next 16 + React 19 + Tailwind v4, `@theme inline`, port 4006.
      Every route in PLAN §9.1 exists, plus the NextAuth stack, the API client and the wire types.
      `/t/<urlName>` does a real snapshot fetch and routes to the live phase; the four undesigned
      surfaces render a placeholder naming the § that will decide them. Builds clean, 12 routes,
      `tsc --noEmit` passes. **The visual language in `globals.css` is a holding pattern, not a
      decision** — §9.2 is still open, and so are Q10/Q11.
- [x] `Beacon.tsx` — the fifth copy, and `'threshold'` added to `utils/traffic.js#APPS`.
- [x] `/api/audio/upload` — the Blob client-token route, shaped after Chorus's, `threshold/` prefix
      enforced in `onBeforeGenerateToken`. Probed locally: a `memorial/` path is refused, a
      `threshold/` path mints a client token, and no token in the environment returns a specific 503
      rather than an opaque 500 mid-upload.
- [x] The recorder UI (`components/Recorder.tsx`) driving `useRecorder`, with the seed's own
      `secondsPerNote` as the cap — read back off the seed, never a constant. Visible countdown from
      ten seconds out, and Threshold's words for the three error codes, each naming typing as the
      way through. Verified in a browser as far as a machine without a microphone can go.
- [x] Playback (`components/Playback.tsx`) driving `usePlayer`, with `PlayerProvider` in the root
      layout so two stories can never talk over each other. It sits above the two targets in the
      ranking queue — listening and placing are the same gesture — and inside the expanded story on
      the reveal, never on every dot.
- [ ] **A real recording on a physical iPhone**, and on Android. This is the only item left, and it
      is the one that has to be done by a person holding a phone.

## Transcription — **DONE**, and it needed no provisioning

Transcription is entirely backend: the enqueue calls Deepgram with the stored audio URL, and the
callback lands on the backend, not the frontend. None of it waited on a Vercel project.

- [x] **`utils/transcribe.js`** — the generic core, extracted from `memorialTranscribe.js`. Of its
      ~178 lines only six were ever Chorus-specific; everything else, **including the HMAC that is
      the only thing stopping a stranger rewriting what somebody said**, was shared. A sibling would
      have duplicated a forgery guard.
- [x] `memorialTranscribe.js` is now a ~30-line adapter with an **unchanged exported surface**, so
      `routes/memorial.js`, `websocket-server.js` and `memories.js#setTranscriber` needed no edits.
      Its 13 existing tests pass untouched, and the callback URL is byte-identical — verified,
      because a token minted before the refactor has to keep verifying when Deepgram calls back
      minutes later, across a deploy.
- [x] `utils/thresholdTranscribe.js` — the sibling adapter, also ~30 lines.
- [x] `POST /api/threshold/hooks/deepgram` — mounted **outside** `enforceVerifiedUser` (the vendor
      has no account), reads its share from `?s=`, authenticated by the `?t=` HMAC alone. It never
      touches `req.instanceId`: `resolveInstance` never fails, so it would fall through to the
      default interView edition and write the transcript into whatever answered.
- [x] `/health` gains nothing new — the existing `transcription` field already reports the shared
      Deepgram config, and it does not gate health because audio records and plays without it.

---

## Open questions, in the order they block things

**1. Does Threshold get its own Blob store, or share Chorus's?**

Sharing is cheaper to set up and means one store per environment to keep track of. Separate is
safer: the pathname prefixes (`memorial/…` vs `threshold/…`) already keep objects from colliding,
but a store is also the blast radius of a mistake — deleting or replacing one takes everything in
it, and Chorus's store holds recordings belonging to people who are dead. My recommendation is
**separate**, on the grounds that the two products have nothing to do with each other and the only
cost is a few minutes of setup.

**2. ~~How long is a transcript allowed to take?~~ SETTLED: it gates nothing, ever.**

A transcript is a bonus. A story with none shows its player alone — no spinner, no waiting state,
nothing that implies something is missing. The alternative, blocking the rank phase until Deepgram
answers, hands a third party the power to freeze a group's week, which is the same failure D5's
ticker exists to prevent. `components/Playback.tsx#StoryText` is where this lives: typed text
first, then a `ready` transcript, then nothing.

**3. ~~Is typing a first-class path?~~ SETTLED: yes, and it is offered in the same breath.**

Ranking means comparing up to two dozen stories, and reading is far faster than listening — a group
that mostly types gets a better sorting round, not a degraded one. So every surface that offers the
recorder offers typing beside it without apology, every recorder error names typing as the way
through, and a browser that cannot record says so and points at the textarea. The funnel has always
accepted either; the UI now says so.
