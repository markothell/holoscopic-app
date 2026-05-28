# Holoscopic Game

Cultural bridge-building game. Part of the Holoscopic monorepo — see root `CLAUDE.md` for monorepo structure and multi-tenancy.

## Structure

```
apps/holoscopic-game/
├── src/
│   ├── app/              # Pages and routes
│   ├── components/       # Game-specific UI components
│   ├── services/         # API service classes
│   ├── hooks/            # React hooks
│   ├── contexts/         # AuthContext, InstanceContext
│   ├── models/           # Re-exports from @hs/activities + Sequence, User types
│   ├── lib/              # api.ts, auth.ts, mongodb.ts
│   └── utils/            # Re-exports from @hs/activities + game-specific utils
└── public/
```

## Environment

- `NEXT_PUBLIC_API_URL` — API base URL (default: http://localhost:3001/api)
- `NEXTAUTH_URL` — this app's URL (default: http://localhost:3000)
- `NEXTAUTH_SECRET` — JWT secret

## Auth

NextAuth credentials provider. `useAuth()` from `@/contexts/AuthContext`:
- `userId`, `userEmail`, `userName`, `userRole`
- `holonBalance`, `refreshBalance()` — call after any Holon transaction
- `isAuthenticated`, `isLoading`

## Instance Context

`useInstance()` from `@/contexts/InstanceContext`:
- `instance` — id, name, slug, gameType, access, dates
- `config` — `{ holons, quorum, topicsActivityId }`
- `isLoading`

Read Holon amounts and quorum settings from `useInstance().config` rather than fetching separately.

## Shared Activity Engine

Components, types, and utils live in `packages/activities`. Import from `@hs/activities`:

```ts
import { MappingGrid, REGISTRY, ActivityTypeIcon, getActivityTypeLabel } from '@hs/activities';
import type { HoloscopicActivity, ResultsViewProps } from '@hs/activities';
```

`@/models/Activity`, `@/utils/formatting`, `@/utils/validation`, `@/utils/urlUtils` are thin re-exports from `@hs/activities`.

## Three-Tier Structure

1. **Topics** (`/topics`) — nominations seeking quorum
2. **Inquiry** (`/inquiry`) — confirmed sessions
3. **Algorithms** (`/algorithms`) — published patterns with sessions

## Key Patterns

- All models use a custom `id` field (8-char random string), not `_id`
- Tailwind v4 — CSS vars in globals.css, `@source` directive scans `packages/activities/src`
- Warm dark theme: bg `#1A1714`, cards `#252120`, accent `#C83B50`
- Use CSS vars for colors (`var(--accent)` etc.), not Tailwind color utilities
