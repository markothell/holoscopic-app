# Holoscopic

**Games for seeing and learning as a collective.**

Holoscopic is a collective-sensemaking platform. Groups play structured conversation games — mapping their perspectives on shared spectrums, commenting on each other's views, and voting with a small token economy that keeps participation honest. The result of every game is a picture: a map of where a group actually stands, made by the group itself.

> Culture is technology. We just haven't learned to build it *intentionally.*

The thinking behind the platform lives at [Seeing Wholes](https://markothell.substack.com), and the games are playable at [holoscopic.io](https://holoscopic.io).

<!-- TODO: screenshot/GIF of a live On a Spectrum map here -->

## The games

| Game | Where | What it is |
|---|---|---|
| **On a Spectrum** | [spectrum.holoscopic.io](https://spectrum.holoscopic.io) | A timed party game for organizing collective minds: brainstorm a web of subtopics around a topic, then map them together — one theme per round, tokens staked and returned, live maps built by ranking items along spectrums the players choose. |
| **interView** | [holoscopic.io](https://holoscopic.io) | A cultural bridge-building conversation game: topics seek quorum, confirmed sessions map the group's perspectives on a 2D grid, and successful patterns are published as reusable algorithms. |
| **Map + Sequence** | [holoscopic.io/map-sequence](https://holoscopic.io/map-sequence) | The original tools: compose a mapping activity (two axes, a comment prompt), then chain activities into facilitated sequences. |

## How it works

Every game is built on the same core mechanic: participants place entries in a shared space (a 1D spectrum or 2D grid), attach short written perspectives, and vote on each other's contributions. A token economy ("holons") makes attention scarce and commitments real — staking to nominate, earning by contributing, quorums to confirm that a group actually wants a conversation before it starts.

The platform is multi-tenant: one backend serves many isolated deployments ("instances"), each with its own economy, quorum rules, and data scope. Every On a Spectrum game room is its own instance.

## Architecture

```
holoscopic/
├── apps/
│   ├── spectrum/          On a Spectrum — Next.js (dev port 4000)
│   ├── backend/           Express + Socket.IO + MongoDB API (dev port 4001)
│   ├── platform/          Admin UI for instance management (dev port 4002)
│   └── holoscopic-game/   interView + Map + Sequence — Next.js (dev port 4003)
├── packages/
│   └── activities/        Shared activity engine and React components
├── turbo.json             Turborepo pipeline
└── render.yaml            Backend deploy config (Render)
```

Frontends are Next.js 15 / React 19 / Tailwind v4, deployed on Vercel. The backend is Express + Socket.IO + Mongoose, deployed on Render. Real-time play (entries, votes, token balances) is pushed over WebSockets.

## Running locally

Requires Node ≥ 18 and a MongoDB instance.

```bash
git clone git@github.com:markothell/holoscopic-app.git
cd holoscopic-app
npm install

npm run dev:backend    # API + sockets on :4001 (needs apps/backend/.env.local)
npm run dev:spectrum   # On a Spectrum on :4000
npm run dev:game       # interView on :4003
npm run dev:platform   # admin on :4002
```

Minimum environment:

- `apps/backend/.env.local` — `MONGODB_URI`, `CLIENT_URL` (comma-separated allowed origins), `PORT=4001`
- `apps/spectrum/.env.local` and `apps/holoscopic-game/.env.local` — `NEXTAUTH_URL`, `NEXTAUTH_SECRET` (must match the backend's), `NEXT_PUBLIC_API_URL`

Each app has a `CLAUDE.md` with deeper architecture notes.

## Status & roadmap

Actively developed by a solo builder. Current focus: guest (no-signup) play and running facilitated games with real groups. Ideas, playtests, and conversation are welcome — open an issue or reach out.

## License

[MIT](LICENSE) © 2026 Mark Othell
