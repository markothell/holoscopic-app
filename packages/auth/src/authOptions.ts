import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

// The ONE auth stack (PLATFORM.md M2). Every account-bearing app exports
// `createAuthOptions()` from its src/lib/auth.ts — five byte-near-identical
// copies collapsed here, plus the three things the copies all lacked:
//
//   1. An explicit `cookies:` block. Without one, NextAuth's defaults scope
//      the session cookie to the issuing host, so signing in on one subdomain
//      is invisible to every other. With AUTH_COOKIE_DOMAIN=.holoscopic.io
//      (production only — leave it unset on localhost, where a Domain
//      attribute would be rejected), one session cookie serves the apex.
//   2. The CSRF cookie renamed off NextAuth's secure-context default
//      `__Host-` prefix, which forbids a Domain attribute outright.
//      `__Secure-` keeps the https-only guarantee and allows the domain.
//   3. `emailVerified` carried through. POST /auth/login has always returned
//      it and every copy dropped it on the floor, so no frontend session
//      could tell a verified account from an unverified one.
//
// Session and callback-url cookie NAMES match NextAuth's defaults, so
// existing production sessions survive the cutover: the old host-scoped
// cookie keeps its name and stays valid; the next sign-in writes the
// domain-wide one.

export interface HsUser {
  id: string;
  email: string;
  name?: string;
  role?: string;
  emailVerified?: boolean;
}

function sharedCookies() {
  // https detection mirrors NextAuth's own `useSecureCookies` default.
  const secure = (process.env.NEXTAUTH_URL || '').startsWith('https://');
  const domain = process.env.AUTH_COOKIE_DOMAIN || undefined;
  const base = { sameSite: 'lax' as const, path: '/', secure, domain };
  return {
    sessionToken: {
      name: secure ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
      options: { ...base, httpOnly: true },
    },
    callbackUrl: {
      name: secure ? '__Secure-next-auth.callback-url' : 'next-auth.callback-url',
      options: { ...base, httpOnly: false },
    },
    csrfToken: {
      // Default would be `__Host-next-auth.csrf-token` on https — renamed (M2).
      name: secure ? '__Secure-next-auth.csrf-token' : 'next-auth.csrf-token',
      options: { ...base, httpOnly: true },
    },
  };
}

export function createAuthOptions(opts: { apiBase?: string } = {}): NextAuthOptions {
  const apiBase =
    opts.apiBase || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api';

  return {
    providers: [
      CredentialsProvider({
        name: 'credentials',
        credentials: {
          email: { label: 'Email', type: 'email' },
          password: { label: 'Password', type: 'password' },
        },
        // Typed loosely: the apps disagree on their next-auth `User`
        // augmentations (holoscopic-game requires `name: string`), and this
        // object is exactly what all five copies returned.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async authorize(credentials): Promise<any> {
          if (!credentials?.email || !credentials?.password) {
            throw new Error('Email and password required');
          }
          const res = await fetch(`${apiBase}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.success) {
            throw new Error(data.error || 'Authentication failed');
          }
          return {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            role: data.user.role,
            emailVerified: Boolean(data.user.emailVerified),
          } as HsUser & { emailVerified: boolean };
        },
      }),
    ],

    callbacks: {
      async jwt({ token, user }) {
        if (user) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const t = token as any;
          t.id = user.id;
          t.email = user.email;
          t.name = user.name;
          t.role = (user as HsUser).role;
          t.emailVerified = (user as HsUser).emailVerified;
        }
        return token;
      },
      async session({ session, token }) {
        if (session.user) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const u = session.user as any;
          u.id = token.id;
          u.role = token.role;
          u.emailVerified = token.emailVerified;
        }
        return session;
      },
    },

    pages: {
      signIn: '/login',
      signOut: '/',
      error: '/login',
    },

    session: {
      strategy: 'jwt',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    },

    cookies: sharedCookies(),

    secret: process.env.NEXTAUTH_SECRET,
  };
}
