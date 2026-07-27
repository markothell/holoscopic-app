'use client';

export type OverlayKey = 'feed' | 'ask' | null;

// Task item 1: Post is not a standalone dock destination — a post view is
// never visited cold, only opened from a specific thought (a map node or a
// feed item; see PostOverlay). The dock over map-home is Map + Feed + Ask.
const TABS: { key: Exclude<OverlayKey, null> | 'map'; label: string; glyph: string }[] = [
  { key: 'map', label: 'Map', glyph: '◇' },
  { key: 'feed', label: 'Feed', glyph: '≡' },
  { key: 'ask', label: 'Ask', glyph: '◈' },
];

// D7: Map is home; Feed / Ask open as overlays over it, then dismiss back
// to the map. This dock is the one navigation surface for those three.
export default function OverlayDock({ active, onSelect }: { active: OverlayKey; onSelect: (key: OverlayKey) => void }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-md items-stretch border-t px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5"
      style={{ background: 'var(--dusk-raised)', borderColor: 'var(--line)' }}
    >
      {TABS.map(tab => {
        const isActive = tab.key === 'map' ? active === null : active === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onSelect(tab.key === 'map' ? null : tab.key)}
            className="flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 transition-colors"
            style={{ color: isActive ? 'var(--own)' : 'var(--mist-faint)' }}
          >
            <span className="text-lg leading-none">{tab.glyph}</span>
            <span className="eyebrow !text-[0.6rem]">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
