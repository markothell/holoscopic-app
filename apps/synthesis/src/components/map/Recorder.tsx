'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  useRecorder, createStash, formatDuration, canRecord,
  type Recording, type RecorderErrorCode,
} from '@hs/audio';
import { uploadRecording } from '@/services/api';
import type { NodeAudio } from '@/lib/types';

// The voice on a thought (D20). @hs/audio owns the browser — MediaRecorder,
// the format split, the timer, the reload-surviving stash — and this file
// owns the words and the dusk look. Errors cross as a code and are given
// sentences here; every one names typing as the way through, because a
// thought's claim is text either way and the voice rides with it.

const MAX_SECONDS = 120;

const ERRORS: Record<RecorderErrorCode, string> = {
  denied:
    'Your browser is holding the microphone back. Allow it for this site and try again — the typed thought carries fine without it.',
  failed:
    'The microphone would not start. Trying again often works; the typed thought carries fine without it.',
  empty:
    'That recording came out empty, which some phones do without warning. Have another go, or let the words stand alone.',
};

export default function Recorder({ instanceId, onDone, onCancel }: {
  instanceId: string;
  onDone: (audio: NodeAudio) => void;
  onCancel: () => void;
}) {
  const [recording, setRecording] = useState<Recording | null>(null);
  const [uploading, setUploading] = useState(false);
  const [percent, setPercent] = useState(0);
  const [sendError, setSendError] = useState<string | null>(null);

  // Its own IndexedDB database — this browser may also hold Chorus's,
  // Threshold's and the circles app's stashes.
  const stash = useMemo(() => createStash({ dbName: 'synthesis-audio' }), []);

  const rec = useRecorder({
    maxSeconds: MAX_SECONDS,
    recording,
    onRecording: r => setRecording(r),
    stash,
    scope: instanceId,
  });

  const [supported, setSupported] = useState(true);
  useEffect(() => { setSupported(canRecord()); }, []);

  if (!supported) {
    return (
      <Frame onCancel={onCancel}>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--mist-soft)' }}>
          This browser has no way to record. The typed thought carries fine without a voice.
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
        instanceId,
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
      setSendError(
        e instanceof Error && /not configured/i.test(e.message)
          ? 'Recording storage is not set up on this deployment yet. Your take is safe on this device; the typed thought works today.'
          : 'That did not reach us. Your recording is still here — try sending it again.',
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <Frame onCancel={onCancel}>
      {rec.error && <p className="mb-3 text-sm leading-relaxed" style={{ color: 'var(--live)' }}>{ERRORS[rec.error]}</p>}
      {sendError && <p className="mb-3 text-sm leading-relaxed" style={{ color: 'var(--live)' }}>{sendError}</p>}

      {rec.state === 'recording' && (
        <>
          <Wave peaks={rec.livePeaks} live />
          <p className="mt-3 text-center text-sm tabular-nums" style={{ color: 'var(--mist-soft)' }}>
            {formatDuration(rec.elapsedMs)}
            <span style={{ color: 'var(--mist-faint)' }}> / {formatDuration(MAX_SECONDS * 1000)}</span>
          </p>
          {rec.remainingMs <= 10_000 && (
            <p className="mt-1 text-center text-xs" style={{ color: 'var(--mist-faint)' }}>
              {Math.ceil(rec.remainingMs / 1000)}s left — it stops itself
            </p>
          )}
          <div className="mt-4 flex justify-center">
            <Primary onClick={rec.stop}>Done</Primary>
          </div>
        </>
      )}

      {rec.state === 'review' && recording && (
        <>
          <Wave peaks={recording.peaks} />
          <p className="mt-3 text-center text-sm tabular-nums" style={{ color: 'var(--mist-soft)' }}>
            {formatDuration(recording.durationMs)}
            {rec.timedOut && <span style={{ color: 'var(--mist-faint)' }}> · it reached the limit</span>}
          </p>
          {rec.previewUrl && <audio controls src={rec.previewUrl} className="mt-3 w-full" />}
          <div className="mt-4 flex items-center justify-center gap-4">
            <Primary onClick={send} disabled={uploading}>
              {uploading ? `Sending ${percent}%` : 'Use this take'}
            </Primary>
            <Quiet onClick={rec.discard} disabled={uploading}>Record again</Quiet>
          </div>
        </>
      )}

      {(rec.state === 'idle' || rec.state === 'starting') && (
        <div className="text-center">
          <p className="mb-4 text-sm leading-relaxed" style={{ color: 'var(--mist-soft)' }}>
            Up to two minutes. It stops itself at the end.
          </p>
          <Primary onClick={rec.start} disabled={rec.state === 'starting'}>
            {rec.state === 'starting' ? 'Starting…' : 'Start recording'}
          </Primary>
        </div>
      )}
    </Frame>
  );
}

function Primary({ onClick, disabled, children }: {
  onClick: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex cursor-pointer items-center justify-center rounded-full px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
      style={{ background: 'var(--own)', color: 'var(--dusk-deep)' }}
    >
      {children}
    </button>
  );
}

function Quiet({ onClick, disabled, children }: {
  onClick: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer text-sm underline underline-offset-4 disabled:opacity-50"
      style={{ color: 'var(--mist-soft)' }}
    >
      {children}
    </button>
  );
}

function Frame({ children, onCancel }: { children: React.ReactNode; onCancel: () => void }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--line-strong)', background: 'var(--dusk-deep)' }}>
      {children}
      <div className="mt-4 text-center">
        <Quiet onClick={onCancel}>Never mind</Quiet>
      </div>
    </div>
  );
}

/** The waveform. Decorative — the duration is written out beside it. Live
 *  takes glow brass (--own, the color of a node authored here); a finished
 *  take settles to mist. */
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
            background: live ? 'var(--own)' : 'var(--mist-faint)',
          }}
        />
      ))}
    </div>
  );
}
