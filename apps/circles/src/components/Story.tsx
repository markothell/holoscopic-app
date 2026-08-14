import type { Share } from '@/lib/types';

// Story rendering shared by the sorting and reveal surfaces.
//
// Audio PLAYBACK is here from day one because circles that lived on Threshold
// carry recordings, and a story that arrives silent reads as one that failed
// to save. A native <audio> element is the v1 player; the shared player (one
// element for the app, playback surviving navigation) comes over with the
// audio port. RECORDING is not here yet — that is the @hs/audio port.

/** Never `share.text` alone: a recorded story has none. */
export function storyPreview(share: Share): string {
  if (share.text) return share.text.length > 160 ? `${share.text.slice(0, 157)}…` : share.text;
  if (share.transcript?.status === 'ready' && share.transcript.text) {
    const t = share.transcript.text;
    return t.length > 160 ? `${t.slice(0, 157)}…` : t;
  }
  return share.audio ? 'A recording.' : '';
}

export function StoryText({ share, className }: { share: Share; className?: string }) {
  const text = share.text
    || (share.transcript?.status === 'ready' ? share.transcript.text : '')
    || (share.audio ? '' : '');
  if (!text && share.audio) {
    return <p className={className ?? 'text-sm text-ink-faint'}>A recording — press play.</p>;
  }
  return <p className={className}>{text}</p>;
}

export function StoryAudio({ share, className }: { share: Share; className?: string }) {
  if (!share.audio) return null;
  return <audio controls preload="none" src={share.audio.url} className={className ?? 'w-full'} />;
}
