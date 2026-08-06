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
- [ ] **A Blob store, or a decision not to have one.** See *Open question 1* below — this is the
      one item with a real choice in it, and it changes what the rest of the list says.
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
- [ ] `/api/audio/upload` — the Blob client-token route. One route, copied in shape from Chorus's,
      with `allowedContentTypes` taking the **base** mime type only (no `codecs` parameter — the
      spacing differs per browser and Blob matches by exact string).
- [ ] The recorder UI driving `@hs/audio`'s `useRecorder`, with the seed's `secondsPerNote` as the
      hard cap. The hook already auto-stops; what is new is the visible countdown and Threshold's
      own words for the three error codes.
- [ ] Playback inside the ranking surface, driving `usePlayer`. **Blocked on §6.2** — there is no
      ranking surface to put a player inside of until the gesture is decided (Q1).

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

**2. How long is a transcript allowed to take before the ranking surface stops waiting for it?**

Chorus can be relaxed — a memory shows its transcript whenever it arrives. Threshold cannot: the
rank phase may open minutes after the last share, and a story with no transcript yet is one the
group has to listen to rather than skim. Options are to show whatever exists, to block the phase
opening on transcripts (bad — it lets a vendor outage stall a circle), or to treat the transcript
as a bonus that never gates anything. I lean to the third, but it makes transcripts unreliable at
exactly the moment they are most useful, so it is worth a decision rather than a default.

**3. Is audio even required for a share, or is typing a first-class path?**

The brief describes voice notes. But the ranking task involves comparing up to 24 stories, and
reading is far faster than listening — the current funnel already accepts either, and a group that
mostly types would have a much better ranking experience. Worth knowing whether that is a
degradation to tolerate or a mode to support properly.
