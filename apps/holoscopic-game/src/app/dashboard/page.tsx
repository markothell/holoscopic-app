'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';
import VerifyEmailNotice from '@/components/VerifyEmailNotice';
import GameCardStack, { type CardKey, type CardSignal } from '@/components/GameCards';
import { useAuth } from '@/contexts/AuthContext';
import { MeService, type Dashboard, type DashboardSignal } from '@/services/meService';
import { CIRCLES_URL, SPECTRUM_URL, THRESHOLD_URL } from '@/lib/games';
import styles from './page.module.css';

const DEFAULT_ORDER: CardKey[] = ['circles', 'threshold', 'chorus', 'synthesis', 'spectrum', 'interview', 'map-sequence'];

// Chorus has no home of yours to return to (a memorial is reachable only by its
// link) and Map + Sequence is the legacy tool, so neither is ever "what you
// were last doing" and both stay at the bottom whatever lastUsed says.
const ALWAYS_LAST: CardKey[] = ['chorus', 'map-sequence'];

// Signal paths are relative to the app that sent them.
const SIGNAL_ORIGINS: Record<keyof Dashboard['apps'], string> = {
  circles: CIRCLES_URL,
  threshold: THRESHOLD_URL,
  spectrum: SPECTRUM_URL,
};

function cardOrder(lastUsed: Dashboard['lastUsed']): CardKey[] {
  const time = (k: CardKey) => {
    const iso = (lastUsed as Partial<Record<CardKey, string>>)[k];
    const t = iso ? Date.parse(iso) : NaN;
    return Number.isNaN(t) ? null : t;
  };
  const middle = DEFAULT_ORDER.filter(k => !ALWAYS_LAST.includes(k));
  const used = middle.filter(k => time(k) !== null).sort((a, b) => time(b)! - time(a)!);
  const unused = middle.filter(k => time(k) === null);
  return [...used, ...unused, ...ALWAYS_LAST];
}

function cardSignals(apps: Dashboard['apps']): Partial<Record<CardKey, CardSignal>> {
  const out: Partial<Record<CardKey, CardSignal>> = {};
  for (const [app, origin] of Object.entries(SIGNAL_ORIGINS) as [keyof Dashboard['apps'], string][]) {
    const s: DashboardSignal | undefined = apps?.[app];
    if (!s) continue;
    out[app] = { count: s.count, items: s.items.map(i => ({ title: i.title, href: `${origin}${i.path}` })) };
  }
  return out;
}

// The signed-in launcher: the homepage's game cards, pointed at where each game
// runs instead of at its lander. Someone who reaches the dashboard has an
// account and came to use something, not to be told what it is — so the cards
// they used most recently come first, and anything waiting for them shows on
// its card.
export default function DashboardPage() {
  const { userId } = useAuth();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);

  useEffect(() => {
    const original = document.body.style.background;
    document.body.style.background = '#F7F4EF';
    return () => { document.body.style.background = original; };
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    MeService.getDashboard(userId)
      .then(d => { if (!cancelled) setDashboard(d); })
      // Fail soft: the plain launcher is still a working page. Nothing waiting
      // is a better failure than an error where the cards should be.
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);

  const invitations = dashboard?.invitations ?? 0;

  return (
    <div className={styles.page}>
      <div className={styles.grain} />

      <div className={styles.container}>
        {/* Nav */}
        <nav className={styles.nav}>
          <div className={styles.navInner}>
            <Link href="/" className={styles.navHome}>
              Holo<span>scopic</span>
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <span className={styles.navLabel}>Dashboard</span>
              <UserMenu />
            </div>
          </div>
        </nav>

        {/* Header */}
        <div className={styles.header}>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.subtitle}>Every instrument on Holoscopic, one step in</p>
          {invitations > 0 && (
            <Link href="/invitations" className={styles.inviteLine}>
              {invitations === 1 ? '1 invitation waiting' : `${invitations} invitations waiting`} &rarr;
            </Link>
          )}
        </div>

        <div className={styles.divider} />

        <VerifyEmailNotice />

        <div className={styles.cards}>
          {dashboard ? (
            <GameCardStack to="app" order={cardOrder(dashboard.lastUsed ?? {})} signals={cardSignals(dashboard.apps ?? {})} />
          ) : (
            <GameCardStack to="app" />
          )}
        </div>

        {/* Footer */}
        <footer className={styles.footer}>
          <div className={styles.footerInner}>
            <Link href="/" className={styles.footerLink}>Home</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
