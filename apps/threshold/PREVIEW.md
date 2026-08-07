# Threshold on preview

**`apps/chorus/PREVIEW.md` is the reference** — it explains what the environment is, the
`vercel env rm` footgun that deletes Production along with Preview, why a `CLIENT_URL` miss looks
completely healthy, and why changing a Render env var does not restart the service. Read it first.
This file is only what is *different* for Threshold.

The backend half is already built and shared: `holoscopic-preview-backend.onrender.com`, pointed at
the **dev** cluster and the **dev** blob store. Nothing below creates a second one.

## The gate: a Vercel project for Threshold

There is none yet, and everything else waits on it. Root Directory `apps/threshold`, framework
Next.js. Name it deliberately — the hostname is minted from the name at creation and never follows
a rename.

A Threshold **instance already exists on the dev cluster** (`slug: threshold`), because the preview
backend and local development share that database. `node scripts/seed-threshold-dev.js` from
`apps/backend` builds a circle in it holding every state at once.

## Env vars on that project

Same two mechanisms as Chorus — a separate record per scope for the secret, branch-scoped Preview
records for the rest.

| Variable | Preview value | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://holoscopic-preview-backend.onrender.com/api` | branch-scoped to `preview` |
| `NEXT_PUBLIC_INSTANCE_ID` | `threshold` | the slug resolves; an id works too |
| `NEXTAUTH_URL` | the Vercel branch URL | **Threshold-only.** Chorus has no accounts, so it needs neither this nor the next one |
| `NEXTAUTH_SECRET` | must equal the preview backend's `GAME_TOKEN_SECRET` / `NEXTAUTH_SECRET` | a mismatch 401s every write while reads look fine |
| `BLOB_READ_WRITE_TOKEN` | the **dev** store (`LERHz8d7Q5CbK9pB`) | separate record per scope, never a shared one |

Prove which store a deploy actually mints against with the client-token probe in Chorus's file,
with `threshold/` in the pathname instead of `memorial/`. `eIUuI62jhmFnk5eS` in the reply means
preview is pointed at **production** blob — stop and fix the scoping before recording anything.

## `CLIENT_URL` on the preview backend

Add the Threshold branch URL. This is the trap that already cost one phone test, and Threshold
fails it **faster and more legibly than Chorus does**: Chorus's pages are Server Components, so a
missing origin stays invisible until the first browser write. Threshold's `/t/<urlName>` is a
client component that fetches its snapshot on mount, so a missing origin surfaces immediately as
**"Could not load this circle"** — which reads exactly like a circle that does not exist. This
happened locally during the M3b build: the origin was missing from the local `CLIENT_URL`, and the
symptom was indistinguishable from a 404 until the console showed the CORS line.

Reproduce what a browser does, rather than trusting `curl` without an `Origin`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  'https://holoscopic-preview-backend.onrender.com/api/threshold/circles/tuesday' \
  -H 'Origin: https://<threshold-preview-url>' \
  -H 'x-instance-id: threshold'
# 401 = origin allowed, auth missing — which is the expected answer here and means CORS is fine.
# 403 with {"error":"Origin not allowed: …"} = CLIENT_URL is missing it.
```

A 401 is the *success* signal: every `/api/threshold` route sits behind `enforceVerifiedUser`
(D6), so an unauthenticated request that gets far enough to be refused for *auth* has already
passed CORS.

## Mail: preview has none, and for Threshold that is a feature

Chorus's file notes that the preview backend has no `RESEND_API_KEY`, and says it matters most
here. It does: **a preview circle advancing a round would otherwise email real people.** The
ticker runs on preview like anywhere else, so a circle left with an expired deadline will advance
overnight and try to notify every member.

So mail stays off by default. To test M4 deliberately, add `RESEND_API_KEY` to the preview backend
temporarily and **use a circle whose members are the `@threshold.dev` fixture addresses**, which
belong to nobody. Take it out again afterwards.

## Deploying

```bash
git push origin <your-branch>:preview --force
```

Vercel skips the build when nothing under `apps/threshold` changed, so a backend-only commit shows
as *Canceled* on the Threshold project. That is correct behaviour and not a failure.

The backend is on Render's free tier and cold-starts in roughly a minute — **load `/health` once
and wait for it before picking up the phone**, because a cold start looks exactly like the bug you
are hunting.

## What the phone test is actually for

Not "does the recorder work" — a laptop answers that. It is for the three things a laptop cannot
reach, all of which have broken before:

1. **Safari takes the MP4/AAC branch** rather than WebM/Opus.
2. **iOS MP4 carries no duration metadata**, so any player reading duration off the file gets
   `Infinity`. Threshold takes duration from the client's own timer; this is what proves it.
3. **Safari spells the `codecs` parameter with a space**, and Vercel Blob's allowlist is an exact
   string match. This is what killed the first live iPhone recording in Chorus, at the upload step,
   while Android sailed through.

Record on an iPhone and on Android, then let the round advance and play the story back inside the
ranking queue.
