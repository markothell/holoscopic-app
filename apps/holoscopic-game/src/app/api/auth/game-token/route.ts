import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import crypto from 'node:crypto';
import { authOptions } from '@/lib/auth';

/**
 * Issues a short-lived token signed from the verified NextAuth session.
 * The backend verifies it (middleware/verifyUser.js) and derives the user
 * identity from it instead of trusting a client-supplied x-user-id header.
 *
 * Standard HS256 JWT signed with node:crypto — no extra dependency.
 */
function signHS256(payload: Record<string, unknown>, secret: string): string {
  const enc = (o: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = enc({ alg: 'HS256', typ: 'JWT' });
  const body = enc(payload);
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

export async function GET() {
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
  const expiresInSec = 15 * 60;
  const token = signHS256({ sub: userId, iat: nowSec, exp: nowSec + expiresInSec }, secret);
  return NextResponse.json({ token, expiresAt: (nowSec + expiresInSec) * 1000 });
}
