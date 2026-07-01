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
  const slug = instance?.slug ?? 'interview';

  const gameLinks = [
    { label: 'Standings', href: gamePath(slug, 'leaderboard'), active: active === 'leaderboard' },
    { label: STR.rules, href: gamePath(slug, 'rules'), active: active === 'rules' },
  ];

  const utilLinkStyle: React.CSSProperties = {
    fontFamily: mono,
    fontSize: 'var(--text-2xs)',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    textDecoration: 'none',
  };

  return (
    <header style={{
      height: 52, flexShrink: 0, display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', gap: '1rem', padding: '0 1.25rem',
      borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-primary)',
    }}>
      <Link href={`/interview/${slug}`} style={{ textDecoration: 'none', flexShrink: 0 }} aria-label={GAME_NAME}>
        <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>
          inter<span style={{ color: 'var(--accent)' }}>View</span>
        </span>
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
        {/* Desktop-only util links */}
        <div className="hidden md:flex" style={{ alignItems: 'center', gap: '1.5rem' }}>
          <Link href={gamePath(slug, 'leaderboard')} style={utilLinkStyle}>Standings</Link>
          <Link href={gamePath(slug, 'rules')} style={utilLinkStyle}>{STR.rules}</Link>
        </div>
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
