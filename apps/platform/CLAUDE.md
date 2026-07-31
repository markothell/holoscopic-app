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
    ├── contexts/
    │   └── AuthContext.tsx
    └── lib/
        ├── api.ts
        └── image.ts             # browser downscale, run before any photo upload
```

## The one server route: `/api/memorial-photo`

Chorus memorials get their subject photo here. The file is downscaled to 1600px in the browser
(`lib/image.ts`), posted as multipart, and written to Vercel Blob at
`memorial/<slug>/photo/…`; the returned URL fills the photo field, and **Save is still what
persists it**. Pasting a URL writes the same field and still works.

- **It requires `BLOB_READ_WRITE_TOKEN`**, which in production comes from *connecting* the
  `chorus-memories` Blob store to this Vercel project — the same store the Chorus app uses. A store
  connected to nothing leaves production with no token while local dev keeps working from
  `.env.local`, so the route answers a named **503** rather than a generic 500.
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

- `/login` — credential form
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
