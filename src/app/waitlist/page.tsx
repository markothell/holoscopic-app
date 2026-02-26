'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';
import styles from './page.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const MAX_PER_TOPIC = 25;

const TOPICS = [
  { name: 'Relationship', sub: ['Conflict', 'Resolution'] },
  { name: 'Intuition',    sub: ['Impulse', 'Action'] },
  { name: 'Work',         sub: ['Passion', 'Duty'] },
  { name: 'Sexuality',    sub: ['Arousal', 'Intentionality'] },
] as const;

type TopicName = (typeof TOPICS)[number]['name'];

// ── PieCircle ────────────────────────────────────────────────────────────────

function PieCircle({ count, max = MAX_PER_TOPIC }: { count: number; max?: number }) {
  const cx = 24, cy = 24, r = 20;
  const sliceAngle = 360 / max;
  const gap = 1.5;

  function toRad(d: number) { return (d * Math.PI) / 180; }

  function slicePath(index: number, filled: boolean) {
    const startDeg = index * sliceAngle - 90;
    const endDeg   = startDeg + sliceAngle - gap;
    const x1 = cx + r * Math.cos(toRad(startDeg));
    const y1 = cy + r * Math.sin(toRad(startDeg));
    const x2 = cx + r * Math.cos(toRad(endDeg));
    const y2 = cy + r * Math.sin(toRad(endDeg));
    const large = (sliceAngle - gap) > 180 ? 1 : 0;
    return (
      <path
        key={index}
        d={`M ${cx} ${cy} L ${x1.toFixed(3)} ${y1.toFixed(3)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z`}
        fill={filled ? '#C83B50' : '#E0DAD4'}
      />
    );
  }

  return (
    <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
      {Array.from({ length: max }, (_, i) => slicePath(i, i < count))}
    </svg>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

type Status = 'idle' | 'loading' | 'success' | 'error';

export default function WaitlistPage() {
  const [counts, setCounts]               = useState<Record<string, number>>({});
  const [selectedTopics, setSelectedTopics] = useState<TopicName[]>([]);
  const [email, setEmail]                 = useState('');
  const [status, setStatus]               = useState<Status>('idle');
  const [errorMsg, setErrorMsg]           = useState('');

  useEffect(() => {
    document.body.style.background = '#F7F4EF';
    fetch(`${API_BASE}/waitlist/counts`)
      .then(r => r.json())
      .then(d => { if (d.counts) setCounts(d.counts); })
      .catch(() => {});
  }, []);

  function toggleTopic(name: TopicName) {
    setSelectedTopics(prev =>
      prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name]
    );
    setErrorMsg('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedTopics.length === 0) {
      setErrorMsg('Select at least one topic.');
      return;
    }
    if (!email.trim()) {
      setErrorMsg('Enter your email address.');
      return;
    }

    setStatus('loading');
    setErrorMsg('');

    try {
      const res = await fetch(`${API_BASE}/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), topics: selectedTopics }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Something went wrong. Please try again.');
        setStatus('error');
        return;
      }
      if (data.counts) setCounts(data.counts);
      setStatus('success');
    } catch {
      setErrorMsg('Could not reach the server. Check your connection and try again.');
      setStatus('error');
    }
  }

  const topicList = selectedTopics.length === 1
    ? selectedTopics[0]
    : selectedTopics.length === 2
      ? `${selectedTopics[0]} and ${selectedTopics[1]}`
      : selectedTopics.slice(0, -1).join(', ') + `, and ${selectedTopics[selectedTopics.length - 1]}`;

  return (
    <div className={styles.page}>
      <div className={styles.grain} />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.wordmark}>
            Holo<span className={styles.wordmarkAccent}>scopic</span>
          </Link>
          <UserMenu />
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────────────── */}
      <main className={styles.main}>
        <div className={styles.content}>

          {status === 'success' ? (
            /* ── Confirmation ─────────────────────────────────────────── */
            <div className={styles.confirmation}>
              <div className={styles.checkIcon}>
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                  <circle cx="16" cy="16" r="15" stroke="#2a9d6f" strokeWidth="1.5" />
                  <path d="M10 16.5l4.5 4.5 7.5-9" stroke="#2a9d6f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h1 className={styles.confirmHeadline}>You&rsquo;re on the list.</h1>
              <p className={styles.confirmBody}>
                When the next round of <em>{topicList}</em> begins,
                we&rsquo;ll send you an invitation.
              </p>
              <Link href="/" className={styles.backLink}>← Back to home</Link>
            </div>

          ) : (
            /* ── Form ─────────────────────────────────────────────────── */
            <>
              <p className={styles.eyebrow}>Gathering Cohorts</p>
              <h1 className={styles.headline}>Not quite open yet.</h1>
              <p className={styles.body}>
                We&rsquo;re forming small cohorts &mdash; groups of people exploring
                specific questions together. When a round opens for a topic you care
                about, you&rsquo;ll receive an invitation.
              </p>

              <form onSubmit={handleSubmit} noValidate>
                <p className={styles.sectionLabel}>Select your topics</p>

                <div className={styles.topicGrid}>
                  {TOPICS.map(({ name, sub }) => {
                    const count  = counts[name] ?? 0;
                    const full   = count >= MAX_PER_TOPIC;
                    const chosen = selectedTopics.includes(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => !full && toggleTopic(name)}
                        className={`${styles.topicCard} ${chosen ? styles.topicCardSelected : ''} ${full ? styles.topicCardFull : ''}`}
                        aria-pressed={chosen}
                        disabled={full && !chosen}
                      >
                        <span className={styles.topicTitle}>{name}</span>
                        <span className={styles.topicSubs}>
                          <span>{sub[0]}</span>
                          <span className={styles.topicSubDot}>·</span>
                          <span>{sub[1]}</span>
                        </span>
                        <span className={styles.topicVisual}>
                          <PieCircle count={count} />
                          <span className={styles.topicCount}>
                            {count}&thinsp;/&thinsp;{MAX_PER_TOPIC}
                          </span>
                        </span>
                        {full && <span className={styles.fullBadge}>Full</span>}
                      </button>
                    );
                  })}
                </div>

                <div className={styles.emailRow}>
                  <label htmlFor="waitlist-email" className={styles.emailLabel}>
                    Your email
                  </label>
                  <input
                    id="waitlist-email"
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setErrorMsg(''); }}
                    placeholder="your@email.com"
                    className={styles.emailInput}
                    autoComplete="email"
                    disabled={status === 'loading'}
                  />
                </div>

                {errorMsg && (
                  <p className={styles.errorMsg} role="alert">{errorMsg}</p>
                )}

                <button
                  type="submit"
                  className={styles.submitBtn}
                  disabled={status === 'loading'}
                >
                  {status === 'loading' ? 'Sending…' : 'Request Invitation →'}
                </button>
              </form>

              <p className={styles.footnote}>
                No spam. No pressure. Just a heads-up when your round begins.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
