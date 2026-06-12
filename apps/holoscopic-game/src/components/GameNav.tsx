'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useInstance } from '@/contexts/InstanceContext';
import UserMenu from '@/components/UserMenu';
import { GAME_NAME, HOLON_SYMBOL, STR, gamePath } from '@/lib/strings';
import { mono } from '@/lib/ui';

export type GameView = 'topics' | 'frames' | 'patterns' | 'rules';

/**
 * The one game header. Wordmark → landing; view links; How to play;
 * holon balance; user menu. Used on every interView surface.
 */
export default function GameNav({ active }: { active?: GameView }) {
  const { isAuthenticated, holonBalance } = useAuth();
  const { instance } = useInstance();
  const g = instance?.gameNumber ?? 1;

  const views: { key: GameView; label: string; href: string }[] = [
    { key: 'topics', label: STR.topics, href: gamePath(g, 'topics') },
    { key: 'frames', label: STR.frames, href: gamePath(g, 'frames') },
    { key: 'patterns', label: STR.patterns, href: gamePath(g, 'patterns') },
  ];

  const navLink = (isActive: boolean): React.CSSProperties => ({
    fontSize: 'var(--text-2xs)', fontFamily: mono, letterSpacing: '0.1em',
    textTransform: 'uppercase', textDecoration: 'none',
    color: isActive ? 'var(--accent)' : 'var(--text-muted)',
    fontWeight: isActive ? 600 : 400,
  });

  return (
    <header style={{
      height: 52, flexShrink: 0, display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', gap: '1rem', padding: '0 1.25rem',
      borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-primary)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', minWidth: 0 }}>
        <Link href="/interview" style={{ textDecoration: 'none', flexShrink: 0 }}>
          <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>
            inter<span style={{ color: 'var(--accent)' }}>View</span>
          </span>
        </Link>
        <nav style={{ display: 'flex', gap: '1.1rem', alignItems: 'center' }} aria-label={`${GAME_NAME} sections`}>
          {views.map(v => (
            <Link key={v.key} href={v.href} style={navLink(active === v.key)}>{v.label}</Link>
          ))}
        </nav>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.1rem', flexShrink: 0 }}>
        <Link href={gamePath(g, 'rules')} style={navLink(active === 'rules')}>{STR.rules}</Link>
        {isAuthenticated && (
          <span style={{ fontSize: 'var(--text-sm)', fontFamily: mono, color: 'var(--accent)', fontWeight: 600 }}
            title={`${STR.holon} balance`}>
            {HOLON_SYMBOL} {holonBalance ?? 0}
          </span>
        )}
        <UserMenu />
      </div>
    </header>
  );
}
