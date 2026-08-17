import { createAuthOptions } from '@hs/auth';

// The shared Holoscopic auth stack (@hs/auth, M2): credentials against the
// one backend, one session cookie across *.holoscopic.io, emailVerified in
// the session.
export const authOptions = createAuthOptions();
