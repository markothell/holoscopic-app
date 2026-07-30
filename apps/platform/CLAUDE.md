# Holoscopic Platform

Admin app for managing instances. Runs on port 3002. See root `CLAUDE.md` for monorepo structure and multi-tenancy.

## Structure

```
apps/platform/
└── src/
    ├── app/
    │   ├── login/
    │   └── instances/       # list, new, [id]
    ├── contexts/
    │   └── AuthContext.tsx
    └── lib/
        └── api.ts
```

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
