import { createAuthOptions } from '@hs/auth';

// The shared Holoscopic auth stack (@hs/auth, M2) — same account in every
// app, one session cookie across *.holoscopic.io.
//
// Threshold has accounts by design (PLAN.md D6), unlike Chorus: asynchronous
// rounds need an identity that persists across weeks and an address to notify
// when a phase turns over. An anonymous contributor token can express neither.
export const authOptions = createAuthOptions();
