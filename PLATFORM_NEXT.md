# Platform — Next Major Version

Things worth doing that are **not worth doing now**, because they are breaking changes, migrations,
or cleanups whose cost is only justified when something larger is already being rebuilt.

The bar for this list: a real problem, with a named consequence, that we have decided to *live with*
rather than forgotten about. If an item can be done safely today, it belongs in a branch, not here.

Per-app plans live in `apps/*/PLAN.md`. This file is for things that cut across the monorepo.

---

## 1. Give the two clusters different database names

**Both Atlas clusters host a database called `holoscopic-db`.** Dev is `cluster0.38i5zna`,
production is `live.ofmfipp`, and the only thing distinguishing them in a connection string is the
host — which is the part nobody reads.

The concrete damage: `scripts/backup-mongo.js` writes `<prefix>/<dbName>/latest.json`, and `dbName`
comes from the URI. With one name, both clusters produce the same path, so a dev dump can overwrite
production's `latest.json` — the file whose entire purpose is to answer *"which archive do I
restore?"* during an incident. Nothing about the result looks wrong: the JSON is well-formed, the
checksum matches, the archive restores cleanly. It is simply the wrong database, and somebody
restores dev over production while following the documented procedure exactly.

`utils/backupNamespace.js` (2026-07-31) defends against this by deriving the bucket prefix from the
connection host and failing closed in both directions. **That is a guard, not a fix.** It works
because we told it one specific hostname; the underlying ambiguity is still there, and it will keep
generating this class of bug in places nobody has thought to guard — a `mongodump` typed by hand, a
restore run under pressure, a new script that reads `dbName` the obvious way.

Target: `holoscopic-dev` and `holoscopic-prod`, so the name alone is unambiguous everywhere it
appears — connection strings, backup paths, Atlas UI, shell history, log lines.

Why it waits: the name is embedded in every connection string across `.env.local`,
`.env.production`, Render, and Vercel, and renaming a MongoDB database means copying every
collection and cutting over. Cheap only while there is little data and downtime is free — which is
**still true today and stops being true at first real influx.** That window closing is the argument
for doing this earlier in the next version rather than later.

## 2. Separate the dev and production Vercel Blob stores

Dev and production both use store `eiuui62jhmfnk5es`. A local test that overwrites a pathname
overwrites the object a live memorial is serving, and there is no undelete.

The backup bucket is prefix-separated (`blob/` vs `blob-dev/`) so the *copies* stay apart, but the
source store is genuinely shared. Deleting the dev store would take production's recordings with it
— which is the exact failure that started this work: three recordings survived a store swap with
their documents intact and their audio pointing at nothing.

## 3. Retire `gameNumber` as a cross-app field

`gameNumber` belongs to interView alone, but it lives on every `Instance` and
`Instance.getDefault()` sorts by it — so a memorial or an idea holding one can become the platform
default and start answering unrelated traffic. It is currently correct by convention and one
override in `scripts/backfill-instance-app.js`, not by construction.

Known live instance of this: **`mompod` is a Spectrum edition still holding `gameNumber: 2`.** It is
harmless only while `g1` is active and outranks it. Left in place deliberately — clearing it would
break `/interview/g2` if that URL is in circulation.

Target: move edition numbering onto interView's own config, so no other app can express it.

## 4. Housekeeping deferred from the backup work (2026-07-31)

Small, safe, and not worth a deploy on their own:

- Three dev-origin recordings (~250 KB) sit under the production `blob/` prefix from before the
  prefixes were separated. `blob/` has no expiry rule, so they persist indefinitely. Harmless
  clutter; removing them needs an admin credential the backup user deliberately lacks.
- `routes/spectrum.js`, `models/SpectrumGame.js` and `utils/spectrumGames.js` are still mounted in
  `websocket-server.js` but dormant. Root `CLAUDE.md` says they get deleted post-cutover.
