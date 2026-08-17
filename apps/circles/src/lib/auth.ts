import { createAuthOptions } from '@hs/auth';

// The shared Holoscopic auth stack (@hs/auth, M2) — these are Holoscopic
// accounts, said plainly (P18): same backend, same global User collection,
// one session cookie across *.holoscopic.io.
export const authOptions = createAuthOptions();
