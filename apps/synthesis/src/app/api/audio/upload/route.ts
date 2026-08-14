import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

// The Blob client-token route.
//
// It issues a short-lived token that lets the browser PUT the recording
// straight to Vercel Blob. The audio never passes through this Next server and
// never through the Render backend either — which is what makes a sixty-second
// recording on a bad connection feasible, and why the backend only ever
// validates a URL (utils/threshold.js#normalizeAudio).
//
// Shaped after Chorus's, deliberately: the two apps have separate stores and
// separate pathname prefixes, but the browser quirks this guards against are
// the same ones, and diverging here means learning them twice.

export const runtime = 'nodejs';

// Generous for a five-minute note (MAX_SECONDS) from a browser that encodes
// inefficiently, tight enough that this is not a free file host.
const MAX_BYTES = 25 * 1024 * 1024;

// Blob matches this list against the upload's content type by EXACT STRING —
// no MIME parsing, so `audio/mp4;codecs=mp4a.40.2` and `audio/mp4; codecs=…`
// are two different entries, and Safari spells it with the space. That exact
// difference killed the first live iPhone recording in Chorus at the upload
// step while Android sailed through. The client sends the BASE type with the
// parameter stripped (@hs/audio#baseMimeType), so only the first five can
// arrive from current code; the parameterised spellings stay for a phone still
// holding the previous bundle — which is exactly the phone in the middle of
// recording when a deploy lands.
const ALLOWED = [
  'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/aac',
  'audio/webm;codecs=opus', 'audio/webm; codecs=opus',
  'audio/mp4;codecs=mp4a.40.2', 'audio/mp4; codecs=mp4a.40.2',
  'audio/ogg;codecs=opus', 'audio/ogg; codecs=opus',
];

export async function POST(request: Request): Promise<NextResponse> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    // Fail loudly and specifically. Without this the browser gets an opaque
    // 500 mid-upload, moments after somebody told a story they will not
    // cheerfully tell twice.
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
      onBeforeGenerateToken: async (pathname) => {
        // One deployment serves every circle, so this server does not know
        // which one it is issuing for and does not need to: the prefix is
        // checked here, and the backend independently validates the returned
        // URL against its blob host allowlist before storing it.
        if (!pathname.startsWith('synthesis/')) {
          throw new Error('Unexpected upload path');
        }
        return {
          allowedContentTypes: ALLOWED,
          maximumSizeInBytes: MAX_BYTES,
          // Two people recording on the same topic in the same second must not
          // collide, and a guessable path would let anyone walk a circle's
          // recordings without ever being a member of it.
          addRandomSuffix: true,
          // Recordings are never rewritten — re-recording uploads a new object.
          cacheControlMaxAge: 60 * 60 * 24 * 365,
          tokenPayload: JSON.stringify({ pathname }),
        };
      },
      // Fires server-to-server after the upload lands. Nothing to do: the
      // browser posts the URL to the backend itself, and that write is what
      // makes the recording a story. An uploaded-but-never-submitted object is
      // an abandoned draft, not an orphan to chase.
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
