'use client';

import { usePlayer, formatDuration } from '@hs/audio';
import type { Share } from '@/lib/types';

// Playing a story back. One shared <audio> for the whole app (PlayerProvider),
// so two voices can never talk over each other — which on a memorial would be
// grotesque and in a ranking task makes comparison impossible.
//
// A TRANSCRIPT IS A BONUS AND GATES NOTHING (Q2). The rank phase can open
// minutes after the last story, and Deepgram may not have answered yet — so a
// missing transcript shows the player alone rather than a spinner, and a vendor
// outage can never stall a circle. The alternative, blocking the phase on
// transcripts, hands a third party the power to freeze a group's week.

export function StoryPlayer({ share }: { share: Share }) {
  const player = usePlayer();
  if (!share.audio) return null;

  const id = share.id;
  const isCurrent = player.currentId === id;
  const playing = isCurrent && player.playing;
  const total = share.audio.durationMs;
  const fraction = isCurrent && player.durationMs > 0 ? player.positionMs / player.durationMs : 0;

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => player.toggle(id, share.audio!.url, total)}
        aria-label={playing ? 'Pause this story' : 'Play this story'}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-ground transition-opacity hover:opacity-90"
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>

      {/* The peaks double as the scrub track — the part already played is
          filled, the rest sits back. Clickable, because a story you want to
          hear again is usually a story you want a piece of again. */}
      <button
        type="button"
        onClick={e => {
          const box = e.currentTarget.getBoundingClientRect();
          const f = (e.clientX - box.left) / box.width;
          if (isCurrent) player.seekFraction(Math.max(0, Math.min(1, f)));
          else player.toggle(id, share.audio!.url, total);
        }}
        aria-label="Scrub this story"
        className="flex h-8 flex-1 items-center gap-[2px]"
      >
        {peaksOf(share).map((p, i, all) => (
          <span
            key={i}
            className="flex-1 rounded-full"
            style={{
              height: `${Math.max(3, Math.min(1, p) * 30)}px`,
              background: i / all.length <= fraction ? 'var(--ink-soft)' : 'var(--rule-strong)',
            }}
          />
        ))}
      </button>

      <span className="shrink-0 text-xs tabular-nums text-ink-faint">
        {formatDuration(isCurrent && player.positionMs > 0 ? player.positionMs : total)}
      </span>
    </div>
  );
}

/**
 * What a story SAYS, in the order that respects the reader's time.
 *
 * Typed text first — it is what the teller chose to write. Then a ready
 * transcript, which lets somebody skim two dozen stories rather than sit
 * through twenty minutes of audio. A transcript that is pending, failed or
 * never asked for simply says nothing: the player above it is the story, and
 * the machine's failure to type it out is not the teller's problem.
 */
export function StoryText({ share, className = '' }: { share: Share; className?: string }) {
  if (share.text) {
    return <p className={`whitespace-pre-wrap ${className}`}>{share.text}</p>;
  }
  if (share.transcript?.status === 'ready' && share.transcript.text) {
    return (
      <p className={`whitespace-pre-wrap ${className}`}>
        {share.transcript.text}
        <span className="ml-1 text-xs text-ink-faint">(auto-written from the recording)</span>
      </p>
    );
  }
  return null;
}

function peaksOf(share: Share): number[] {
  const p = share.audio?.peaks ?? [];
  return p.length ? p.slice(0, 48) : new Array(32).fill(0.15);
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
      <path d="M3 1.5v11l9-5.5-9-5.5z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
      <rect x="3" y="2" width="3" height="10" rx="1" />
      <rect x="8" y="2" width="3" height="10" rx="1" />
    </svg>
  );
}
