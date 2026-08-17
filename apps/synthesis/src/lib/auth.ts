import { createAuthOptions } from '@hs/auth';

// The shared Holoscopic auth stack (@hs/auth, M2) — same account in every
// app, one session cookie across *.holoscopic.io. (Synthesis sits behind the
// `synthesis` parent instance, see services/api.ts.)
export const authOptions = createAuthOptions();
