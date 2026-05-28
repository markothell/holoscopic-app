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
- `/instances/new` — create (name, slug, domains, gameType, access, dates)
- `/instances/[id]` — edit; two tabs: **Basic** and **Config** (holons, quorum, topicsActivityId)

## Environment

- `NEXT_PUBLIC_API_URL` — backend base URL (default: http://localhost:3001/api)

## Key Patterns

- Inline styles throughout (design pass pending)
- CSS vars in globals.css: `--bg`, `--surface`, `--border`, `--ink`, `--accent`, `--font-mono`
- Light theme: bg `#F7F4EF`, accent `#C83B50`
