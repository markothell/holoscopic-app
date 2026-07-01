'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useInstance } from '@/contexts/InstanceContext';
import UserMenu from '@/components/UserMenu';
import { GAME_NAME, gamePath } from '@/lib/strings';
import { mono, eyebrowCss } from '@/lib/ui';

/**
 * interView landing page — where people arrive from the Holoscopic homepage.
 * A single striking card: the outlined wordmark, one way in (ENTER → Topics),
 * and three quiet nav links below it.
 */

const CARD_BG = '#D8D3C5'; // warm taupe, a shade under the cream page

// The subtitle sets the width; the wordmark is sized as a fixed multiple of it
// so "INTERVIEW" always spans the same width as the tagline at every breakpoint.
const SUB_SIZE = 'clamp(0.62rem, 3.55vw, 1.45rem)';
const WORDMARK_SIZE = `calc(${SUB_SIZE} * 6.3)`;

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      href={href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        // Matches the dashboard nav label: DM Mono, light, wide tracking.
        fontFamily: mono, fontWeight: 300, fontSize: 'var(--text-sm)',
        letterSpacing: '0.16em', textTransform: 'uppercase',
        textDecoration: 'none', whiteSpace: 'nowrap',
        color: hovered ? 'var(--accent)' : 'var(--text-muted)',
        transition: 'color 0.15s ease',
      }}
    >
      {children}
    </Link>
  );
}

export default function InterViewLandingPage() {
  const { session: slug } = useParams<{ session: string }>();
  const { instance } = useInstance();
  const g = instance?.gameNumber ?? 1;
  const [enterHover, setEnterHover] = useState(false);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}>
      {/* Holoscopic header — unchanged */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem' }}>
        <Link href="/" style={{ ...eyebrowCss, textDecoration: 'none' }}>← Holoscopic</Link>
        <UserMenu />
      </header>

      {/* Body — the striking card */}
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem clamp(0.75rem, 4vw, 4rem) 3rem' }}>
        <section
          style={{
            position: 'relative', width: '100%', maxWidth: 1100,
            background: CARD_BG, borderRadius: 4,
            padding: 'clamp(2rem, 5vw, 3rem) clamp(1.25rem, 4vw, 3rem) clamp(3.5rem, 6vw, 4rem)',
          }}
        >
          {/* Hero — wordmark, way in, links */}
          <div
            style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <h1
              aria-label="interView"
              style={{
                margin: 0, display: 'flex', justifyContent: 'center', alignItems: 'baseline',
                fontFamily: 'var(--font-barlow), system-ui, sans-serif', fontWeight: 800,
                textTransform: 'uppercase', letterSpacing: '-0.01em',
                fontSize: WORDMARK_SIZE, lineHeight: 0.95,
              }}
            >
              <span
                style={{
                  color: 'transparent',
                  WebkitTextStroke: '3px var(--text-primary)',
                  paintOrder: 'stroke fill',
                }}
              >
                Inter
              </span>
              <span style={{ color: 'var(--accent)' }}>View</span>
            </h1>

            <p
              style={{
                margin: '0.1rem 0 0', fontFamily: mono,
                color: 'var(--accent)', fontWeight: 500,
                fontSize: SUB_SIZE, letterSpacing: '0.005em',
                whiteSpace: 'nowrap',
              }}
            >
              collaborative.conversation.design.game
            </p>

            {/* ENTER */}
            <Link
              href={gamePath(slug, 'topics')}
              onMouseEnter={() => setEnterHover(true)}
              onMouseLeave={() => setEnterHover(false)}
              style={{
                marginTop: 'clamp(2.5rem, 7vw, 4rem)',
                fontFamily: 'var(--font-barlow), system-ui, sans-serif', fontWeight: 400,
                textTransform: 'uppercase', letterSpacing: '0.18em',
                fontSize: 'clamp(1.5rem, 5vw, 2rem)', textDecoration: 'none',
                color: enterHover ? 'var(--accent)' : 'var(--text-primary)',
                borderBottom: `2px solid ${enterHover ? 'var(--accent)' : 'var(--text-primary)'}`,
                paddingBottom: '0.15em', transition: 'color 0.15s ease, border-color 0.15s ease',
              }}
            >
              Enter
            </Link>

            {/* Quiet nav, below the way in */}
            <nav
              aria-label={`${GAME_NAME} links`}
              style={{
                marginTop: 'clamp(2.5rem, 7vw, 3.5rem)', width: '100%',
                borderTop: '1px solid rgba(15,13,11,0.12)', paddingTop: 'clamp(1.25rem, 4vw, 1.75rem)',
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                gap: 'clamp(1.1rem, 5vw, 3rem)', flexWrap: 'wrap', textAlign: 'center',
              }}
            >
              <NavLink href={gamePath(slug, 'rules')}>The Rules</NavLink>
              <NavLink href={`${gamePath(slug, 'rules')}#economy`}>Economic Model</NavLink>
              <NavLink href="/start">Start your own</NavLink>
            </nav>
          </div>

          {/* Edition tag, bottom-right */}
          <span
            style={{
              position: 'absolute', right: 'clamp(1.25rem, 4vw, 2.5rem)', bottom: 'clamp(1rem, 3vw, 1.5rem)',
              fontFamily: mono, fontWeight: 300, fontSize: 'var(--text-2xs)',
              letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)',
            }}
          >
            Edition #{g}
          </span>
        </section>
      </main>
    </div>
  );
}
