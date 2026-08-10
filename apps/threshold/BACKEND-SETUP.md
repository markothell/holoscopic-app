# Threshold — backend setup

Everything the server side needs before Threshold can take traffic. Each step says what it is for
and how to tell it worked, because most of these fail *silently* — the pattern in this repo is that
a missing piece leaves the app looking healthy right up until one specific thing doesn't happen.

**One new environment variable, and M4 is what added it: `THRESHOLD_URL`.** Every link in circle
mail is built from it (`utils/threshold.js`), falling back to `http://localhost:4006` — so unset in
production means every round-transition email points at a laptop. It is deliberately not
`email.js#appUrl()`, which falls back to the first entry of `CLIENT_URL`, and one backend serves
five apps. **Set on the production service 2026-08-10** to `https://threshold.holoscopic.io`.

Everything else Threshold reads is already set there or has a safe default: `GAME_TOKEN_SECRET`,
`DEEPGRAM_API_KEY`, `BLOB_HOST_SUFFIX` (defaults), `DEEPGRAM_TIMEOUT_MS` (defaults),
`PUBLIC_API_URL` (derived from `RENDER_EXTERNAL_URL`). `render.yaml` needs no edit.

---

## 1. Create the collections and their indexes — **do this first** — **DONE on production 2026-08-10**

```bash
cd apps/backend
NODE_ENV=production node scripts/init-threshold.js --dry-run   # look first
NODE_ENV=production node scripts/init-threshold.js
```

**Order matters here in a way it does not for the other indexes.** Three of them are `unique`, and
they are correctness rather than speed — the upsert keys for a share (one story per pole) and a
ranking (one per person per seed), and a circle's name within an instance. Without them a double
submit creates a second document that `computeResult` counts twice, quietly shifting the agreement
fraction the entire reveal is built on.

`ensure-indexes.js` alone will **not** do it: it skips a collection that does not exist yet (it
prints `⚠ UNIQUE: create it before any write lands`), and Mongo creates a collection lazily on first
write. That leaves a window with data and no constraint. Building a unique index *afterwards* over
rows that already violate it fails outright, and by then the duplicates are real data.

Verified on dev 2026-08-06: creates 7 indexes per collection, idempotent on a second run.

**What the dry run should say.** Three things, and nothing else matters:

1. `cluster: live.ofmfipp` **and** `database: holoscopic-db` — both halves agree, and that name
   means production.
2. `collection does not exist yet` on all three. Expected on a fresh deployment; it is the whole
   reason this script exists rather than `ensure-indexes.js`.
3. These three UNIQUE lines are present — they are the correctness ones:

   ```
   circles            {instanceId, urlName}      UNIQUE
   thresholdshares    {seedId, userId, pole}     UNIQUE   ← one story per pole
   thresholdrankings  {seedId, rankerId}         UNIQUE   ← one ranking per person
   ```

   (`{id:1} UNIQUE` on each is the standard custom-`id` index every model here has.)

Counts should read **circles 6, thresholdshares 6, thresholdrankings 6** declared. A circles count
of 5 means an out-of-date checkout: `{instanceId, seeds.id}` was briefly specified in
`ensure-indexes.js` without being declared on the schema, which would have left production one index
short of what the specs claim — `init-threshold.js` builds what the SCHEMA declares. Fixed
2026-08-06; the two must always agree.

**Confirms:**

```bash
NODE_ENV=production node scripts/ensure-indexes.js
# every circles/thresholdshares/thresholdrankings line reads OK — already present.
# No SKIP lines, and created: 0.
```

## 2. Create the Threshold instance — **DONE on production; the slug is `circlemo`**

Platform admin → **Instances → New instance → App: Threshold**. Give it a slug (e.g. `threshold`).

**Production's instance is slugged `circlemo`, not `threshold`** (id `2412ytht`, app `threshold`,
`config.mode: 'explore'`, `gameNumber: null`), and the deployed frontend sends that as
`x-instance-id` — `NEXT_PUBLIC_INSTANCE_ID=circlemo` on the Vercel project. Dev's is slugged
`threshold`, which is why `apps/threshold/.env.local` and the documented default disagree with
production. A probe carrying the wrong one reads as **`{"error":"Not found"}`** — `assertOwnApp`,
after `resolveInstance` fell through to `getDefault()` and answered with an interView edition.
`{"error":"Circle not found"}` is the healthy answer, and the two are worth telling apart before
going looking for a CORS or auth problem that isn't there.

