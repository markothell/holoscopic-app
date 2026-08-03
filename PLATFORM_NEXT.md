# Platform — Next Major Version

Things worth doing that are **not worth doing now**, because they are breaking changes, migrations,
or cleanups whose cost is only justified when something larger is already being rebuilt.

The bar for this list: a real problem, with a named consequence, that we have decided to *live with*
rather than forgotten about. If an item can be done safely today, it belongs in a branch, not here.

Per-app plans live in `apps/*/PLAN.md`. This file is for things that cut across the monorepo.

---

## ✅ 1. Dev and production database names — DONE 2026-07-31

Both clusters hosted a database called `holoscopic-db`, so the only thing distinguishing them in a
connection string was the host, which is the part nobody reads.

The damage that made it urgent: `scripts/backup-mongo.js` writes `<prefix>/<dbName>/latest.json`,
and `dbName` comes from the URI. With one name, both clusters produced the same path — so a dev dump
could overwrite production's `latest.json`, the file whose entire purpose is to answer *"which
archive do I restore?"* mid-incident. Nothing about the result looks wrong: well-formed JSON,
matching checksum, clean restore. Simply the wrong database, restored over production by somebody
following the documented procedure exactly.

**Fixed by renaming dev only** — `holoscopic-db` → `holoscopic-dev` on `cluster0.38i5zna`, copied
with `mongorestore --nsFrom/--nsTo`, all 900 documents and every index verified identical before
cutover. Renaming *one* side is what resolves the ambiguity; production never had to be touched, so
there was no write-loss window on a live memorial.

Backup paths are now `mongo-dev/holoscopic-dev/` and `mongo/holoscopic-db/`.

**Renaming production is CLOSED, decided against.** `holoscopic-db` is production and stays that
way. `holoscopic-prod` would read better, the hazard this section existed for is already gone, and
the rename costs a cutover with real downtime for cosmetics. It is not deferred work and should not
be picked up as any.

**The rollback copy is gone — dropped from `cluster0.38i5zna` on 2026-08-03**, which is what finishes
this section. Until then that cluster still carried a database called `holoscopic-db` alongside
`holoscopic-dev`, so the name meant production on one host and stale dev leftovers on the other —
the exact ambiguity this work removed everywhere else, surviving in the one place nobody looked.

`holoscopic-db` now exists on exactly one cluster. Verified after the drop: `cluster0.38i5zna` holds
`holoscopic-dev` and no `holoscopic-db`; `live.ofmfipp` holds `holoscopic-db` and nothing else. The
rule in the root `CLAUDE.md` — *a URI naming `holoscopic-db` is pointed at live data* — is now true
without qualification rather than true-unless-you-are-on-the-dev-host.

There is no undo for the rename any more. That is the intended end state, not an oversight: the
nightly `mongodump` is the recovery path for dev, the same as for everything else.

## ✅ 2. Separate the dev and production Vercel Blob stores — DONE 2026-07-31

Dev and production shared store `eiuui62jhmfnk5es`. A local test that overwrote a pathname
overwrote the object a live memorial was serving, and there is no undelete. Deleting the dev store
would have taken production's recordings with it — the exact failure that started this work.

Worse than it first appeared: **both environments had a memorial with the slug `chorus`**, so their
objects were interleaved under the same `memorial/chorus/` path prefix inside the one store,
distinguishable only by the timestamp-and-hash in each filename. Nothing about a path said which
environment owned it.

New dev store `holoscopic-dev-store` (`lerhz8d7q5cbk9pb`), connected to Chorus and Platform for the
Development environment only; the production store is now scoped to Production alone. Three
recordings and one subject photo were moved with `restore-blobs.js --migrate` and verified
byte-identical. Production references only its own store.

**The env var deliberately carries no prefix.** Vercel's connect flow forces one, but all three
consumers read the bare `BLOB_READ_WRITE_TOKEN`, and a prefixed variable would need a
`DEV_… || …` fallback in each — a conditional that silently resolves to the wrong store on the day
it matters. The auto-created `DEV_BLOB_READ_WRITE_TOKEN` is left in place, unread, because deleting
it may break the store↔project link. Environment scope alone decides which store gets written.

## 3. Edition numbers become per-app, not platform-wide

**Settled direction (2026-07-31): numbering belongs to each app, not to the platform.** Today
`gameNumber` lives on every `Instance` regardless of app, and `Instance.getDefault()` sorts by it —
so a memorial or an idea holding one can become the platform default and answer unrelated traffic.
It is correct by convention and one override in `scripts/backfill-instance-app.js`, not by
construction.

**No live problem, and deliberately not being fixed now.** `g1` holds `gameNumber: 1` and is active,
so it wins `getDefault()` and nothing else surfaces. `mompod` is a Spectrum edition still holding
`gameNumber: 2`; it only matters if `g1` is ever deactivated. The field is also unused in the
interView UI, so there is nothing to migrate yet — which is exactly why this is cheap to leave and
cheap to do properly later.

Target: each app owns its own edition numbering in its own config, so no other app can express it,
and `getDefault()` stops ranking instances by a field that means nothing to most of them.

**If `g1` is ever deactivated, deal with this first** — that is the one event that turns it from
latent to live.

## 4. A backend that preview deployments can safely write to

Preview deployments have no `NEXT_PUBLIC_API_URL`, so today they cannot reach a backend at all —
which is why splitting the Blob stores was safe. That is a happy accident, not a design.

The moment a preview is given a working API URL it will point at the **production** backend, because
that is the only one there is, and branch code will write to the production database. There is
nowhere else for it to go.

Wanted: a staging backend on the dev cluster, with previews pointed at it. Until then, giving
previews an API URL is a bigger decision than it looks.

## 5. Housekeeping deferred from the backup work (2026-07-31)

Small, safe, and not worth a deploy on their own:

- Three dev-origin recordings (~250 KB) sit under the production `blob/` prefix from before the
  prefixes were separated. `blob/` has no expiry rule, so they persist indefinitely. Harmless
  clutter; removing them needs an admin credential the backup user deliberately lacks — and it
  would mean deleting by path from a prefix that also holds live production audio, so it is worth
  doing carefully or not at all.
- `routes/spectrum.js`, `models/SpectrumGame.js` and `utils/spectrumGames.js` are still mounted in
  `websocket-server.js` but dormant. Root `CLAUDE.md` says they get deleted post-cutover.
