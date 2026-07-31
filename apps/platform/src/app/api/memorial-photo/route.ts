import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';

// The only server route this admin owns: it takes a memorial's subject photo
// and puts it in Vercel Blob, so setting a memorial's face is choosing a file
// rather than finding somewhere on the internet to host one and pasting a URL.
//
// WHY NOT THE BACKEND. The obvious home is the Express server that owns every
// other write — but it runs on Render with no persistent disk declared in
// render.yaml, so anything written to its filesystem is gone at the next deploy
// or restart, and a memorial's photo would quietly 404 weeks later. Blob is
// where Chorus already keeps recordings.
//
// WHY THE FILE PASSES THROUGH HERE, unlike a recording. Recordings use the
// client-upload handshake because they are tens of megabytes and a phone on one
// bar has to talk to Blob directly. A subject photo is downscaled in the browser
// to ~1600px before it is sent (see PhotoField), which lands comfortably inside
// a function's request-body limit — and routing it through the server is what
// lets this be admin-only. A client-upload token handler cannot be: it has to
// answer before it knows who is asking.

export const runtime = 'nodejs';

// Comfortably above a 1600px JPEG and well under the platform's request-body
// ceiling. A file this size arriving means the browser downscale was skipped.
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api';

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// Proves the caller is a live admin AND that the memorial they name exists, by
// spending their own bearer token on an endpoint that already requires one
// (routes/instances.js mounts requireAdmin above GET /:id). Verifying here
// rather than re-implementing the check keeps one definition of "admin" — and
// it re-reads the User row, so an admin demoted five minutes ago cannot still
// upload.
//
// The two failures are reported apart. Answering "sign in required" to a
// perfectly good session that named an unknown instance sends the operator to
// re-authenticate over and over against a problem login cannot fix.
type AuthResult = { ok: true } | { ok: false; status: number; error: string };

async function authorize(request: Request, instanceId: string): Promise<AuthResult> {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Sign in required' };
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}/instances/${encodeURIComponent(instanceId)}`, {
      headers: { Authorization: auth },
      cache: 'no-store',
    });
  } catch {
    return { ok: false, status: 502, error: 'Could not reach the server to check your session.' };
  }
  if (res.ok) return { ok: true };
  if (res.status === 404) {
    return { ok: false, status: 404, error: 'That instance no longer exists.' };
  }
  return { ok: false, status: 401, error: 'Sign in required' };
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    // Named, not a generic 500. Connecting the Blob store to this Vercel
    // project is what injects this token, and a store connected to nothing
    // fails in production alone while local development keeps working from
    // .env.local — so the message has to say which knob is missing.
    return NextResponse.json(
      { error: 'Photo storage is not configured on this deployment (BLOB_READ_WRITE_TOKEN).' },
      { status: 503 },
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const instanceId = String(form?.get('instanceId') || '');
  const slug = String(form?.get('slug') || '');

  if (!(file instanceof File) || !instanceId || !slug) {
    return NextResponse.json({ error: 'Expected a file, an instanceId and a slug.' }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { error: 'Choose a JPEG, PNG or WebP image.' },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That image is ${Math.round(file.size / 1024 / 1024)}MB — the limit is 4MB.` },
      { status: 413 },
    );
  }
  const auth = await authorize(request, instanceId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const blob = await put(
      // Same namespace-per-memorial shape as recordings, so one memorial's
      // objects can be found and removed together.
      `memorial/${slug}/photo/${Date.now()}.${EXTENSION[file.type]}`,
      file,
      {
        access: 'public',
        contentType: file.type,
        // A curator replacing the photo uploads a new object rather than
        // overwriting; the old URL keeps working for anything already holding
        // it, and a guessable path would let anyone enumerate memorials.
        addRandomSuffix: true,
        cacheControlMaxAge: 60 * 60 * 24 * 365,
      },
    );
    // The caller drops this into the photo url field. Nothing is saved on the
    // instance until they press Save — an upload they change their mind about
    // is an orphaned blob, not a changed memorial.
    return NextResponse.json({ url: blob.url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 },
    );
  }
}
