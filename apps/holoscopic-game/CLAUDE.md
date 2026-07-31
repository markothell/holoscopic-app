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
- `socket` — persistent Socket.IO connection for the logged-in user; `null` when unauthenticated

The `AuthContext` opens a Socket.IO connection per authenticated user and joins `user:<userId>` room. It listens for `holon_update` events to keep `holonBalance` current without polling. Pass `socket` to hooks that need live push (e.g., `useNotifications`).

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
Used for standalone activity pages and sequence activities. Entry point: `/a/[activityName]` and `/sequence/[urlName]`. **There is no root-level `/[activityName]` route** — this file said there was, and two call sites believed it, so every enrolled member clicking "Participate" in a sequence got a 404.
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

## Services

All API calls go through typed service objects in `src/services/`. Never call `apiFetch` directly in pages or hooks — services handle the response envelope and expose typed values.

| Service | Notes |
|---|---|
| `ActivityService` | Class-based; `submitEntry` (position+text in one call) and `voteEntry`; plain-object envelope |
| `PatternService` | Object literal; uses `apiFetch` |
| `SequenceService` | Object literal; userId in request body (not header) for most routes |
| `TopicService` | Object literal; `get` returns `Topic` directly (not `{ topic }`) |
| `FrameRefService` | Object literal; `get` returns `FrameRef` directly |
| `UserService` | Object literal; method names: `getSettings`, `updateSettings` |
| `AdminService` | Object literal; userId via header (x-user-id), not body |
| `NotificationService` | Object literal; `list`, `markRead`, `markAllRead` |

Admin routes pass `userId` via `apiFetch({ userId })` which sets the `x-user-id` header. Sequence routes pass `userId` in the request body. All other routes also use the header.

## Key Patterns

- All models use a custom `id` field (8-char random string), not `_id`
- Activity payloads carry `entries[]` (see `packages/activities/CLAUDE.md`); live play updates arrive as `entry_upserted`/`entry_voted`/`entries_cleared` socket events
- Player profiles are game-scoped: `/profile/[userId]` = cross-game history; `/profile/[userId]?game={slug}` = redacted personal map (`components/graph/PlayerMap.tsx`)
- Tailwind v4 — CSS vars in globals.css, `@source` directive scans `packages/activities/src`
- Warm light theme: bg `var(--bg-primary)` #F7F4EF, accent `var(--accent)` #C83B50 (+ `--accent-hover` #B03248)
- Use CSS vars for colors (`var(--accent)` etc.), not Tailwind color utilities or raw hex
- Known debt: many `*.module.css` files and the CreatePanel components still repeat palette values as literal hex instead of the globals.css vars — migrate opportunistically when touching those files, don't boil the ocean
- `NEXT_PUBLIC_SERVER_URL` must be set in production `.env` for Socket.IO to connect (defaults to `http://localhost:3001`)
