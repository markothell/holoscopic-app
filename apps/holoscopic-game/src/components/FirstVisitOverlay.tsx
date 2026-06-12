'use client';

import { useState, useEffect } from 'react';
import { useInstance } from '@/contexts/InstanceContext';
import { GAME_NAME, STR, HOLON_SYMBOL } from '@/lib/strings';
import { btn, mono, eyebrowCss } from '@/lib/ui';

const STORAGE_KEY = 'interview_onboarded_v1';

/**
 * Three skippable panels for a player's first visit to the hub.
 * Goal: from "what is this?" to placing a first dot in under three minutes.
 */
export default function FirstVisitOverlay() {
  const { config } = useInstance();
  const [panel, setPanel] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch { /* private mode — skip */ }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
    setVisible(false);
  };

  const starting = config?.holons?.startingStake ?? 100;
  const stake = config?.holons?.activityStakeAmount ?? 5;

  const panels = [
    {
      eyebrow: `Welcome to ${GAME_NAME}`,
      title: 'This is a map of what this group is exploring',
      body: `Every circle is something someone put into play. Click any node to see what it is and what you can do with it — nothing happens until you choose.`,
    },
    {
      eyebrow: 'Three kinds of things',
      title: `${STR.topics} · ${STR.frames} · ${STR.patterns}`,
      body: `${STR.topics} are questions the group wants to explore. ${STR.frames} are the axes we map with — pairs of ideas in tension. ${STR.patterns} are repeatable conversation structures built from ${STR.maps.toLowerCase()} that worked.`,
    },
    {
      eyebrow: 'The economy',
      title: `You start with ${HOLON_SYMBOL}${starting} ${STR.holons}`,
      body: `Spend them to signal what matters — joining a ${STR.map.toLowerCase()} stakes ${HOLON_SYMBOL}${stake}, which you direct to others by voting. Earn by connecting: when your words, frames, and questions shape what happens next.`,
    },
  ];
  const p = panels[panel];
  const last = panel === panels.length - 1;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15,13,11,0.35)', padding: '1.5rem',
    }}>
      <div style={{
        maxWidth: 440, width: '100%', background: 'var(--bg-secondary)',
        border: '1px solid var(--border-default)', borderRadius: 16,
        boxShadow: '0 16px 48px rgba(15,13,11,0.18)', padding: '2rem',
      }}>
        <p style={{ ...eyebrowCss, marginBottom: '0.75rem' }}>{p.eyebrow}</p>
        <h2 style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.85rem', lineHeight: 1.25, fontFamily: 'var(--font-cormorant), Georgia, serif' }}>
          {p.title}
        </h2>
        <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-secondary)', lineHeight: 1.65, margin: '0 0 1.75rem' }}>
          {p.body}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* progress dots */}
          <div style={{ display: 'flex', gap: '0.35rem', marginRight: 'auto' }}>
            {panels.map((_, i) => (
              <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: i === panel ? 'var(--accent)' : 'var(--border-strong)' }} />
            ))}
          </div>
          <button onClick={dismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--text-2xs)', fontFamily: mono, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Skip
          </button>
          <button onClick={() => (last ? dismiss() : setPanel(panel + 1))} style={btn('fill')}>
            {last ? `Find a ${STR.map.toLowerCase()} to join` : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
