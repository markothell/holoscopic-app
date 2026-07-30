// Recording a memory. Everything here exists because of one rule: a recorded
// memory must never be lost. Someone's grandmother talked for ninety seconds
// about a garden; losing that to a refresh, a dead connection, or a browser
// quirk is the worst failure this app has.

export interface Recording {
  blob: Blob;
  mimeType: string;
  /** Measured with a timer, NOT read off the file. See pickMimeType. */
  durationMs: number;
  peaks: number[];
}

// Feature-detect, never hardcode. Chrome/Android/Firefox produce WebM/Opus;
// Safari and every iOS browser produce MP4/AAC. Hardcoding webm is the single
// most common way voice recording ships broken on iPhone — MediaRecorder
// constructs fine and then emits an empty or unplayable blob.
export function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  // Some Safari builds support recording but report nothing. An empty string
  // lets the browser choose its own default rather than refusing to record.
  return '';
}

export function canRecord(): boolean {
  return typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== 'undefined'
    && pickMimeType() !== null;
}

export function fileExtensionFor(mimeType: string): string {
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// ── The stash ───────────────────────────────────────────────────────────────
// The recording is written here the moment it stops, BEFORE any upload is
// attempted, so a failed upload or an accidental refresh leaves it recoverable.
// IndexedDB rather than localStorage because this is a binary blob, and
// sessionStorage because a Blob can't be stringified at all.

const DB_NAME = 'chorus';
const STORE = 'stashed-recording';
const STASH_KEY = 'current';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Every stash operation is best-effort. Private browsing, a full disk, or a
// browser with IndexedDB disabled must degrade to "no safety net", never to a
// thrown error in the middle of recording.
export async function stashRecording(rec: Recording): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(
        { blob: rec.blob, mimeType: rec.mimeType, durationMs: rec.durationMs, peaks: rec.peaks, at: Date.now() },
        STASH_KEY,
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // no-op
  }
}

export async function readStashedRecording(): Promise<Recording | null> {
  try {
    const db = await openDb();
    const value = await new Promise<Recording | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(STASH_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!value?.blob) return null;
    return value;
  } catch {
    return null;
  }
}

export async function clearStashedRecording(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(STASH_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    // no-op
  }
}

// ── Peaks ───────────────────────────────────────────────────────────────────

/**
 * Resample a running amplitude series down to a fixed number of bars.
 * Kept pure and exported so it can be tested without an AudioContext.
 */
export function resamplePeaks(samples: number[], bars = 48): number[] {
  if (!samples.length) return [];
  const out: number[] = [];
  const per = samples.length / bars;
  for (let i = 0; i < bars; i++) {
    const start = Math.floor(i * per);
    const end = Math.max(start + 1, Math.floor((i + 1) * per));
    let peak = 0;
    for (let j = start; j < end && j < samples.length; j++) {
      if (samples[j] > peak) peak = samples[j];
    }
    out.push(peak);
  }
  // Normalize to the loudest bar so a quiet recording still draws a waveform
  // rather than a flat line — this is a picture of shape, not of volume.
  const max = Math.max(...out);
  return max > 0 ? out.map(v => Math.round((v / max) * 100) / 100) : out;
}
