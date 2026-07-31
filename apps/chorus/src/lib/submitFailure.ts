// What went wrong sending a memory, and whether trying again can fix it.
//
// This exists because "Try again" is a promise. A dropped connection deserves
// that button; a content type the storage layer refuses deserves an honest
// answer and a report to the people who can deploy a fix, because the same tap
// would fail forever. The first live iPhone recording hit exactly that case
// and was shown the raw vendor string —
//   Vercel Blob: Content type mismatch, "contentType" audio/webm; codecs=opus
//   is not allowed.
// — to somebody who had just recorded ninety seconds about a person who died.
// Vendor text goes to `detail`, which only the failure beacon reads.

import { ApiError } from '@/services/api';

export type FailureKind =
  /** Transient. Another attempt is likely to work, so one is made automatically. */
  | 'retry-now'
  /** Real but bounded — a rate limit, a restarting server. Time fixes it. */
  | 'retry-later'
  /** Nothing the contributor can do changes the outcome; it needs a deploy. */
  | 'blocked';

export type FailureStage = 'upload' | 'create';

export interface SubmitFailure {
  kind: FailureKind;
  stage: FailureStage;
  /** Short stable slug for the beacon, so failures group in the logs. */
  code: string;
  /** The vendor/server text. Reported, never rendered. */
  detail: string;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? '');
}

export function classifyFailure(err: unknown, stage: FailureStage): SubmitFailure {
  const detail = messageOf(err).slice(0, 300);
  const m = detail.toLowerCase();
  const of = (kind: FailureKind, code: string): SubmitFailure => ({ kind, stage, code, detail });

  if (err instanceof ApiError) {
    if (err.status === 429) return of('retry-later', 'rate-limited');
    if (err.status === 503) return of('retry-later', 'server-unavailable');
    if (err.status === 404) return of('blocked', 'memorial-not-found');
    if (err.status === 401 || err.status === 403) return of('blocked', 'contributor-rejected');
    if (err.status >= 500) return of('retry-now', 'server-error');
    // 400 from the funnel is a rule this memory breaks — a missing story, a
    // rejected audio host. Another identical attempt breaks it identically.
    return of('blocked', `request-rejected-${err.status}`);
  }

  // Blob's own failures arrive as messages, not status codes.
  if (m.includes('content type')) return of('blocked', 'content-type-rejected');
  if (m.includes('failed to retrieve the client token')) return of('blocked', 'no-upload-token');
  if (m.includes('storage is not configured')) return of('blocked', 'blob-unconfigured');
  if (m.includes('this store does not exist')) return of('blocked', 'store-missing');
  if (m.includes('cannot be greater') || m.includes('too large')) return of('blocked', 'too-large');
  if (m.includes('rate limit')) return of('retry-later', 'blob-rate-limited');
  if (m.includes('expired')) return of('retry-now', 'token-expired');
  if (m.includes('fetch failed') || m.includes('network') || m.includes('load failed')) {
    return of('retry-now', 'network');
  }

  // Anything unrecognised is treated as transient. A wasted retry costs a few
  // seconds; wrongly telling someone their memory can never be sent costs the
  // memory.
  return of('retry-now', 'unknown');
}

/**
 * What the contributor reads. Never includes `detail`.
 *
 * `stashed` is the answer to "is the recording actually safe on this phone" —
 * it comes from whether the IndexedDB write returned true, so the reassuring
 * sentence appears only when it is true.
 */
export function failureMessage(
  failure: SubmitFailure,
  { hasRecording, stashed }: { hasRecording: boolean; stashed: boolean },
): string {
  const safety = hasRecording
    ? (stashed
      ? 'Your recording is saved on this phone.'
      : 'Your recording is here as long as this page stays open.')
    : 'Your words are still here.';

  // An upload that has stopped working is the one failure with a way through
  // it: the words can go now, on their own, and reach the wall in the moment
  // the person is actually here. Everything else is a wait.
  if (failure.stage === 'upload' && failure.kind !== 'retry-now') {
    return `Recordings are failing to send right now. ${safety} Type the story instead and send it now — that part is working.`;
  }

  switch (failure.kind) {
    case 'retry-now':
      return `The connection dropped while sending. ${safety} Tap Send to try again.`;
    case 'retry-later':
      return failure.code === 'rate-limited'
        ? `That is a lot of memories from this connection in one hour. ${safety} Try again in a little while.`
        : `The server is busy coming back up. ${safety} Try again in a few minutes.`;
    case 'blocked':
      return `Sending is failing on our end, and a report has just gone to the people who can fix it. ${safety}`;
  }
}
