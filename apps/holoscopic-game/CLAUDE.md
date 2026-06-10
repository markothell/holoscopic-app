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

## Two Activity Rendering Contexts

Activities are displayed in two fundamentally different contexts. Always identify which one you're in before changing comment panels, headers, or results layout.

### 1. ActivityPageModal (`components/ActivityPageModal.tsx`)
Used for standalone activity pages and sequence activities. Entry point: `/[activityName]` and `/sequence/[urlName]`.
- Comment panel header = **"Comments"** (not the commentQuestion — it clutters the space)
- This is the relationship blueprint / sequence gamespace
- Touch this file for: sequences, direct activity URLs, the resolve/snapshot/dissolve results views in that context

### 2. ResultsView (`packages/activities/src/components/ResultsView.tsx`)
Used inside the inquiry/play gamespace (topic → quorum → confirmed session flow). Entry points: `/inquiry/[topicId]`, `/play`.
- Comment panel header = **`activity.commentQuestion`** (intentional — it's the discussion prompt for the session)
- This is the community game / three-tier structure
- Touch this file for: topic sessions, algorithm runs, the play gamespace

**Never conflate these two.** A change to `ResultsView.tsx` does NOT affect `ActivityPageModal.tsx` and vice versa.

## Three-Tier Structure (Play Gamespace)

1. **Topics** (`/topics`) — nominations seeking quorum
2. **Inquiry** (`/inquiry`) — confirmed sessions
3. **Algorithms** (`/algorithms`) — published patterns with sessions

## Key Patterns

- All models use a custom `id` field (8-char random string), not `_id`
- Tailwind v4 — CSS vars in globals.css, `@source` directive scans `packages/activities/src`
- Warm dark theme: bg `#1A1714`, cards `#252120`, accent `#C83B50`
- Use CSS vars for colors (`var(--accent)` etc.), not Tailwind color utilities
