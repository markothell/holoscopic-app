import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { INSTANCE_ID } from '@/services/api';

// The ONLY server route this app owns.
//
// It issues a short-lived token that lets the browser PUT the recording
// straight to Vercel Blob. The audio never passes through this server, and it
// never passes through the Render backend either — that's what makes a
// three-minute recording on a bad connection feasible at all, and it's why the
// backend only ever validates a URL (utils/memories.js#assertAllowedAudioUrl).

export const runtime = 'nodejs';

// Generous enough for a three-minute Opus recording with headroom for a
// browser that encodes less efficiently, tight enough that this isn't a free
// file host.
const MAX_BYTES = 25 * 1024 * 1024;

const ALLOWED = [
  'audio/webm', 'audio/webm;codecs=opus',
  'audio/mp4', 'audio/mp4;codecs=mp4a.40.2',
  'audio/ogg', 'audio/ogg;codecs=opus',
  'audio/mpeg', 'audio/aac',
];

export async function POST(request: Request): Promise<NextResponse> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    // Fail loudly and specifically. Without this the browser gets an opaque
    // 500 mid-upload, right after someone recorded their memory — the worst
    // possible moment for a vague error.
    return NextResponse.json(
      { error: 'Recording storage is not configured on this deployment (BLOB_READ_WRITE_TOKEN).' },
      { status: 503 },
    );
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED,
        maximumSizeInBytes: MAX_BYTES,
        // Two people recording "the kitchen radio" in the same second must not
        // collide, and a guessable path would let anyone enumerate a
        // memorial's recordings.
        addRandomSuffix: true,
        // Recordings are never rewritten — a re-record uploads a new object.
        // Long cache means the second listener gets it from the CDN edge.
        cacheControlMaxAge: 60 * 60 * 24 * 365,
        tokenPayload: JSON.stringify({ instanceId: INSTANCE_ID }),
      }),
      // Fires server-to-server after the upload lands. Nothing to do here: the
      // browser posts the URL to the backend itself, and that write is what
      // makes the recording a memory. Uploaded-but-never-referenced blobs are
      // abandoned drafts, not orphans to chase.
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 400 },
    );
  }
}
