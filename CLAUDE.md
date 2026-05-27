# Holoscopic v2 — Claude Instructions

## Project Overview

Cultural bridge-building game. Fully standalone Next.js app with its own backend server. No dependency on 06_holoscopic.

## Server Architecture

- **Backend source of truth**: `server/` in this directory — runs locally at localhost:3001
- **Production backend**: deploy `server/` to Render (separate service from 06)
- **NEVER edit 06_holoscopic's server** for changes meant for this project

## Running Locally

Two terminals:

```
# Terminal 1 — backend
cd server && node websocket-server.js

# Terminal 2 — frontend
npm run dev
```

Frontend at localhost:3000, backend at localhost:3001.

## Environment

- `NEXT_PUBLIC_API_URL` — API base URL (default: http://localhost:3001/api)
- `NEXTAUTH_URL` — this app's URL (default: http://localhost:3000)
- `NEXTAUTH_SECRET` — JWT secret

## API Utility

Use `apiFetch` from `@/lib/api.ts` for all backend calls. Pass `userId` option for authenticated requests — adds the `x-user-id` header the backend expects.

```ts
import { apiFetch } from '@/lib/api';
const data = await apiFetch('/topics', { userId });
```

## Auth

NextAuth credentials provider. `useAuth()` from `@/contexts/AuthContext` gives:
- `userId`, `userEmail`, `userName`, `userRole`
- `holonBalance` — call `refreshBalance()` after any Holon transaction
- `isAuthenticated`, `isLoading`

## Three-Tier Structure

1. **Topics** (`/topics`) — nominations seeking quorum; each on its own countdown
2. **Inquiry** (`/inquiry`) — confirmed sessions: scheduled → in-progress → completed
3. **Algorithms** (`/algorithms`) — published patterns with AlgorithmSessions

## Holon Economy

- Starting stake awarded on signup (configured in AdminConfig)
- Nomination and algorithm publishing cost Holons
- Wagered Holons returned if quorum not reached; pooled if reached
- Pool distributes to host + participants on completion
- Never hardcode Holon amounts — fetch from `/api/admin/config`

## Key Patterns

- All models use custom `id` field (8-char UUID), not MongoDB `_id`
- Tailwind v4 with CSS vars in globals.css (--bg-primary, --accent, etc.)
- Warm dark theme: bg #1A1714, cards #252120, accent #C83B50
- Use CSS vars directly for colors, not Tailwind color utilities
