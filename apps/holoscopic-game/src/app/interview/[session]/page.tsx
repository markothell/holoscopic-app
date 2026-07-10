'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useInstance } from '@/contexts/InstanceContext';
import { editionLabel } from '@/services/instanceService';
import UserMenu from '@/components/UserMenu';
import { GAME_NAME, gamePath } from '@/lib/strings';
import { mono, eyebrowCss } from '@/lib/ui';

/**
 * interView landing page — where people arrive from the Holoscopic homepage.
 * An open editorial page, no container card: wordmark, an invitation, one
 * strong way in, and the game's signature graphic — the theme web with a
 * single conversation's path lit.
 */

/* ── The theme web ───────────────────────────────────────────────────────
   The game's main view in miniature: nominated topics around the theme,
   one conversation's path — topic to map to map — lit in the accent.
   Purely decorative, drawn in the page's own palette. */

function ThemeWebGraphic() {
  const ACCENT = '#C83B50';
  const MUTED = 'rgba(15,13,11,0.28)';

  // A small topic card: two text bars inside a rounded rect.
  const node = (x: number, y: number, hot = false) => (
    <g key={`${x}-${y}`}>
      <rect
        x={x - 44} y={y - 17} width={88} height={34} rx={8}
        fill={hot ? '#FCFAF6' : 'rgba(252,250,246,0.7)'}
        stroke={hot ? ACCENT : MUTED}
        strokeWidth={hot ? 1.6 : 1}
      />
      <rect x={x - 32} y={y - 7} width={48} height={4} rx={2} fill={hot ? ACCENT : MUTED} opacity={hot ? 0.85 : 0.7} />
      <rect x={x - 32} y={y + 2} width={30} height={4} rx={2} fill={MUTED} opacity={0.6} />
    </g>
  );

  return (
    <svg
      viewBox="0 0 720 250"
      style={{ width: '100%', height: 'auto', display: 'block' }}
      aria-hidden
    >
      <defs>
        <marker id="ivArrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill={ACCENT} />
        </marker>
      </defs>

      {/* quiet edges from the theme to the rest of the web */}
      <path d="M100,125 C150,125 160,52 208,46" stroke={MUTED} strokeWidth="1" fill="none" />
      <path d="M100,125 C150,125 158,198 206,206" stroke={MUTED} strokeWidth="1" fill="none" />
      <path d="M100,125 C170,125 240,190 336,196" stroke={MUTED} strokeWidth="1" fill="none" />
      <path d="M100,125 C160,125 180,86 250,78" stroke={MUTED} strokeWidth="1" fill="none" />
      {/* the lit path: nomination → confirmed topic → map → next map */}
      <path d="M100,125 C150,125 170,152 216,155" stroke={ACCENT} strokeWidth="1.6" fill="none" markerEnd="url(#ivArrow)" />
      <path d="M310,150 C360,144 372,110 416,104" stroke={ACCENT} strokeWidth="1.6" fill="none" markerEnd="url(#ivArrow)" />
      <path d="M510,104 C560,106 574,140 616,146" stroke={ACCENT} strokeWidth="1.6" fill="none" markerEnd="url(#ivArrow)" />

      {/* the theme at the center of the web */}
      <circle cx="70" cy="125" r="31" fill="rgba(252,250,246,0.75)" stroke={ACCENT} strokeWidth="1.6" />
      <text x="70" y="129" textAnchor="middle" fill={ACCENT} fontSize="9" fontFamily="var(--font-dm-mono), monospace" letterSpacing="1.6">THEME</text>

      {/* the quiet web */}
      {node(255, 46)}
      {node(298, 78)}
      {node(253, 206)}
      {node(384, 196)}
      {/* dot satellites — depth without noise */}
      <circle cx="322" cy="34" r="3.5" fill={MUTED} />
      <circle cx="342" cy="56" r="3.5" fill={MUTED} />
      <circle cx="446" cy="206" r="3.5" fill={MUTED} />

      {/* the lit conversation: topic → map → map */}
      {node(262, 155, true)}
      {node(462, 104, true)}
      {node(662, 146, true)}
      <text x="262" y="130" textAnchor="middle" fill={ACCENT} fontSize="8.5" fontFamily="var(--font-dm-mono), monospace" letterSpacing="1.4">TOPIC</text>
      <text x="462" y="80" textAnchor="middle" fill={ACCENT} fontSize="8.5" fontFamily="var(--font-dm-mono), monospace" letterSpacing="1.4">MAP 1</text>
      <text x="662" y="122" textAnchor="middle" fill={ACCENT} fontSize="8.5" fontFamily="var(--font-dm-mono), monospace" letterSpacing="1.4">MAP 2</text>
    </svg>
  );
}

