import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import type { NextAuthOptions } from 'next-auth';
import crypto from 'node:crypto';

// The game-token route handler (PLATFORM.md M2): a short-lived HS256 JWT
// signed from the verified NextAuth session. The backend
// (middleware/verifyUser.js) derives the caller's identity from it instead
// of trusting a client-supplied x-user-id header.
//
// New over the five copies this replaces: `aud` (which app minted the token)
// and `iss` ('holoscopic'). One shared secret signs every app's tokens, so
// before these claims existed any app's token was valid on every route with
// nothing even recording which app it came from. The backend rejects a wrong
// `iss` and records `aud`; per-route audience enforcement is the later
// tightening (Q3 is the fuller secret split).

const ISSUER = 'holoscopic';
const TTL_SEC = 15 * 60;

function signHS256(payload: Record<string, unknown>, secret: string): string {
  const enc = (o: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = enc({ alg: 'HS256', typ: 'JWT' });
  const body = enc(payload);
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

export function createGameTokenHandler(authOptions: NextAuthOptions, { aud }: { aud: string }) {
  return async function GET() {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const secret = process.env.GAME_TOKEN_SECRET || process.env.NEXTAUTH_SECRET;
    if (!secret) {
      return NextResponse.json({ error: 'Auth not configured' }, { status: 503 });
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const token = signHS256(
      { sub: userId, iat: nowSec, exp: nowSec + TTL_SEC, aud, iss: ISSUER },
      secret,
    );
    return NextResponse.json({ token, expiresAt: (nowSec + TTL_SEC) * 1000 });
  };
}
