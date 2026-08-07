'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  useRecorder, createStash, formatDuration, canRecord,
  type Recording, type RecorderErrorCode,
} from '@hs/audio';
import { uploadRecording } from '@/services/api';
import type { ShareAudio } from '@/lib/types';

// Threshold's recorder. @hs/audio owns the browser — MediaRecorder, the format
// split, the timer, the stash — and this file owns the words and the look,
// which is the whole point of that boundary (D18). Errors cross as a code and
// are given sentences here.
//
// THE CAP IS THE SEED'S OWN `secondsPerNote`. The hook stops itself at it; what
// this adds is a countdown you can see coming, because a recording cut off
// mid-sentence at a length nobody mentioned is a story lost, not a rule
// enforced.
//
// Duration comes from the hook's timer, never from the file: iOS MP4 carries no
// duration metadata and every player reads it as Infinity.

// The three codes @hs/audio can return, in Threshold's voice. Each says what
// happened and what to do about it — a person who has just been refused a
// microphone needs the next step, not a diagnosis.
const ERRORS: Record<RecorderErrorCode, string> = {
  denied:
    'Your browser is holding the microphone back. Allow it for this site and try again — or type your story instead, which counts exactly the same.',
  failed:
    'The microphone would not start. Trying again often works; typing it instead counts exactly the same.',
  empty:
    'That recording came out empty, which some phones do without warning. Have another go, or type it instead.',
};

export default function Recorder({ seedId, maxSeconds, onDone, onCancel }: {
  seedId: string;
  maxSeconds: number;
  onDone: (audio: ShareAudio) => void;
  onCancel: () => void;
}) {
  const [recording, setRecording] = useState<Recording | null>(null);
  const [uploading, setUploading] = useState(false);
  const [percent, setPercent] = useState(0);
  const [sendError, setSendError] = useState<string | null>(null);

  // A recording that reached IndexedDB survives a reload, which matters most on
  // the phone that just dropped its connection mid-upload. Its own database,
  // not Chorus's — the two apps share a browser on this laptop and nothing else.
  const stash = useMemo(() => createStash({ dbName: 'threshold-audio' }), []);

  const rec = useRecorder({
    maxSeconds,
    recording,
    onRecording: r => setRecording(r),
    stash,
    scope: seedId,
  });

  const [supported, setSupported] = useState(true);
  useEffect(() => { setSupported(canRecord()); }, []);

  if (!supported) {
    return (
      <Frame onCancel={onCancel}>
        <p className="text-sm leading-relaxed text-ink-soft">
          This browser has no way to record. Type your story instead — it counts exactly the same,
          and the group reads both the same way.
        </p>
      </Frame>
    );
  }

  const send = async () => {
    if (!recording) return;
    setUploading(true);
    setSendError(null);
    setPercent(0);
    try {
      const { url, pathname } = await uploadRecording(recording.blob, {
        seedId,
        mimeType: recording.mimeType,
        onProgress: setPercent,
      });
      onDone({
        url,
        pathname,
        contentType: recording.mimeType,
        // The client's own timer, never the file's metadata.
        durationMs: recording.durationMs,
        peaks: recording.peaks,
        sizeBytes: recording.blob.size,
      });
    } catch (e) {
      // The bytes go browser → Blob directly, so a failure here is invisible to
      // every server we own. Say so plainly and keep the take: the recording is
      // still in hand and still on this phone.
      setSendError(
        e instanceof Error && /not configured/i.test(e.message)
          ? 'Recording storage is not set up on this deployment yet. Your take is safe on this phone; typing it instead works today.'
          : 'That did not reach us. Your recording is still here — try sending it again.',
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <Frame onCancel={onCancel}>
      {rec.error && <p className="mb-3 text-sm leading-relaxed text-pole-b">{ERRORS[rec.error]}</p>}
      {sendError && <p className="mb-3 text-sm leading-relaxed text-pole-b">{sendError}</p>}

      {rec.state === 'recording' && (
        <>
          <Wave peaks={rec.livePeaks} live />
          <p className="mt-3 text-center text-sm tabular-nums text-ink-soft">
            {formatDuration(rec.elapsedMs)}
            <span className="text-ink-faint"> / {formatDuration(maxSeconds * 1000)}</span>
          </p>
          {/* Visible before it bites, not after. */}
          {rec.remainingMs <= 10_000 && (
            <p className="mt-1 text-center text-xs text-ink-faint">
              {Math.ceil(rec.remainingMs / 1000)}s left — it stops itself
            </p>
          )}
          <div className="mt-4 flex justify-center">
            <button type="button" onClick={rec.stop} className={primary}>Done</button>
          </div>
        </>
      )}

      {rec.state === 'review' && recording && (
        <>
          <Wave peaks={recording.peaks} />
          <p className="mt-3 text-center text-sm tabular-nums text-ink-soft">
            {formatDuration(recording.durationMs)}
            {rec.timedOut && <span className="text-ink-faint"> · it reached the limit</span>}
          </p>
          {rec.previewUrl && (
            <audio controls src={rec.previewUrl} className="mt-3 w-full" />
          )}
          <div className="mt-4 flex items-center justify-center gap-4">
            <button type="button" onClick={send} disabled={uploading} className={primary}>
              {uploading ? `Sending ${percent}%` : 'Use this take'}
            </button>
            <button type="button" onClick={rec.discard} disabled={uploading} className={quiet}>
              Record again
            </button>
          </div>
        </>
      )}

      {(rec.state === 'idle' || rec.state === 'starting') && (
        <div className="text-center">
          <p className="mb-4 text-sm leading-relaxed text-ink-soft">
            Up to {maxSeconds} seconds. It stops itself at the end.
          </p>
          <button
            type="button"
            onClick={rec.start}
            disabled={rec.state === 'starting'}
            className={primary}
          >
            {rec.state === 'starting' ? 'Starting…' : 'Start recording'}
          </button>
        </div>
      )}
    </Frame>
  );
}

const primary =
  'inline-flex items-center justify-center rounded-lg bg-ink px-5 py-3 text-[15px] font-medium ' +
  'text-ground transition-opacity hover:opacity-90 disabled:opacity-50';
const quiet =
  'text-sm text-ink-soft underline decoration-[var(--rule-strong)] underline-offset-4 ' +
  'hover:text-ink disabled:opacity-50';

function Frame({ children, onCancel }: { children: React.ReactNode; onCancel: () => void }) {
  return (
    <div className="rounded-xl border border-[var(--rule)] p-4">
      {children}
      <div className="mt-4 text-center">
        <button type="button" onClick={onCancel} className={quiet}>Type it instead</button>
      </div>
    </div>
  );
}

/**
 * The waveform. Decorative — the duration is written out beside it, so nothing
 * here is the only way to know anything.
 */
function Wave({ peaks, live = false }: { peaks: number[]; live?: boolean }) {
  const bars = peaks.length ? peaks : new Array(32).fill(0.04);
  return (
    <div aria-hidden className="flex h-12 items-center justify-center gap-[2px]">
      {bars.slice(-64).map((p, i) => (
        <span
          key={i}
          className="w-[3px] shrink-0 rounded-full"
          style={{
            height: `${Math.max(3, Math.min(1, p) * 48)}px`,
            background: live ? 'var(--pole-b)' : 'var(--threshold)',
          }}
        />
      ))}
    </div>
  );
}
