# Holoscopic Platform

Admin app for managing instances. Runs on port 3002. See root `CLAUDE.md` for monorepo structure and multi-tenancy.

## Structure

```
apps/platform/
└── src/
    ├── app/
    │   ├── api/memorial-photo/  # the one server route — Blob upload for Chorus subject photos
    │   ├── login/
    │   └── instances/           # list, new, [id]
    ├── components/
    │   └── AdminNav.tsx         # the one header — every page uses it
    ├── contexts/
    │   └── AuthContext.tsx
    └── lib/
        ├── api.ts
        ├── adminApi.ts          # the /api/admin surface, moved here from the game app
        └── image.ts             # browser downscale, run before any photo upload
```

**Platform administration lives here now, not in the game.** `/users`, the signup lists and the
platform counters were a `/admin` page inside `apps/holoscopic-game`, reached from an "Admin" entry
in the game's own `UserMenu`. Managing the platform meant signing into the thing being managed, and
every admin's game nav carried an item that had nothing to do with playing. The backend routes did
not change — only the caller. The old `userId` argument is gone with them: it travelled as
`x-user-id`, which is a header, not a credential; identity is the bearer token `lib/api.ts`
attaches, and `routes/admin.js` re-reads the User row on every call.

## The one server route: `/api/memorial-photo`

Chorus memorials get their subject photo here. The file is downscaled to 1600px in the browser
(`lib/image.ts`), posted as multipart, and written to Vercel Blob at
`memorial/<slug>/photo/…`; the returned URL fills the photo field, and **Save is still what
persists it**. Pasting a URL writes the same field and still works.

- **It requires `BLOB_READ_WRITE_TOKEN`**, which comes from *connecting* a Blob store to this
  Vercel project. There are two, one per environment — `holoscopic-app-chorus-blob` for Production
  and `holoscopic-dev-store` for Development — and this project needs **both**, because photos and
  Chorus recordings share a store per environment (`apps/chorus/CLAUDE.md`). Environment scope
  alone decides which one a write lands in. A store connected to nothing leaves that environment
  with no token while the other keeps working, so the route answers a named **503** rather than a
  generic 500.
- **It is admin-gated by spending the caller's own bearer token** on `GET /api/instances/:id`,
  which already sits behind `requireAdmin`. There is one definition of "admin" and it re-reads the
  User row, so a demoted admin cannot still upload. A 404 from that call is reported as a missing
  instance, never as "sign in required" — sending an operator to re-authenticate over a problem
  login cannot fix is its own bug.
- **It does NOT go to the Render backend.** That service has no persistent disk in `render.yaml`,
  so anything written to its filesystem is gone at the next deploy (apps/chorus/PLAN.md D13).

## Auth

`useAuth()` from `@/contexts/AuthContext` — localStorage-based, no NextAuth. Stores `{ id, email, name, role }` after login. Only users with `role: 'admin'` can sign in. All API calls pass `x-user-id` header.

## Pages

All pages share `components/AdminNav.tsx` — extracted when the app went from two pages to five and
the header had already been copy-pasted twice.

- `/` — **Overview**: the six all-time platform counters (users, activities, sequences,
  participants, comments, votes) plus shortcuts. It used to redirect to `/instances`.
- `/users` — roles, active/inactive, one-shot password reset. **You cannot change your own role or
  status** — on a platform that can have one admin, self-demotion is the fastest way to lock
  everybody out. A reset password is shown once in a `prompt()` and stored nowhere.
- `/signups` — interest capture (`models/Signup`) grouped by `source` — `first-gathering` is the
  seat list, `platform-updates` the announcements list; a new capture surface mints a new source
  and appears here with no page change. Sources ordered by newest signup; reads the admin-gated
  `GET /api/admin/signups`. Emails stay collapsed behind a per-source toggle, because a page that
  prints every address on open is one that gets left on a screen in a room. **It replaced the
  Waitlist tab (2026-08-12)** — the per-sequence `Waitlist` rows still exist in Mongo and the
  backend's `GET /api/admin/waitlist` still answers, but no surface writes or reads them today.
- `/login` — credential form
- `/traffic` — site traffic: visits and people per app, visits per day, which homepage links get
  taken, busiest pages. Reads `GET /api/traffic/summary` (admin-gated), which is served from the
  permanent daily rollup — so a 90-day range costs counters, not a scan, and it keeps answering
  after the raw tier's 30-day TTL. **This is arrival, not participation**; the activity stats on an
  instance page are the other thing. App colours are a fixed categorical set validated for
  colour-vision deficiency (worst adjacent CVD ΔE 9.1); three sit under 3:1 on white, which is why
  every bar carries a visible label and every figure is also a table row.
- `/instances` — table of all instances
- `/instances/new` — create (**app**, name, slug, domains, access, dates)
- `/instances/[id]` — edit; two tabs: **Basic** and **Config**

**App is the field that shapes both pages.** It is stored on `Instance.app`, and it decides what the
Config tab shows: interView → holon/quorum economy, On a Spectrum → room defaults, Chorus → the
memorial's subject, vocabulary and share links. Picking Chorus on create provisions the curator key
and starting vocabulary server-side, so the memorial is live at `/c/<slug>` the moment it exists.

Edition numbering (`gameNumber`, `gameVersion`) is hidden for every app but interView — those fields
are meaningless elsewhere, and a non-interView instance holding a `gameNumber` can be selected as
the platform's default instance.

## Environment

- `NEXT_PUBLIC_API_URL` — backend base URL (default: http://localhost:3001/api)
- `NEXT_PUBLIC_CHORUS_URL` — where memorial/curate links point (default: https://chorus.holoscopic.io)

## Key Patterns

- Inline styles throughout (design pass pending)
- CSS vars in globals.css: `--bg`, `--surface`, `--border`, `--ink`, `--accent`, `--font-mono`
- Light theme: bg `#F7F4EF`, accent `#C83B50`
