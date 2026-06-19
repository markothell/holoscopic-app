'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useInstance } from '@/contexts/InstanceContext';
import UserMenu from '@/components/UserMenu';
import { GAME_NAME, HOLON_SYMBOL, STR, gamePath } from '@/lib/strings';
import { mono } from '@/lib/ui';

export type GameView = 'topics' | 'frames' | 'patterns' | 'rules' | 'leaderboard';

/**
 * The one game header. Wordmark → landing; view links; How to play;
 * holon balance; user menu. Used on every interView surface.
 */
export default function GameNav({ active }: { active?: GameView }) {
  const { isAuthenticated, holonBalance } = useAuth();
  const { instance } = useInstance();
  const g = instance?.gameNumber ?? 1;

  // All game sections live in the user-menu dropdown now, so the bar stays
  // uncluttered on mobile. Standings + How to play ride along after the views.
  const gameLinks = [
    { label: STR.topics, href: gamePath(g, 'topics'), active: active === 'topics' },
    { label: STR.frames, href: gamePath(g, 'frames'), active: active === 'frames' },
    { label: STR.patterns, href: gamePath(g, 'patterns'), active: active === 'patterns' },
    { label: 'Standings', href: gamePath(g, 'leaderboard'), active: active === 'leaderboard' },
    { label: STR.rules, href: gamePath(g, 'rules'), active: active === 'rules' },
  ];

  return (
    <header style={{
      height: 52, flexShrink: 0, display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', gap: '1rem', padding: '0 1.25rem',
      borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-primary)',
    }}>
      <Link href="/interview" style={{ textDecoration: 'none', flexShrink: 0 }} aria-label={GAME_NAME}>
        <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>
          inter<span style={{ color: 'var(--accent)' }}>View</span>
        </span>
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
        {isAuthenticated && (
          <span style={{ fontSize: 'var(--text-sm)', fontFamily: mono, color: 'var(--accent)', fontWeight: 600 }}
            title={`${STR.holon} balance`}>
            {HOLON_SYMBOL} {holonBalance ?? 0}
          </span>
        )}
        <UserMenu gameLinks={gameLinks} />
      </div>
    </header>
  );
}
