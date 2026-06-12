'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useInstance } from '@/contexts/InstanceContext';
import UserMenu from '@/components/UserMenu';
import { GAME_NAME, STR, gamePath } from '@/lib/strings';
import { mono, eyebrowCss } from '@/lib/ui';

/**
 * interView landing page — where people arrive from the Holoscopic homepage.
 * Title, headline, big stacked links into the game.
 */

function BigLink({ href, label, sub }: { href: string; label: string; sub: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link href={href}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        display: 'block', textDecoration: 'none',
        padding: '1.5rem 0.25rem', borderBottom: '1px solid var(--warm-rule)',
        transition: 'padding-left 0.15s ease',
        paddingLeft: hovered ? '0.85rem' : '0.25rem',
      }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.85rem' }}>
        <span style={{
          fontSize: 'clamp(1.6rem, 4.5vw, 2.4rem)', fontWeight: 700, lineHeight: 1.1,
          fontFamily: 'var(--font-cormorant), Georgia, serif',
          color: hovered ? 'var(--accent)' : 'var(--text-primary)',
          transition: 'color 0.15s ease',
        }}>{label}</span>
        <span style={{ fontSize: '1.1rem', color: 'var(--accent)', opacity: hovered ? 1 : 0, transition: 'opacity 0.15s ease' }}>→</span>
      </div>
      <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)', margin: '0.4rem 0 0', lineHeight: 1.55, maxWidth: 460 }}>
        {sub}
      </p>
    </Link>
  );
}

export default function InterViewLandingPage() {
  const { instance } = useInstance();
  const g = instance?.gameNumber ?? 1;

  const bigLinks = [
    { href: gamePath(g, 'topics'), label: STR.topics, sub: 'What the group is exploring — support what matters, or nominate your own' },
    { href: gamePath(g, 'frames'), label: STR.frames, sub: 'The axes we map with — reusable pairs of ideas in tension' },
    { href: gamePath(g, 'patterns'), label: STR.patterns, sub: `Repeatable conversation structures, built from ${STR.maps.toLowerCase()} that worked` },
    { href: gamePath(g, 'rules'), label: STR.rules, sub: `The ${STR.map.toLowerCase()}, the stake, and the ${STR.holon} economy — two minutes to learn` },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem' }}>
        <Link href="/" style={{ ...eyebrowCss, textDecoration: 'none' }}>← Holoscopic</Link>
        <UserMenu />
      </header>

      <main style={{ maxWidth: 640, margin: '0 auto', padding: '3.5rem 1.5rem 5rem' }}>
        <p style={{ ...eyebrowCss, marginBottom: '1.25rem' }}>
          A Holoscopic game · Edition #{g}
        </p>

        <h1 style={{
          fontSize: 'clamp(3rem, 10vw, 4.5rem)', fontWeight: 700, lineHeight: 1,
          margin: '0 0 1.25rem', letterSpacing: '-0.02em', color: 'var(--text-primary)',
        }}>
          inter<span style={{ color: 'var(--accent)' }}>View</span>
        </h1>

        <p style={{
          fontSize: 'clamp(1.05rem, 2.5vw, 1.3rem)', color: 'var(--text-secondary)',
          lineHeight: 1.55, margin: '0 0 3rem', maxWidth: 520,
          fontFamily: 'var(--font-cormorant), Georgia, serif',
        }}>
          A live mapping game. Place your perspective on shared {STR.maps.toLowerCase()}, stake{' '}
          <span style={{ color: 'var(--accent)' }}>{STR.holons}</span>{' '}
          on the conversations that matter, and watch the group&apos;s thinking take shape.
        </p>

        <nav aria-label={`${GAME_NAME} sections`} style={{ borderTop: '1px solid var(--warm-rule)' }}>
          {bigLinks.map(l => <BigLink key={l.href} {...l} />)}
        </nav>

        <p style={{ fontSize: 'var(--text-xs)', fontFamily: mono, color: 'var(--text-muted)', marginTop: '2.5rem', lineHeight: 1.6 }}>
          {GAME_NAME} is a distinct game space built on Holoscopic&apos;s mapping tools —
          a short-run game with an economy of contribution. Edition #{g} is live now.
        </p>
      </main>
    </div>
  );
}
