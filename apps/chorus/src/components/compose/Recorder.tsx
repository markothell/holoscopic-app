'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  canRecord, pickMimeType, resamplePeaks, stashRecording, clearStashedRecording,
  formatDuration, type Recording,
} from '@/lib/recorder';
import { useMemorial } from '@/components/MemorialProvider';

// Tap to start, tap to stop. NOT hold-to-record: holding a phone still for
// ninety seconds is genuinely hard, and this app's whole premise is someone
// talking for longer than they would type.

// 'starting' covers the gap between the tap and the microphone actually
// opening. getUserMedia does not resolve while a permission prompt is on
// screen — which is the FIRST time every contributor uses this — so without
// this state the button sits there looking dead and takes a second tap that
// would open a second recorder.
type State = 'idle' | 'starting' | 'recording' | 'review';

interface Props {
  maxSeconds: number;
  recording: Recording | null;
  /**
   * `stashed` says whether the recording reached IndexedDB. It travels with
   * the recording because the compose sheet's failure copy promises the
   * recording is saved on this phone, and that promise has to be checkable.
   */
  onRecording: (rec: Recording | null, stashed?: boolean) => void;
}

export default function Recorder({ maxSeconds, recording, onRecording }: Props) {
  const { slug } = useMemorial();
  const [state, setState] = useState<State>(recording ? 'review' : 'idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [liveePeaks, setLivePeaks] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const samplesRef = useRef<number[]>([]);
  const startedAtRef = useRef(0);
  const rafRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  // canRecord() touches navigator, so it can only run after mount — deciding
  // during render would make the server and client disagree.
  useEffect(() => { setSupported(canRecord()); }, []);

  // A recording restored from the stash arrives after this component has
  // already mounted idle, so the initial state above misses it. Without this
  // the recovered recording would be attached and invisible — the person
  // would have no way to hear what they were about to send.
  useEffect(() => {
    if (recording) setState(s => (s === 'idle' ? 'review' : s));
  }, [recording]);

  const teardown = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => () => {
    teardown();
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, [teardown]);

  async function start() {
    if (state === 'starting' || state === 'recording') return;
    setError(null);
    setState('starting');
    chunksRef.current = [];
    samplesRef.current = [];
    setLivePeaks([]);
    setElapsedMs(0);

    try {
      // getUserMedia must be reached directly from the tap on iOS — an await
      // before this line loses the user-gesture context and the prompt never
      // appears.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;

      recorder.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
      recorder.onstop = handleStop;
      recorder.start();

      // Duration is TIMED, never read back off the file: iOS writes MP4 with
      // no duration metadata, which surfaces as an Infinity in every player
      // and an un-scrubbable track.
      startedAtRef.current = Date.now();
      timerRef.current = setInterval(() => {
        const ms = Date.now() - startedAtRef.current;
        setElapsedMs(ms);
        if (ms >= maxSeconds * 1000) stop();
      }, 200);

      // Amplitude for the waveform, sampled off the live stream.
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buffer = new Uint8Array(analyser.frequencyBinCount);

      const sample = () => {
        analyser.getByteTimeDomainData(buffer);
        let peak = 0;
        for (let i = 0; i < buffer.length; i++) {
          const v = Math.abs(buffer[i] - 128) / 128;
          if (v > peak) peak = v;
        }
        samplesRef.current.push(peak);
        setLivePeaks(resamplePeaks(samplesRef.current, 40));
        rafRef.current = requestAnimationFrame(sample);
      };
      rafRef.current = requestAnimationFrame(sample);

      setState('recording');
    } catch (err) {
      teardown();
      setState('idle');
      const name = err instanceof Error ? err.name : '';
      setError(
        name === 'NotAllowedError'
          ? 'Your browser blocked the microphone. Allow it and tap Record again, or type instead.'
          : 'Couldn’t start recording. You can type your memory instead.',
      );
    }
  }

  function handleStop() {
    const durationMs = Date.now() - startedAtRef.current;
    const mimeType = recorderRef.current?.mimeType || pickMimeType() || 'audio/webm';
    const blob = new Blob(chunksRef.current, { type: mimeType });
    const peaks = resamplePeaks(samplesRef.current, 48);
    teardown();

    if (!blob.size) {
      setState('idle');
      setError('That recording came out empty. Try once more, or type instead.');
      return;
    }

    const rec: Recording = { blob, mimeType, durationMs, peaks };
    // Stashed BEFORE anything else can go wrong. From here a crash, a
    // refresh, or a failed upload can all be recovered from.
    onRecording(rec);
    setState('review');
    // Reported back rather than assumed: private browsing, a full disk or a
    // browser with IndexedDB switched off all leave the recording in memory
    // only, and the compose sheet says something different in that case.
    void stashRecording(rec, slug).then(ok => onRecording(rec, ok));
  }

  function stop() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }

  function discard() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    // Clear the stash too. "Record it again" is somebody deciding this take is
    // wrong; leaving it on disk would hand it back to them the next time the
    // sheet restores an unsent recording.
    void clearStashedRecording();
    onRecording(null);
    setElapsedMs(0);
    setState('idle');
  }

  if (!supported) {
    return (
      <p className="rounded-[3px] bg-card px-4 py-3 text-[0.9375rem] text-ink-soft">
        This browser can’t record audio. You can still type your memory above.
      </p>
    );
  }

  const remaining = maxSeconds * 1000 - elapsedMs;
  const nearlyUp = state === 'recording' && remaining <= 30_000;

  if (state === 'review' && recording) {
    if (!previewUrlRef.current) previewUrlRef.current = URL.createObjectURL(recording.blob);
    return (
      <div className="rounded-[3px] bg-card px-4 py-4">
        <div className="flex items-center gap-3">
          <Waveform peaks={recording.peaks} />
          <span className="shrink-0 text-[0.875rem] tabular-nums text-ink-soft">
            {formatDuration(recording.durationMs)}
          </span>
        </div>
        <audio controls preload="metadata" src={previewUrlRef.current} className="mt-3 w-full" />
        <button
          type="button"
          onClick={discard}
          className="mt-3 text-[0.9375rem] text-dial underline decoration-dial-soft underline-offset-4"
        >
          Record it again
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-[3px] bg-card px-4 py-5 text-center">
      {state === 'recording' ? (
        <>
          <div className="mb-4 flex items-center justify-center gap-3">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-dial" aria-hidden />
            <span
              className={`text-[1.25rem] tabular-nums ${nearlyUp ? 'text-dial' : 'text-ink'}`}
              role="timer"
              aria-live="off"
            >
              {formatDuration(elapsedMs)}
            </span>
            {nearlyUp && (
              <span className="text-[0.8125rem] text-dial">
                {formatDuration(remaining)} left
              </span>
            )}
          </div>
          <Waveform peaks={liveePeaks} live />
          <button
            type="button"
            onClick={stop}
            className="mt-5 w-full rounded-[3px] bg-dial px-5 py-3.5 text-[1rem] font-medium text-card-raised"
          >
            Stop
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={start}
            disabled={state === 'starting'}
            className="mx-auto flex h-20 w-20 items-center justify-center rounded-full
                       bg-dial text-card-raised shadow-[var(--shadow-card)]
                       transition-transform active:scale-95
                       disabled:animate-pulse disabled:opacity-70"
            aria-label="Start recording"
          >
            <span className="h-6 w-6 rounded-full bg-card-raised" aria-hidden />
          </button>
          <p className="mt-4 text-[0.9375rem] text-ink-soft">
            {state === 'starting'
              ? 'Waiting for the microphone — allow it if your browser asks.'
              : `Tap to record. Up to ${Math.round(maxSeconds / 60)} minutes.`}
          </p>
        </>
      )}
      {error && <p role="alert" className="mt-3 text-[0.875rem] text-dial">{error}</p>}
    </div>
  );
}

function Waveform({ peaks, live = false }: { peaks: number[]; live?: boolean }) {
  const bars = peaks.length ? peaks : Array.from({ length: 40 }, () => 0.06);
  return (
    <div className="flex h-10 flex-1 items-center gap-[2px]" aria-hidden>
      {bars.map((p, i) => (
        <span
          key={i}
          className={`w-full rounded-full ${live ? 'bg-dial' : 'bg-dial-lit'}`}
          style={{ height: `${Math.max(6, p * 100)}%` }}
        />
      ))}
    </div>
  );
}
