'use client';

import { useRecorder, formatDuration, type Recording, type RecorderErrorCode } from '@hs/audio';
import { recordingStash } from '@/lib/stash';
import { useMemorial } from '@/components/MemorialProvider';

// Chorus's recorder: all of the look and all of the words, none of the browser.
//
// The MediaRecorder lifecycle, the AudioContext analyser, the timed duration
// and the stash all live in @hs/audio#useRecorder. What stays here is what is
// Chorus's alone — the radio-dial palette, and copy written for an audience
// who may be recording their grandmother's voice.
//
// Tap to start, tap to stop. NOT hold-to-record: holding a phone still for
// ninety seconds is genuinely hard, and this app's whole premise is someone
// talking for longer than they would type.

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

// The hook reports a code; the words are Chorus's. Every one of these ends by
// naming the way through, because somebody who cannot record can still type.
const ERROR_COPY: Record<RecorderErrorCode, string> = {
  denied: 'Your browser blocked the microphone. Allow it and tap Record again, or type instead.',
  failed: 'Couldn’t start recording. You can type your memory instead.',
  empty: 'That recording came out empty. Try once more, or type instead.',
};

export default function Recorder({ maxSeconds, recording, onRecording }: Props) {
  const { slug } = useMemorial();
  const rec = useRecorder({
    maxSeconds,
    recording,
    onRecording,
    stash: recordingStash,
    // One deployment serves every memorial, so the stash has to remember which
    // one this was recorded for.
    scope: slug,
  });

  if (!rec.supported) {
    return (
      <p className="rounded-[3px] bg-card px-4 py-3 text-[0.9375rem] text-ink-soft">
        This browser can’t record audio. You can still type your memory above.
      </p>
    );
  }

  const nearlyUp = rec.state === 'recording' && rec.remainingMs <= 30_000;
  const minutes = Math.round(maxSeconds / 60);
  const error = rec.error ? ERROR_COPY[rec.error] : null;

  if (rec.state === 'review' && recording) {
    return (
      <div className="rounded-[3px] bg-card px-4 py-4">
        {/* Two things, in this order: what you said is here, and here is how to
            say the rest. Somebody cut off mid-story assumes the take is ruined
            and starts over — which loses the ten minutes they just spent. */}
        {rec.timedOut && (
          <p
            role="status"
            className="mb-3 rounded-[3px] bg-card-raised px-3.5 py-3 text-[0.9375rem]
                       leading-[1.55] text-ink-soft"
          >
            Time ran out at {minutes} minutes, and everything up to there is here.
            Send this memory — once it lands, tap “Add to this memory” and carry on.
          </p>
        )}
        <div className="flex items-center gap-3">
          <Waveform peaks={recording.peaks} />
          <span className="shrink-0 text-[0.875rem] tabular-nums text-ink-soft">
            {formatDuration(recording.durationMs)}
          </span>
        </div>
        {rec.previewUrl && (
          <audio controls preload="metadata" src={rec.previewUrl} className="mt-3 w-full" />
        )}
        <button
          type="button"
          onClick={rec.discard}
          className="mt-3 text-[0.9375rem] text-dial underline decoration-dial-soft underline-offset-4"
        >
          Record it again
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-[3px] bg-card px-4 py-5 text-center">
      {rec.state === 'recording' ? (
        <>
          <div className="mb-4 flex items-center justify-center gap-3">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-dial" aria-hidden />
            <span
              className={`text-[1.25rem] tabular-nums ${nearlyUp ? 'text-dial' : 'text-ink'}`}
              role="timer"
              aria-live="off"
            >
              {formatDuration(rec.elapsedMs)}
            </span>
            {nearlyUp && (
              <span className="text-[0.8125rem] text-dial">
                {formatDuration(rec.remainingMs)} left
              </span>
            )}
          </div>
          <Waveform peaks={rec.livePeaks} live />
          <button
            type="button"
            onClick={rec.stop}
            className="mt-5 w-full rounded-[3px] bg-dial px-5 py-3.5 text-[1rem] font-medium text-card-raised"
          >
            Stop
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={rec.start}
            disabled={rec.state === 'starting'}
            className="mx-auto flex h-20 w-20 items-center justify-center rounded-full
                       bg-dial text-card-raised shadow-[var(--shadow-card)]
                       transition-transform active:scale-95
                       disabled:animate-pulse disabled:opacity-70"
            aria-label="Start recording"
          >
            <span className="h-6 w-6 rounded-full bg-card-raised" aria-hidden />
          </button>
          <p className="mt-4 text-[0.9375rem] text-ink-soft">
            {rec.state === 'starting'
              ? 'Waiting for the microphone — allow it if your browser asks.'
              // The length is named up front AND the way past it, because the
              // people who hit the limit are the ones with the most to say.
              : `Tap to record. Up to ${minutes} minutes, and you can add more after.`}
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
