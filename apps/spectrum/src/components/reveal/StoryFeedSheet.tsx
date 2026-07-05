'use client';

import BottomSheet from '@/components/ui/BottomSheet';
import type { ResultDot } from '@/lib/types';

// Every story written about one person, grouped by spectrum, attributed.
export default function StoryFeedSheet({
  dot,
  xLabel,
  yLabel,
  onClose,
}: {
  dot: ResultDot | null;
  xLabel: string;
  yLabel: string;
  onClose: () => void;
}) {
  if (!dot) return null;
  const groups: Array<{ axis: 'x' | 'y'; label: string; accent: string }> = [
    { axis: 'x', label: xLabel, accent: 'var(--x-accent)' },
    { axis: 'y', label: yLabel, accent: 'var(--y-accent)' },
  ];

  return (
    <BottomSheet open={!!dot} onClose={onClose}>
      <h2 className="display text-4xl">{dot.name}</h2>
      {dot.stories.length === 0 && (
        <p className="story-serif mt-4 text-lg italic text-ink-soft">
          Nobody wrote a story about {dot.name} — the dot speaks for itself.
        </p>
      )}
      {groups.map(g => {
        const stories = dot.stories.filter(s => s.axis === g.axis);
        if (!stories.length) return null;
        return (
          <section key={g.axis} className="mt-5">
            <p className="eyebrow" style={{ color: g.accent }}>on {dot.name}’s {g.label}</p>
            <ul className="mt-2 space-y-4">
              {stories.map((s, i) => (
                <li key={i} className="border-l-2 pl-4" style={{ borderColor: g.accent }}>
                  <p className="story-serif text-xl leading-snug">“{s.text}”</p>
                  <p className="eyebrow mt-1.5">— {s.raterName}</p>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <div className="h-4" />
    </BottomSheet>
  );
}
