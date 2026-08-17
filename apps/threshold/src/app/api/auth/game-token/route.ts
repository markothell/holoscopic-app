import { createGameTokenHandler } from '@hs/auth';
import { authOptions } from '@/lib/auth';

// Short-lived identity token minted from the NextAuth session (@hs/auth, M2).
// The backend (middleware/verifyUser.js) derives the caller's identity from
// it; `aud: 'threshold'` records which app minted it.
export const GET = createGameTokenHandler(authOptions, { aud: 'threshold' });
