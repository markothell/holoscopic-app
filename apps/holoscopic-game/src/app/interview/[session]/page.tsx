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
 * A single striking card: the outlined wordmark, one way in (ENTER → Topics),
 * and three quiet nav links below it.
 */

const CARD_BG = '#D8D3C5'; // warm taupe, a shade under the cream page

// The subtitle sets the width; the wordmark is sized as a fixed multiple of it
// so "INTERVIEW" always spans the same width as the tagline at every breakpoint.
const SUB_SIZE = 'clamp(0.62rem, 3.55vw, 1.45rem)';
const WORDMARK_SIZE = `calc(${SUB_SIZE} * 6.3)`;

/* ── Sample map preview ──────────────────────────────────────────────────
   A generated dataset rendered as a miniature game map, so first-time
   visitors see what play produces before they enter. Static and
   self-contained — no backend involved. */

const SAMPLE_MAP = {
  question: 'What makes hard conversations possible?',
  xAxis: { label: 'Presence', min: 'Rare', max: 'Common' },
  yAxis: { label: 'Cost', min: 'Light', max: 'Heavy' },
  entries: [
    { x: 0.55, y: 0.62, objectName: 'Naming the stakes', comment: 'Saying why the conversation matters before diving in.', color: '#C83B50' },
    { x: 0.72, y: 0.25, objectName: 'A shared meal', comment: 'Food first. Everything lands softer.', color: '#0E8F66' },
    { x: 0.38, y: 0.70, objectName: 'Someone goes first', comment: 'One person risking honesty gives everyone else permission.', color: '#3D6FA3' },
    { x: 0.60, y: 0.35, objectName: 'Time limits', comment: 'Knowing it ends makes it enterable.', color: '#9A7B2F' },
    { x: 0.25, y: 0.80, objectName: 'A neutral third', comment: 'Rare but transformative — someone with no stake holding the frame.', color: '#C83B50' },
    { x: 0.68, y: 0.20, objectName: 'Laughing early', comment: 'One good laugh in the first five minutes changes the whole thing.', color: '#3D6FA3' },
    { x: 0.30, y: 0.45, objectName: 'Writing before talking', comment: 'Two minutes of silence with paper beats an hour of reaction.', color: '#0E8F66' },
    { x: 0.42, y: 0.55, objectName: 'Follow-up ritual', comment: 'Checking back a week later is where the change actually sticks.', color: '#9A7B2F' },
  ],
};

function SampleMapPreview() {
  const axisLabel: React.CSSProperties = {
    position: 'absolute', fontFamily: mono, fontSize: '0.55rem',
    letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)',
  };
  return (
    <div>
      <div
        style={{
          position: 'relative', width: '100%', aspectRatio: '1.15',
          background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
          borderRadius: 10,
        }}
      >
        <div style={{ position: 'absolute', left: '50%', top: 10, bottom: 10, width: 1, background: 'var(--border-default)' }} />
        <div style={{ position: 'absolute', top: '50%', left: 10, right: 10, height: 1, background: 'var(--border-default)' }} />
        <span style={{ ...axisLabel, right: 8, top: '52%' }}>{SAMPLE_MAP.xAxis.max}</span>
        <span style={{ ...axisLabel, left: 8, top: '52%' }}>{SAMPLE_MAP.xAxis.min}</span>
        <span style={{ ...axisLabel, left: '50%', top: 6, transform: 'translateX(-50%)' }}>{SAMPLE_MAP.yAxis.max}</span>
        <span style={{ ...axisLabel, left: '50%', bottom: 6, transform: 'translateX(-50%)' }}>{SAMPLE_MAP.yAxis.min}</span>
        {SAMPLE_MAP.entries.map((e, i) => (
          <span
            key={i}
            title={`${e.objectName} — ${e.comment}`}
            style={{
              position: 'absolute',
              left: `${6 + e.x * 88}%`, top: `${6 + (1 - e.y) * 88}%`,
              width: 11, height: 11, borderRadius: '50%',
              background: e.color, opacity: 0.8,
              transform: 'translate(-50%, -50%)',
              border: '2px solid var(--bg-secondary)',
            }}
          />
        ))}
      </div>
      {SAMPLE_MAP.entries.slice(0, 2).map((e, i) => (
        <div
          key={i}
          style={{
            marginTop: '0.5rem', padding: '0.5rem 0.7rem',
            background: 'var(--bg-elevated)', borderRadius: 8,
            borderLeft: `3px solid ${e.color}`,
            fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.5,
          }}
        >
          <span style={{ fontFamily: mono, color: e.color, fontSize: 'var(--text-2xs)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {e.objectName}
          </span>
          <br />
          {e.comment}
        </div>
      ))}
    </div>
  );
}

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

            {/* What the game is + what it produces */}
            <div
              style={{
                marginTop: 'clamp(2rem, 6vw, 3rem)', width: '100%',
                borderTop: '1px solid rgba(15,13,11,0.12)', paddingTop: 'clamp(1.5rem, 4vw, 2rem)',
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 'clamp(1.25rem, 4vw, 2.5rem)', alignItems: 'start',
                textAlign: 'left',
              }}
            >
              <div>
                <p style={{ ...eyebrowCss, margin: 0 }}>The game</p>
                <p style={{ margin: '0.75rem 0 0', fontSize: 'var(--text-base)', lineHeight: 1.65, color: 'var(--text-secondary)', maxWidth: '46ch' }}>
                  interView is a slow game of collective sensemaking. Players
                  nominate the topics that matter to them, stake tokens on the
                  conversations they want to see, and meet on shared maps —
                  each perspective a point, each point a comment, each comment
                  votable. The best questions get replayed, refined, and
                  passed on.
                </p>
                <p style={{ margin: '0.75rem 0 0', fontSize: 'var(--text-sm)', lineHeight: 1.6, color: 'var(--text-muted)', maxWidth: '46ch' }}>
                  To the right: a finished map from the sample question
                  &ldquo;{SAMPLE_MAP.question}&rdquo; — hover a dot for its
                  story.
                </p>
              </div>
              <SampleMapPreview />
            </div>
          </div>

          {/* Edition tag, bottom-right */}
          <span
            style={{
              position: 'absolute', right: 'clamp(1.25rem, 4vw, 2.5rem)', bottom: 'clamp(1rem, 3vw, 1.5rem)',
              fontFamily: mono, fontWeight: 300, fontSize: 'var(--text-2xs)',
              letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)',
            }}
          >
            Edition {editionLabel(instance)}{instance?.name && instance.name.toLowerCase() !== 'interview' ? ` · ${instance.name}` : ''}
          </span>
        </section>
      </main>
    </div>
  );
}
