// All HTTP goes through here. Identity-bearing mutations attach a
// short-lived game token minted from the NextAuth session by
// /api/auth/game-token; the backend's enforceVerifiedUser checks that the
// token's sub matches the claimed x-user-id.
import { createApiFetch } from '@hs/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api';

// The PARENT instance for On a Spectrum — used for auth, create, and join.
// In-game requests (map entries/votes) override with the room's own
// instance id so their content scopes to the room.
export const PARENT_INSTANCE_ID = process.env.NEXT_PUBLIC_INSTANCE_ID || 'spectrum';

// The token cache, error shape and fetch body are @hs/api's (M2) — the same
// deduped mint every app now shares. getGameToken stays exported for the
// Socket.IO handshake: the server derives the personal room (`user:<id>`)
// from the verified token instead of trusting the userId the client emits.
export { ApiError, getGameToken, clearGameToken } from '@hs/api';

export const apiFetch = createApiFetch({ apiBase: API_BASE, instanceId: PARENT_INSTANCE_ID });
