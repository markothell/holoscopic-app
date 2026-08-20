# Holoscopic Monorepo (GitHub: markothell/holoscopic-app)

`main` is the production branch: pushing it deploys the backend (Render) and the frontends (Vercel). The games (newest first, as on the holoscopic.io homepage):
- **Circles** — `apps/circles`, **the first product** (PLATFORM.md P18): circles as the central social unit, ships to **circles.holoscopic.io branded Holoscopic** — one brand, tagline *thinking tools for community*; the holoscopic.io homepage stays the lab. Built: sign in and `/signup` → my circles (join included) → the circle home map → the full tell/sort/reveal loop with audio recording; generic circle operations ride `/api/circles` (the M8 promotion, landed 2026-08-14). Accounts are Holoscopic accounts, said plainly. **The activity builder's backend landed 2026-08-17** — design and state of record in root **`PRIMITIVES.md`** (§9): the circle machine runs per-seed activity modules and `config.maxLive` concurrent cycles, the single-round `gather` activity (`utils/gather.js`) writes the primitive `Share`/`Placement`/`Vocabulary` collections — all four response shapes including words (pick ≤k / coin ≤j, landed 2026-08-17) — verbs on `/api/circles`, gather audio carries the full transcription + blob-mirror wiring, and **the frontend landed 2026-08-20** — the + → picker → four-dot creator at `/c/[urlName]/new`, respond + reveal per shape at `/c/[urlName]/activity/[seedId]`, built to the S1–S20 design picks (PRIMITIVES.md §9); an eyes-on browser pass is still owed. See the app's `CLAUDE.md` + `DESIGN.md` (Toono, Holoscopic's product design language).
- **Threshold** — `apps/threshold`, where a group's dividing line falls on a polarity (backend surface: `apps/backend/routes/threshold.js` + `utils/threshold.js`, on the generic `Circle` layer; see `apps/threshold/CLAUDE.md`). Built through M4 — backend, every participant surface in the tide-line language, audio, and round-transition mail; **M6, the launch pass, is what remains**. Live at threshold.holoscopic.io, on the production backend, since 2026-08-10: its instance is slugged **`circlemo`**, not `threshold`, and the deployed frontend sends that as `x-instance-id`. The only app whose rounds advance on a **background tick** rather than sweep-on-read — nobody has the page open, so a phase transition is what sends the mail that brings people back.
- **Chorus** — `apps/chorus`, memories about one person, collected from anyone with the link (backend surface: `apps/backend/routes/memorial.js`; see `apps/chorus/CLAUDE.md`). Live at chorus.holoscopic.io (verified serving 2026-08-17). **The only app with no accounts, no holon economy, and a route mounted without `enforceVerifiedUser`** — all three are deliberate, see its `PLAN.md` §10. One deployment serves every memorial: a memorial is `/c/<slug>`, and creating one is a row in the platform admin, not a deploy.
- **Synthesis** — `apps/synthesis`, a networked group blog: everyone grows their own thought map and what people respond to weaves together (backend surface: `apps/backend/routes/synthesis.js`; see `apps/synthesis/CLAUDE.md`). Two reversals landed 2026-08-20 — **the idea is the only privacy boundary** (no per-node publish; writing a thought is what publishing was) and **identity is your account name**, not a per-idea pseudonym. It is also **a circle activity** now (`utils/synthesisActivity.js`): sharing a document with a circle writes an ordinary seed, which is what opens it to that circle's members. On `main` since 2026-07-30 (merge `5903658`, via `pre-launch`; the old `unison-m0-m1-loop` branch is deleted with nothing unmerged); live at synthesis.holoscopic.io — domain, CORS and the shared M2 session all verified 2026-08-17.
- **On a Spectrum** — `apps/spectrum`, at spectrum.holoscopic.io (backend surface: `apps/backend/routes/oas.js`; see `apps/spectrum/CLAUDE.md`). `routes/spectrum.js`, `models/SpectrumGame.js`, and `utils/spectrumGames.js` are mounted but dormant, and get deleted post-cutover.
- **interView** — `apps/holoscopic-game`, the production game app at holoscopic.io
- **Map + Sequence** — the original create-panel + sequence-builder tools inside `apps/holoscopic-game` (`/create`, `/create/sequences`), presented as the first game behind `/map-sequence`

Local dev ports: spectrum 4000, backend 4001, platform 4002, game 4003, synthesis 4004, chorus 4005, threshold 4006, circles 4007.

Holoscopic is a collective-sensemaking platform where groups map their perspectives on a 2D grid, leave comments, and vote on each other's views. It is multi-tenant: one backend serves multiple isolated deployments ("instances"), each with its own holon economy, quorum rules, and data scope.

## Tech Stack

| Layer | Tech |
|---|---|
| Game frontend | Next.js 16, React 19, TypeScript, Tailwind v4 |
| Platform admin | Next.js 16, React 19, TypeScript, inline styles |
| Backend | Express, Socket.IO, Mongoose (MongoDB) |
| Shared components | `@hs/activities` (activity engine + UI) and `@hs/audio` (recording/playback) — local packages |
| Monorepo tooling | npm workspaces + Turborepo |
| Deploy | Backend on Render; frontends deploy separately |

## Directory Map

```
holoscopic/
├── apps/
│   ├── circles/           Circles — the product shell, Next.js frontend (port 4007)  → see apps/circles/CLAUDE.md
│   ├── threshold/         Threshold — Next.js frontend (port 4006)  → see apps/threshold/CLAUDE.md
│   ├── chorus/            Chorus — Next.js frontend (port 4005)  → see apps/chorus/CLAUDE.md
│   ├── synthesis/         Synthesis — Next.js frontend (port 4004)  → see apps/synthesis/CLAUDE.md
│   ├── spectrum/          On a Spectrum — Next.js frontend (port 4000)  → see apps/spectrum/CLAUDE.md
│   ├── holoscopic-game/   Next.js game frontend (port 4003)  → see apps/holoscopic-game/CLAUDE.md
│   ├── platform/          Next.js admin UI for instance mgmt (port 4002)  → see apps/platform/CLAUDE.md
│   └── backend/           Express + Socket.IO API server (port 4001)  → see apps/backend/CLAUDE.md
├── packages/
│   ├── activities/        Shared activity engine, types, and UI components  → see packages/activities/CLAUDE.md
│   └── audio/             @hs/audio — recording, upload, playback (the three browser rules live here)
├── package.json           npm workspaces root
├── turbo.json             Turborepo pipeline config
└── render.yaml            Render deploy config (backend only)
```

## Running Locally

```bash
npm run dev:backend     # port 4001
npm run dev:spectrum    # port 4000
npm run dev:game        # port 4003
npm run dev:platform    # port 4002
npm run dev:synthesis   # port 4004
npm run dev:chorus      # port 4005
npm run dev:threshold   # port 4006
npm run dev:circles     # port 4007
```

## Site Traffic

Every frontend carries a `Beacon` client component reporting page views to `POST /api/traffic/collect` (circles got its copy with its deploy, 2026-08-17, when the allowlist grew a `circles` app);
the holoscopic.io homepage also reports link clicks. Read it in the platform admin at **`/traffic`**.
Details in `apps/backend/CLAUDE.md` § *Site traffic*.

**`src/components/Beacon.tsx` is mirrored in six apps** — chorus, circles, spectrum, synthesis,
threshold and holoscopic-game. Not a shared package, because chorus, spectrum and threshold have no
dependency on `@hs/activities` and a memorial app should not import the activity engine for forty
lines of `fetch`. The game app's copy is the one that differs beyond its type union: it splits
`site` / `interview` / `map-sequence` by path, since three products share that deployment. Change
the wire shape in one, change it in all six — the server validates `app` against an allowlist, so
a drifted copy fails as a dropped event.

No cookie, no localStorage, no visitor id: the server derives an anonymous hash with the calendar
day inside the digest, so it cannot link anyone across two days.

**The referrer is sent by the beacon, on the entry view only, and the `Referer` header is
deliberately ignored** — a fetch made by a page carries that page as its referer, so the header
recorded every visit as arriving from the site it was already on. Every `referrerHost` stored
before 2026-08-13 is that, and means nothing; the raw tier's 30-day TTL retires it. Same-origin is
dropped client-side, another of our own domains is kept.

**Vercel Web Analytics runs alongside it, in five apps** — chorus, circles, holoscopic-game,
synthesis and threshold, each mounting a mirrored `src/components/VercelAnalytics.tsx` that drops the query
string before it leaves the browser (this repo puts credentials in query strings). Enabled per
Vercel project in the dashboard; the component is the other half and neither works alone.

**The two systems will never agree, and that is not a bug.** Vercel starts counting the day its
script ships, counts one Vercel *project* rather than one of our products (holoscopic.io is three:
`site`, `interview`, `map-sequence`), defaults its dashboard to Production only, filters known
bots, and loses whatever an ad blocker eats. Ours has counted since the beacon shipped, splits
those three by path, counts preview deployments, and filters nothing. Expect Vercel to read lower.
Before comparing two numbers, line up the window, the product and the metric — the admin's "visits"
are page views, Vercel's headline is unique visitors.

## Multi-Tenancy

Every `/api` request is resolved to an `Instance` via `apps/backend/middleware/resolveInstance.js`.

**`Instance.app` says which game an instance belongs to** — `interview` | `spectrum` | `synthesis` | `chorus` | `threshold`. Read that field; never infer. Before it existed there was no stored answer and four consumers each guessed from a different accident (`parentInstanceId`, `slug === 'spectrum'`, the presence of `config.memorial`, else interView), which is why the admin's create form had nothing to offer and every instance it made was an interView edition.

- Set it wherever an instance is born: `POST /api/instances`, `utils/oasGames.js`, `utils/synIdeas.js`.
- **`gameNumber` belongs to `interview` alone.** `Instance.getDefault()` picks the lowest-numbered active instance, so a memorial or an idea holding one can become the platform default and start answering unrelated traffic.
- Creating with `app: 'chorus'` provisions a working memorial (explore mode, curator key, seed vocabulary) via `utils/memorialDefaults.js`.
- Rows predating the field are stamped by `scripts/backfill-instance-app.js` (dry run by default, `--write` to apply). **Dev and production are both done as of 2026-07-31** — every instance document carries a stored `app`. The script had been reporting "nothing to change" on exactly the rows it existed to fix: `app` is declared `default: 'interview'`, so a hydrated document reads `'interview'` where the field is absent in MongoDB, and the comparison always matched. It reads `.lean()` now. A default is a Mongoose-layer fiction — `find({ app: 'interview' })` runs in the database and matches no document that lacks the field.
- `mompod` is a Spectrum edition that nothing stored on it identifies as one: no parent, an uninformative slug, and an interView-era `gameNumber`. It lives in the script's `KNOWN` override, without which every run reverts it. It still holds `gameNumber: 2`, which drives `/interview/g2`; that is the documented anti-pattern, harmless only while `g1` stays active and outranks it in `getDefault()`.

Resolution order:
1. `x-instance-id` request header
2. `Origin`/`Referer` → domain lookup on `Instance.domains[]`
3. Auto-create/return default instance

The middleware attaches `req.instance` and `req.instanceId` for all downstream handlers.

**Instance-scoped models** (always filter by `instanceId: req.instanceId`):
- `Topic`, `Algorithm`, `AlgorithmProposal`, `HolonTransaction`, `InstanceMembership`, `Activity`, `Entry`, `FrameOfReference`, `Memory`, `MemoryTag`

**NOT instance-scoped**: `Sequence`, `User` — these are global.

## Storage Protocol: Entries

The **`Entry` collection is the source of truth for all participation content** (positions, comment text, votes). One document per `(activityId, userId, slotNumber, questionId)` carrying denormalized ancestry (`instanceId`, `topicId`, `activityId`), `position`, `text`, `objectName`, `voterIds[]`, `voteCount`, and `isSeed`. `Activity` documents hold only configuration, membership (`participants[]`), and the stake ledger — never entry content.

All entry writes go through `apps/backend/utils/entries.js` (upsert, vote, clear, seed). REST routes and Socket.IO handlers are thin wrappers over it. Key rules encoded there:
- Re-submitting a slot **upserts** (merges position/text) — no duplicates, no retry loops.
- Submitting a new position **resets votes cast by others** on that entry (returns voters' budgets).
- Seed/sample data is flagged `isSeed: true` (never magic userId prefixes).

Map queries are flat index scans: personal maps via `{instanceId, userId}`, voted-for lookups via multikey `{instanceId, voterIds}`, topic rollups via `{topicId}`.

## Critical Architectural Decisions

- **Custom `id` field**: Every MongoDB document has a short random string `id` field, NOT `_id`. Always query with `findOne({ id })`, never `findById()`.
- **Dual submission path**: Entries can arrive via the `submit_entry` WebSocket event OR `POST /activities/:id/entry`. Both wrap `utils/entries.js` and broadcast `entry_upserted` via Socket.IO.
- **Routes loaded lazily**: All Express routes mount inside `loadAPIRoutes()`, which only fires once MongoDB connects. If Mongo is down at startup, routes are never registered.
- **Sweeps on read**: `GET /api/topics` calls `sweepExpired()`/`sweepQuorum()`, and `GET /api/activities` settles expired maps — reads have write side effects.
- **`resolveInstance` never fails.** An unrecognised `x-instance-id` falls through to `getDefault()`, an interView edition. Any router whose data is meaningless outside its own app must check `req.instance.app` itself — `routes/memorial.js` does, because without it an unauthenticated read was writing tag rows into whatever the default instance happened to be.
- **Activity types**: exactly `dissolve`, `resolve`, `snapshot`. No legacy aliases exist in the schema or the client.
- **Game-scoped profiles**: `GET /api/users/:userId/games` (player history) and `GET /api/users/:userId/game-map` (redacted personal map — voted-for entries are author-stripped **server-side**). Privacy gate is shared `InstanceMembership`.
- **Post-login redirects go through `safeRedirect`** (`@hs/auth/redirect`): every login and signup page reads its `?next=` / `?callbackUrl=` through it before handing the value to `router.push()` or `signIn()`, so a credential form can only ever send you to a path on its own origin. The attack vectors are the spec — `packages/auth/src/safeRedirect.test.mjs`.

## API Response Envelope

All routes return plain objects: `{ activity }`, `{ activities, total }`, `{ entry }`, `{ topic }`, etc. Errors are `{ error }` with a meaningful status. (Auth/signup routes still use `{ success }` — they predate the convention.)

## Holon Economy

Holons are an in-game token. `utils/holons.js` exposes two helpers:
- `transact({ userId, instanceId, type, amount, ... })` — earn or spend, always logs a `HolonTransaction`
- `spend({ userId, instanceId, type, amount, ... })` — deducts only; throws `'Insufficient Holons'` (→ HTTP 402)

Both require `instanceId`. Do not touch balances directly on `InstanceMembership`.

## CORS

Allowed origins from `CLIENT_URL` env var (comma-separated) in `apps/backend/.env.local`. Add new game domains here when deploying.

## What NOT to Do

- Do NOT query `Activity.findById()` — use `Activity.findOne({ id })`.
- Do NOT write to the entries collection outside `utils/entries.js`, or to `Memory`/`MemoryTag` outside `utils/memories.js`.
- Do NOT skip `instanceId` on new `Activity`/`Entry`/`Topic`/`FrameOfReference`/`Algorithm` documents.
- Do NOT return another user's identity on voted-for entries — redaction happens in the API layer (`entries.toRedacted`), never client-side.
- Do NOT use `maxEntries: 0` unless you intend solo tracker mode (creator-only, unlimited slots).
- Do NOT add new activity types to the DB schema enum without registering them in `@hs/activities`.
- Do NOT run `git add -A` / `git add .` / `git commit -a` — other agents are editing this tree. See **Working in a Shared Tree** below.

## Working in a Shared Tree

**Assume another agent is editing this repo right now.** Several usually are — one per app — in the same working directory, on the same branch, with dev servers running. The working tree, the git index, and the database are shared mutable state. Most of the rules below exist because ignoring one of them cost real work.

**Never stage or commit paths you did not edit.**

- `git add -A`, `git add .`, and `git commit -a` are banned. They sweep up whatever another agent has half-finished, and the result is one commit containing two unrelated features under a message describing only one of them. *(This has happened: five security fixes are buried inside commit `4a8c6f3`, whose message is about Chorus.)*
- Commit with `git commit --only <explicit paths> -m "…"`. It ignores whatever else is staged and leaves the index untouched, which is exactly right when someone else pre-staged their own work.
- Run `git status` before committing. If files you never opened are dirty, that is another agent's work in progress — leave it alone.
- Renames pair up: `git add` on one side of a detected rename can pull in the whole rename set. Check `git diff --cached --name-only` after staging and before committing.

**Never restart or kill another agent's dev server.** All eight ports are usually live (`4000`–`4007`). If you need a server, start your own on a spare port and stop it when done.

**Every backend edit restarts the backend for everyone.** `npm run dev` (→ `turbo dev`) runs each workspace's `dev` script, and the backend's is `nodemon websocket-server.js`. Nodemon watches all of `apps/backend`, so *any* agent saving *any* file there — a route, a util, a one-off in `scripts/` — restarts the shared server. Each restart costs 1–9s of Atlas reconnect during which `loadAPIRoutes()` has not fired, so every `/api` request buffers in mongoose for 10s and then 500s. With several agents editing the backend at once it never stays up long enough to serve, and *every* frontend looks broken — the symptom is multi-second hangs and 500s in an app you were not touching.

- Diagnose it by pid, not by vibe: `pgrep -f "node websocket-server.js" | xargs ps -o pid=,etime=`. An age that keeps resetting to a few seconds is this, not your code.
- If you need a stable backend while others are working, run it without the file watcher: `npm run start --workspace=apps/backend`. Leave their `turbo dev` alone; start yours on a spare port (`PORT=4051`) so you are not fighting for `4001`.
- Frontends are unaffected — Next's dev server hot-reloads per app and does not restart on backend writes.

**There are two Atlas clusters, and two Vercel Blob stores. Dev and production are separated in both** (2026-07-31 — see `PLATFORM_NEXT.md` §1 and §2 for why and how):

| | Cluster host | Database | Blob store | Used by |
|---|---|---|---|---|
| Dev | `cluster0.38i5zna` | `holoscopic-dev` | `holoscopic-dev-store` (`lerhz8d7q5cbk9pb`) | `apps/backend/.env.local` — every local dev server and every script run without `NODE_ENV=production` |
| **Production** | `live.ofmfipp` | `holoscopic-db` | `holoscopic-app-chorus-blob` (`eiuui62jhmfnk5es`) | `apps/backend/.env.production`, and what Render serves holoscopic.io from |

Both clusters used to host a database called `holoscopic-db`, so the only thing telling them apart in a connection string was the host — the part nobody reads. Dev was renamed; production kept its name, so **`holoscopic-db` still means production**, and a URI naming it is pointed at live data whatever else the line says. Dev's pre-rename copy lingered on `cluster0` as a rollback until it was dropped on 2026-08-03, so that name now resolves on exactly one cluster and the rule holds without checking the host first. The blob stores are scoped by Vercel environment: Development resolves `BLOB_READ_WRITE_TOKEN` to the dev store, Production to its own. Neither separation is enforced by anything except which env file you loaded, so still check the host before writing.

- Anything in `scripts/` run with `NODE_ENV=production` hits the live site's data. Read the script first — `reset-db-for-launch.js` deletes 14 collections.
- Dev runs `autoIndex: true`, so editing an index declaration in `models/*.js` creates that index on the **dev** cluster as soon as nodemon restarts. Production is `autoIndex: false`, so the same edit reaches production only via `scripts/ensure-indexes.js` with `NODE_ENV=production`. **A model index change is not live until you run that script against production** — the two clusters drift apart silently otherwise.
- Verify which cluster you are on before writing — host *and* database name, since they now agree with each other and either one gives the answer:

      node -e "require('dotenv').config({path:'.env.local'});const u=process.env.MONGODB_URI;console.log(u.match(/@([^/?]+)/)[1], u.match(/\/([^/?]+)\?/)[1])"

- The same question for Blob is which token you loaded, not which host a URL has: `console.log(process.env.BLOB_READ_WRITE_TOKEN.split('_')[3])` prints the store id. A URL alone is not evidence — reading an object proves nothing about which store a *write* will land in.

**Don't fix failing tests in another app's area.** A red test in a file you did not touch is usually an agent mid-change. Report it; do not "helpfully" repair it and collide with their next write.

**`git fetch` before you claim anything is merged.** With several agents pushing, a local ref is a
guess, not a fact. `main` in your working copy can be a dozen commits behind `origin/main` while
you confidently report a branch as unmerged — this has happened, and it turned finished, deployed
work into a phantom "unmerged branch" in a design conversation. `origin/main` is the only truth
about what is on production. Fetch first, read `origin/main`, and say which ref you read.

**Delete a branch the moment it merges.** A merged branch that still exists reads as work in
flight to every agent and every human who lists branches later.

**Report what you swept.** If a commit of yours ended up containing someone else's files anyway, say so plainly in the response rather than letting it pass silently.

## When to Escalate to the User

- Any change to the holon economy parameters or quorum thresholds (these are per-instance config, changing defaults affects all instances).
- New deploy targets beyond what's in `render.yaml`.
- Changes to MongoDB indexes on large collections (`activities`, `ratings`, `comments` arrays).
- Anything touching auth — password hashing, session tokens, `requireAdmin` middleware.

## Delegation

You are authorized to dispatch subagents on your own. Do not ask permission first, and do not wait to be told which agent to use.

Dispatch when a task is both **specifiable in advance** and **verifiable on return** — you can write it out in a paragraph without a back-and-forth, and you can tell from the report whether it worked:

- Broad searches where the conclusion matters and the files do not → `Explore`.
- A bounded build behind a decision already settled in this conversation → `general-purpose`.
- Independent work in two apps that do not touch each other → dispatch in parallel.
- A second opinion on a diff you have been staring at → a fresh agent reads it cold.

Work inline instead when the spec would be longer than the work, when you already have the context loaded, when the task needs a judgment call mid-flight (a subagent cannot stop and ask), or when it touches auth, migrations, or holon-economy parameters.

Say in one line what you dispatched and why. Treat agent reports skeptically: require test output over claims, and verify anything load-bearing yourself.