**A `domains[]` entry is a bare host, never an origin.** `Instance.findByDomain` strips the scheme
off the incoming `Origin` and matches what is stored, so `https://threshold.holoscopic.io` there
can never match anything and every request without an `x-instance-id` header lands on the default
instance instead. Production held exactly that until 2026-08-10; it now holds
`threshold.holoscopic.io`, which is the form `g1` has always used.

The backend already accepts it: `Instance.app` has `'threshold'` in its enum, `POST /api/instances`
has it in `APPS`, and creating with that app sets `config.mode: 'explore'` — which is what switches
the holon economy off (D7: nothing in Threshold is scarce, so there is nothing to stake on).

**`gameNumber` stays null, and must.** `Instance.getDefault()` picks the lowest-numbered active
instance, so a Threshold instance holding a number could become the platform default and start
answering unrelated traffic. Verified: the model leaves it null for any app but interView.

**Confirms:** the instance appears in the admin list with app `threshold`, and
`GET /api/instances` still returns the same default as before.

Do the same on **dev** for local work — the collections and indexes are already there.

## 3. Add the origins to `CLIENT_URL`

`CLIENT_URL` is an exact-match CORS allowlist, read **once at boot**.

| Service | Add |
|---|---|
| `holoscopic-websocket-server` (production) | `https://threshold.holoscopic.io` |
| `holoscopic-preview-backend` | the Vercel preview branch URL for Threshold |

**This is the step that looks fine and isn't.** Server-rendered reads send no `Origin`, so pages
render perfectly; the first *browser* write is what fails. It cost a phone test on 2026-08-05.
`curl` misses it for the same reason, so reproduce a browser request:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://whorl-websocket-server.onrender.com/api/threshold/circles \
  -H 'Origin: https://threshold.holoscopic.io' -H 'Content-Type: application/json' -d '{}'
# 403 with {"error":"Origin not allowed: …"} = CLIENT_URL is missing it.
# Anything else (401/400/404) = CORS passed, which is all this checks.
```

**And changing an env var through Render's API does not restart the service** — the value is stored,
`PUT` returns 200, and the running process keeps the old list. A `POST /restart` did not take
either. Triggering a deploy is what worked:
`POST /v1/services/<id>/deploys {"clearCache":"do_not_clear"}`. Editing in the Render dashboard
redeploys normally.

## 4. Nothing to do for transcription, mirroring, or backups

Listed so you don't go looking:

- **Transcription** shares Chorus's `DEEPGRAM_API_KEY` and derives its callback base from
  `RENDER_EXTERNAL_URL`, so production needs nothing set. `GET /health` reports `transcription`,
  and it does not gate health — audio records, plays and ranks without it.
- **Off-site mirroring** uses the same `BACKUP_S3_*` variables already on the web service.
  `GET /health` reports `mediaBackup: ready`.
- **The nightly sweep** (`scripts/backup-blobs.js`) already covers Threshold shares — same cron,
  same bucket, so "is every recording backed up?" stays one question with one answer.
- **The round ticker** starts with the process (`jobs/index.js`, logged as
  `⏱️  Circle rounds every 60s`). It is the primary advancement path, not a fallback: nobody has a
  Threshold page open, and the phase transition is what sends the email that brings people back.

## 5. After deploy — three checks

```bash
curl -s https://whorl-websocket-server.onrender.com/health
```

- `apiRoutesLoaded: true` and `mongodb: connected` — otherwise every `/api` request 500s
- `mediaBackup: ready` — otherwise recordings have no off-site copy
- The logs show `⏱️  Circle rounds every 60s` — otherwise circles never advance and no mail is sent

Then, once the frontend exists, the end-to-end check is `scripts/check-circles.js` — but **dev
only**; it writes test data and refuses any other database.

---

## Deliberately not on this list

**Mail.** Threshold sends round-transition email through the existing `RESEND_API_KEY` on the
production service. The **preview** backend deliberately has no key, so a preview circle advancing
a round cannot email real people. Do not "fix" that by adding one.

**A separate Render service.** Threshold is a router on the existing backend, like every other app
here. One backend, many instances — see the root `CLAUDE.md`.
