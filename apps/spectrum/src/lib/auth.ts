import { createAuthOptions } from '@hs/auth';

// The shared Holoscopic auth stack (@hs/auth, M2) — same account in every
// app, one session cookie across *.holoscopic.io.
export const authOptions = createAuthOptions();
