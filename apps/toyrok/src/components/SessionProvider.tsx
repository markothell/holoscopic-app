'use client';

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';

// A client boundary around next-auth's provider, so the root layout can stay a
// Server Component. Same shape as the other apps on this backend.
export function SessionProvider({ children }: { children: React.ReactNode }) {
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>;
}
