# Threshold on preview

**`apps/chorus/PREVIEW.md` is the reference** — it explains what the environment is, the
`vercel env rm` footgun that deletes Production along with Preview, why a `CLIENT_URL` miss looks
completely healthy, and why changing a Render env var does not restart the service. Read it first.
This file is only what is *different* for Threshold.

The backend half is already built and shared: `holoscopic-preview-backend.onrender.com`, pointed at
the **dev** cluster and the **dev** blob store. Nothing below creates a second one.

## The Vercel project

**It exists**, with `NEXTAUTH_URL` and `NEXTAUTH_SECRET` on it (2026-08-08). Root Directory is
`apps/threshold`. What is left is the table below, the `CLIENT_URL` line, and a push.

A Threshold **instance already exists on the dev cluster** (`slug: threshold`), because the preview
backend and local development share that database. `node scripts/seed-threshold-dev.js` from
`apps/backend` builds a circle in it holding every state at once.

## Env vars on that project

**Do not copy Chorus's branch-scoping.** That mechanism is *remediation*: Chorus already had
`NEXT_PUBLIC_API_URL` and `BLOB_READ_WRITE_TOKEN` as single records covering Production **and**
Preview, so the first preview recording would have written to the live store — and the obvious fix
was unavailable, because `vercel env rm <NAME> preview` deletes the whole record including
Production. Adding a branch-scoped Preview record was the way to override a shared record without
removing anything.

Threshold's project is new, so there is nothing shared to work around. **Give every variable one
record per environment from the start**, which is what Chorus would have if it could start over:

| Variable | Production | Preview |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | the production backend `/api` | `https://holoscopic-preview-backend.onrender.com/api` |
| `NEXT_PUBLIC_INSTANCE_ID` | `threshold` | `threshold` |
| `NEXTAUTH_URL` | `https://threshold.holoscopic.io` | the Vercel branch URL |
| `NEXTAUTH_SECRET` | matches the **production** backend | matches the **preview** backend |
| `BLOB_READ_WRITE_TOKEN` | ✅ `holoscopic-app-threshold-blob` (`Ar3hPFJek61dy6qb`), one Production-only record | the **dev** store (`LERHz8d7Q5CbK9pB`) |

**The four records created on 2026-08-08 each span Production *and* Preview**, which is the shape
this file exists to avoid — and all four are marked *sensitive*, so their values cannot be read
back before splitting them. A shared `NEXTAUTH_SECRET` is the one that bites: it 401s every write
on preview while every read looks fine, because the preview backend holds a different secret. The
value to restore Production with is the production backend's `GAME_TOKEN_SECRET`, readable from
Render. `BLOB_READ_WRITE_TOKEN` was added afterwards and is correctly scoped to Production alone.

Adding one scope at a time is what keeps them separate records:

```bash
vercel env add NEXT_PUBLIC_API_URL preview       # then paste the preview value
vercel env add NEXT_PUBLIC_API_URL production    # then paste the production value
vercel env ls                                    # confirm two rows, one per environment
```

`NEXTAUTH_URL` and `NEXTAUTH_SECRET` exist on the project already; **check they are scoped rather
than shared** before trusting them — `vercel env ls` shows which environments each record covers. A
single `NEXTAUTH_SECRET` spanning both is the failure that 401s every write on preview while every
read looks fine, because the preview backend holds a different secret.

Two rules that still apply, both from Chorus's file:

- **Take a `vercel env pull --environment=production` backup before touching any shared record.** A
  variable marked *sensitive* pulls as `[SENSITIVE]` and cannot be backed up at all.
- **Never `vercel env rm` a record you want to keep half of.** The environment argument does not
  narrow the removal.

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
# 404 = origin allowed, and the answer is about the circle — CORS is fine.
# 403 with {"error":"Origin not allowed: …"} = CLIENT_URL is missing it.
```

**403 is the only failure signal here; anything else means CORS passed.** `enforceVerifiedUser`
guards mutating methods alone, so a GET never 401s however unauthenticated it is — an earlier
version of this file called 401 the success signal, and no GET has ever produced one. Read the two
404s apart while you are here: `{"error":"Circle not found"}` means the instance resolved and the
circle did not exist, while `{"error":"Not found"}` is `assertOwnApp` refusing an instance that is
not a Threshold one — usually a wrong `x-instance-id`, since production's instance is slugged
`circlemo` and dev's is `threshold`. To probe the *write* path instead, `POST /circles` with `{}`
answers `400 createdBy required` once CORS is satisfied.

## Mail: preview has none, and for Threshold that is a feature

Chorus's file notes that the preview backend has no `RESEND_API_KEY`, and says it matters most
here. It does: **a preview circle advancing a round would otherwise email real people.** The
ticker runs on preview like anywhere else, so a circle left with an expired deadline will advance
overnight and try to notify every member.

So mail stays off by default, and there is a second guard underneath it: **the members
`seed-threshold-dev.js` creates carry no email address at all**, so `dispatch` skips the mail
branch before Resend is reached. `@threshold.dev` is their *sign-in* address on the User account,
never their circle membership.

Testing M4 for real therefore takes three deliberate steps, and none of them happens by accident:

1. add `RESEND_API_KEY` to the preview backend,
2. put a **real address you own** on a membership — join the circle yourself, or set
   `members.$.email` directly on one fixture row,
3. set `THRESHOLD_URL` on that backend, or every link in the mail points at `localhost:4006`.

Take the key out again afterwards.

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
