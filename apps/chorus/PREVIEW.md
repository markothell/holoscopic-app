# The preview environment

A place to verify a change on a real phone before it reaches `main` — because **`main` is the
production branch**, so pushing it *is* the deploy. There is no "try it and see" on production, and
audio is the one thing in Chorus with no second copy.

Built for the `packages/audio` extraction (`apps/threshold/PLAN.md` M2), which changes a live app
and has to be proven on an iPhone: the MP4 branch, the missing duration metadata, and the `codecs`
parameter spacing that killed the first live iPhone recording are all invisible on a laptop.

## What it is

| Piece | Where | Points at |
|---|---|---|
| Branch | `preview` | disposable — force-push whatever you are testing |
| Frontend | Vercel preview deploy of `holoscopic-app-chorus` | branch-scoped env vars |
| Backend | `holoscopic-preview-backend.onrender.com` | **dev** cluster (`cluster0.38i5zna` / `holoscopic-dev`) |
| Blob | Preview-scoped `BLOB_READ_WRITE_TOKEN` | **dev** store (`LERHz8d7Q5CbK9pB`) |

Nothing here can reach production data. That is the whole point, and it was not true before this
existed: `BLOB_READ_WRITE_TOKEN` and `NEXT_PUBLIC_API_URL` were **single records scoped to
Production *and* Preview**, so the first preview recording would have written into the live
memorial store and the live database.

## How the env vars are split, and why it matters

Two different mechanisms, deliberately:

- **`BLOB_READ_WRITE_TOKEN` — separate records per scope.** One for Production, one for Preview.
- **`NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_SERVER_URL` — branch-scoped Preview records**
  (`Preview (preview)`), sitting *alongside* the untouched shared record. A branch-scoped value
  wins for that branch.

The second mechanism exists because of something that will bite anyone who tries the obvious thing:

> **`vercel env rm <NAME> preview` deletes the WHOLE record, including Production.**

The environment argument does not narrow the removal on a record that covers several scopes. This
was found by testing on a throwaway variable first, and then confirmed for real on
`BLOB_READ_WRITE_TOKEN` — Production's value vanished and had to be restored from a backup taken
minutes earlier. **Take a `vercel env pull --environment=production` backup before touching any
shared record**, and prefer adding a branch-scoped Preview record, which removes nothing.

One catch on the backup: a variable marked **sensitive** pulls as `[SENSITIVE]` and cannot be
backed up at all. `NEXT_PUBLIC_API_URL` is one of those — which is the other reason its Preview
value is branch-scoped rather than split.

## The backend's `CLIENT_URL` must list the preview origin

**This is the trap, and it already cost one phone test.** The preview backend's `CLIENT_URL` is an
exact-match CORS allowlist, and it must contain the Vercel branch URL:

```
https://holoscopic-app-chorus-git-preview-markothells-projects.vercel.app
```

Miss it and the preview looks **completely healthy**: the memorial page renders, the photo loads,
the memories are all there. Chorus's pages are Server Components, so those reads happen
server-to-server and send no `Origin` — nothing to reject. The failure only appears at the first
write from the browser, which for Chorus is the contributor-token mint when the compose sheet
opens. On a phone that surfaces as *"The server did not answer."*

`curl` misses it for the same reason. Reproduce what a browser actually does:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://holoscopic-preview-backend.onrender.com/api/memorial/session \
  -H 'Origin: https://holoscopic-app-chorus-git-preview-markothells-projects.vercel.app' \
  -H 'Content-Type: application/json' -H 'x-instance-id: chorus' -d '{}'
# 200 = allowed.  403 with {"error":"Origin not allowed: …"} = CLIENT_URL is missing it.
```

**Chorus is the only app on this allowlist, and that is the decision rather than a backlog.**
Chorus is the only app holding real contributors' data, so it is the only one where a push to
`main` can lose something irreplaceable. Every other app is tested by pushing straight to
production, because there is nothing there yet to lose. Add an origin here if another app starts
carrying data worth protecting.

**And changing an env var through Render's API does NOT restart the service.** The value is stored
immediately and `PUT` returns 200, but the running process keeps the old one — `allowedOrigins` is
read once at boot. `POST /v1/services/<id>/restart` returned 200 and also did not take. What worked
was triggering a deploy:

```bash
POST https://api.render.com/v1/services/<id>/deploys  {"clearCache":"do_not_clear"}
```

Verify with the curl above rather than assuming the change landed.

## Using it

```bash
git push origin <your-branch>:preview --force   # deploys both halves
```

Both pipelines watch `preview`: Render redeploys the backend, Vercel builds the frontend. Then open
the preview URL on the phone.

- **Vercel skips the build when nothing under `apps/chorus` changed** (Root Directory is
  `apps/chorus`). A commit that touches only the backend shows as *Canceled*, which is correct
  behaviour and not a failure.
- **The backend is on Render's free tier**, so it spins down after ~15 minutes idle and cold-starts
  in roughly a minute. **Load `/health` once and wait for it before picking up the phone** — a cold
  start looks exactly like the bug you are hunting.

## Proving which blob store a preview deploy actually mints against

A 400 only proves *some* token exists. Ask for a client token and read the store id out of the
front of the reply — same technique as `apps/chorus/CLAUDE.md`:

```bash
curl -s -X POST https://<preview-url>/api/audio/upload \
  -H 'Content-Type: application/json' \
  -d '{"type":"blob.generate-client-token","payload":{"pathname":"memorial/chorus/probe.webm",
       "callbackUrl":"https://<preview-url>/api/audio/upload","multipart":false}}'
# → "clientToken":"vercel_blob_client_LERHz8d7Q5CbK9pB_…"   ← dev store. Anything else is a bug.
```

`eIUuI62jhmFnk5eS` in that reply means preview is pointed at **production** blob. Stop and fix the
scoping before recording anything.

## What preview deliberately does not have

`GET /health` on the preview backend reports these, so the omissions are visible rather than
assumed:

- `mediaBackup: no-bucket` — no `BACKUP_S3_*`. Preview must never write into the backup bucket, or
  test objects land beside the real off-site copies.
- `alerting: no-api-key` — no `RESEND_API_KEY`. **No mail can leave preview**, which matters most
  for Threshold: a preview circle advancing a round would otherwise email real people.

Add either one deliberately and temporarily if you are specifically testing it.
