'use client';

import { usePlayer, formatDuration } from '@hs/audio';
import type { MemoryAudio } from '@/lib/types';

// Playback in two sizes, both driven by the one shared audio element.
//
//   "pill"  — on a wall card. Tapping it plays inline and must NOT navigate,
//             even though the whole card is a link.
//   "full"  — on a memory's own page: a scrubbable waveform.
//
// The waveform is drawn from peaks captured while recording, so it appears
// instantly with no decoding and no second fetch of the audio.

function Bars({
  peaks, progress, size,
}: { peaks: number[]; progress: number; size: 'pill' | 'full' }) {
  const bars = peaks.length ? peaks : Array.from({ length: 32 }, () => 0.35);
  return (
    <div
      className={`flex flex-1 items-center gap-[2px] ${size === 'pill' ? 'h-4' : 'h-12'}`}
      aria-hidden
    >
      {bars.map((p, i) => {
        const played = i / bars.length < progress;
        return (
          <span
            key={i}
            className={`w-full rounded-full transition-colors ${played ? 'bg-dial' : 'bg-dial-soft'}`}
            style={{ height: `${Math.max(12, p * 100)}%` }}
          />
        );
      })}
    </div>
  );
}

function PlayGlyph({ playing }: { playing: boolean }) {
  return playing ? (
    <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden>
      <rect x="0" y="0" width="3.5" height="12" fill="currentColor" />
      <rect x="6.5" y="0" width="3.5" height="12" fill="currentColor" />
    </svg>
  ) : (
    <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden>
      <path d="M0 0 L10 6 L0 12 Z" fill="currentColor" />
    </svg>
  );
}

interface Props {
  memoryId: string;
  audio: MemoryAudio;
  size?: 'pill' | 'full';
}

export default function AudioPill({ memoryId, audio, size = 'pill' }: Props) {
  const player = usePlayer();
  const isCurrent = player.currentId === memoryId;
  const playing = isCurrent && player.playing;

  // Fall back to the stored duration whenever the element hasn't reported a
  // usable one — iOS MP4 routinely has no duration metadata.
  const total = (isCurrent && player.durationMs) || audio.durationMs;
  const progress = isCurrent && total ? player.positionMs / total : 0;
  const shown = isCurrent && player.positionMs ? player.positionMs : audio.durationMs;

  function play(e: React.MouseEvent) {
    // The card around this is a link. Tapping play must never navigate.
    e.preventDefault();
    e.stopPropagation();
    player.toggle(memoryId, audio.url, audio.durationMs);
  }

  if (size === 'pill') {
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={play}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            player.toggle(memoryId, audio.url, audio.durationMs);
          }
        }}
        aria-label={`${playing ? 'Pause' : 'Play'} this memory, ${formatDuration(audio.durationMs)}`}
        // `relative z-10` keeps the pill above the memory card's stretched
        // link overlay. Without it, tapping play navigates to the memory page
        // instead of playing — the card's overlay would swallow the tap.
        className="relative z-10 inline-flex cursor-pointer items-center gap-2 rounded-full
                   bg-dial-soft px-2.5 py-1 text-[0.75rem] font-medium text-dial"
      >
        <PlayGlyph playing={playing} />
        <span className="tabular-nums">{formatDuration(shown)}</span>
      </span>
    );
  }

  return (
    <div className="rounded-[3px] bg-card px-4 py-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={play}
          aria-label={playing ? 'Pause' : 'Play this memory'}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full
                     bg-dial text-card-raised"
        >
          <PlayGlyph playing={playing} />
        </button>

        <div
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          onClick={e => {
            const box = e.currentTarget.getBoundingClientRect();
            player.toggle(memoryId, audio.url, audio.durationMs);
            player.seekFraction((e.clientX - box.left) / box.width);
          }}
          onKeyDown={e => {
            if (e.key === 'ArrowRight') player.seekFraction(progress + 0.05);
            if (e.key === 'ArrowLeft') player.seekFraction(progress - 0.05);
          }}
          className="flex-1 cursor-pointer"
        >
          <Bars peaks={audio.peaks} progress={progress} size="full" />
        </div>

        <span className="shrink-0 text-[0.875rem] tabular-nums text-ink-soft">
          {formatDuration(shown)}
        </span>
      </div>
    </div>
  );
}