function QuietLink({ href, children }: { href: string; children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      href={href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
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
  const [enterHover, setEnterHover] = useState(false);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}>
      {/* Holoscopic header — unchanged */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem' }}>
        <Link href="/" style={{ ...eyebrowCss, textDecoration: 'none' }}>← Holoscopic</Link>
        <UserMenu />
      </header>

      <main
        style={{
          flex: 1, width: '100%', maxWidth: 1000, margin: '0 auto',
          padding: 'clamp(2rem, 6vw, 4.5rem) clamp(1.25rem, 4vw, 2.5rem) 3rem',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Who this is */}
        <p style={{ ...eyebrowCss, margin: 0 }}>
          A holoscopic game · Edition {editionLabel(instance)}
          {instance?.name && instance.name.toLowerCase() !== 'interview' ? ` · ${instance.name}` : ''}
        </p>

        <h1
          aria-label={GAME_NAME}
          style={{
            margin: '1rem 0 0', display: 'flex', alignItems: 'baseline', flexWrap: 'wrap',
            fontFamily: 'var(--font-barlow), system-ui, sans-serif', fontWeight: 800,
            textTransform: 'uppercase', letterSpacing: '-0.01em',
            fontSize: 'clamp(3.4rem, 11vw, 7rem)', lineHeight: 0.92,
          }}
        >
          <span style={{ color: 'transparent', WebkitTextStroke: '3px var(--text-primary)', paintOrder: 'stroke fill' }}>
            Inter
          </span>
          <span style={{ color: 'var(--accent)' }}>View</span>
        </h1>

        <p
          style={{
            margin: '0.6rem 0 0', fontFamily: mono,
            color: 'var(--accent)', fontWeight: 500,
            fontSize: 'clamp(0.68rem, 2vw, 1.05rem)', letterSpacing: '0.02em',
          }}
        >
          collaborative.conversation.design.game
        </p>

        {/* The invitation */}
        <p
          style={{
            margin: 'clamp(1.75rem, 4vw, 2.5rem) 0 0',
            fontSize: 'clamp(1rem, 2.2vw, 1.2rem)', lineHeight: 1.7,
            color: 'var(--text-secondary)', maxWidth: '56ch',
          }}
        >
          interView is a slow game of collective sensemaking. Players nominate
          the topics that matter to them, stake tokens on the conversations
          they want to see, and meet on shared maps — each perspective a point,
          each point a comment, each comment votable. The best questions get
          replayed, refined, and passed on.
        </p>

        {/* One strong way in, one quiet one */}
        <div style={{ marginTop: 'clamp(1.75rem, 4vw, 2.5rem)', display: 'flex', alignItems: 'center', gap: '1.75rem', flexWrap: 'wrap' }}>
          <Link
            href={gamePath(slug, 'topics')}
            onMouseEnter={() => setEnterHover(true)}
            onMouseLeave={() => setEnterHover(false)}
            style={{
              fontFamily: 'var(--font-barlow), system-ui, sans-serif', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: '1.05rem',
              textDecoration: 'none', color: '#fff',
              background: enterHover ? 'var(--accent-hover)' : 'var(--accent)',
              borderRadius: 999, padding: '0.9rem 2.4rem',
              transition: 'background 0.15s ease',
            }}
          >
            Enter the game
          </Link>
          <QuietLink href={gamePath(slug, 'rules')}>How to play →</QuietLink>
        </div>

        {/* The signature: the theme web, one conversation lit */}
        <div style={{ marginTop: 'clamp(2.5rem, 6vw, 4rem)' }}>
          <ThemeWebGraphic />
        </div>

        {/* Quiet footer links */}
        <nav
          aria-label={`${GAME_NAME} links`}
          style={{
            marginTop: 'auto', paddingTop: 'clamp(2rem, 5vw, 3rem)',
            borderTop: '1px solid rgba(15,13,11,0.12)',
            display: 'flex', alignItems: 'center', gap: 'clamp(1.1rem, 4vw, 2.5rem)',
            flexWrap: 'wrap',
          }}
        >
          <QuietLink href={gamePath(slug, 'rules')}>The Rules</QuietLink>
          <QuietLink href={`${gamePath(slug, 'rules')}#economy`}>Economic Model</QuietLink>
          <QuietLink href="/start">Start your own</QuietLink>
        </nav>
      </main>
    </div>
  );
}
