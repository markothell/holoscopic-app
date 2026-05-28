# Holoscopic Monorepo

```
holoscopic/
├── apps/
│   ├── holoscopic-game/       ← game frontend (Next.js, port 3000)
│   ├── platform/              ← admin platform (Next.js, port 3002)
│   └── backend/               ← shared API + WebSocket server (Express, port 3001)
├── packages/
│   └── activities/            ← shared activity engine (@hs/activities)
├── package.json               ← npm workspaces + Turborepo
└── render.yaml
```

## Running Locally

```bash
npm run dev:backend     # port 3001
npm run dev:game        # port 3000
npm run dev:platform    # port 3002
```

## Multi-Tenancy

Every API request is resolved to an instance via `apps/backend/middleware/resolveInstance.js`.

Resolution order:
1. `x-instance-id` request header
2. `Origin`/`Referer` header → domain lookup on `Instance.domains[]`
3. Default instance (auto-created if missing)

Key models:
- `Instance` — config per instance (holons, quorum, topicsActivityId, domains, access, dates)
- `InstanceMembership` — per-user per-instance Holon balance

All game data (Topic, Algorithm, AlgorithmProposal, HolonTransaction) carries `instanceId`. All queries should be filtered by `instanceId: req.instanceId`. The `transact()` and `spend()` helpers in `utils/holons.js` require `instanceId`.

## CORS

Allowed origins set via `CLIENT_URL` in `apps/backend/.env.local` (comma-separated). Add new game domains here when deploying.
