'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';
import styles from './page.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const MAX_PER_SEQUENCE = 50;

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActivityDetail {
  id: string;
  title: string;
  urlName: string;
  activityType: string;
}

interface SequenceActivity {
  activityId: string;
  order: number;
  openedAt: string | null;
  closedAt: string | null;
  parentActivityIds: string[];
  activity: ActivityDetail | null;
}

interface WaitlistSequence {
  id: string;
  title: string;
  description: string;
  urlName: string;
  activities: SequenceActivity[];
}

type Status = 'idle' | 'loading' | 'success' | 'error';

// ── Pie Circle (restored from old design) ────────────────────────────────────

function PieCircle({ count, max = MAX_PER_SEQUENCE }: { count: number; max?: number }) {
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

// ── SVG Graph ─────────────────────────────────────────────────────────────────

const NODE_W = 110, NODE_H = 34, GAP_X = 56, GAP_Y = 44, PAD = 16;

interface GNode { id: string; label: string; x: number; y: number; w: number; h: number; opened: boolean }
interface GEdge { from: string; to: string }

function computeLayout(activities: SequenceActivity[]) {
  if (activities.length === 0) return { nodes: [] as GNode[], edges: [] as GEdge[], w: 0, h: 0 };

  const actMap  = new Map(activities.map(a => [a.activityId, a]));
  const levels  = new Map<string, number>();

  function getLevel(id: string): number {
    if (levels.has(id)) return levels.get(id)!;
    const act = actMap.get(id);
    if (!act || act.parentActivityIds.length === 0) { levels.set(id, 0); return 0; }
    const pl = Math.max(...act.parentActivityIds.map(getLevel));
    levels.set(id, pl + 1); return pl + 1;
  }
  activities.forEach(a => getLevel(a.activityId));

  const byLevel = new Map<number, string[]>();
  levels.forEach((lv, id) => { if (!byLevel.has(lv)) byLevel.set(lv, []); byLevel.get(lv)!.push(id); });

  const maxLv  = Math.max(...levels.values());
  const maxCnt = Math.max(...Array.from(byLevel.values()).map(v => v.length));
  const svgW   = (maxLv + 1) * (NODE_W + GAP_X) - GAP_X + PAD * 2;
  const svgH   = maxCnt * (NODE_H + GAP_Y) - GAP_Y + PAD * 2;

  const pos = new Map<string, { x: number; y: number }>();
  byLevel.forEach((ids, lv) => {
    const totalH = ids.length * (NODE_H + GAP_Y) - GAP_Y;
    const startY = (svgH - totalH) / 2;
    ids.forEach((id, i) => pos.set(id, { x: PAD + lv * (NODE_W + GAP_X), y: startY + i * (NODE_H + GAP_Y) }));
  });

  const nodes: GNode[] = activities.map(a => {
    const p = pos.get(a.activityId) || { x: 0, y: 0 };
    return { id: a.activityId, label: (a.activity?.title || a.activityId).toUpperCase(), x: p.x, y: p.y, w: NODE_W, h: NODE_H, opened: !!a.openedAt };
  });
  const edges: GEdge[] = [];
  activities.forEach(a => a.parentActivityIds.forEach(pid => edges.push({ from: pid, to: a.activityId })));
  return { nodes, edges, w: svgW, h: svgH };
}

function ActivityGraph({ activities }: { activities: SequenceActivity[] }) {
  const { nodes, edges, w, h } = computeLayout(activities);
  const nMap = new Map(nodes.map(n => [n.id, n]));
  if (nodes.length === 0) return <p className={styles.graphEmpty}>No activities mapped yet</p>;

  return (
    <div className={styles.graphScroll}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
        <defs>
          {nodes.map(n => (
            <clipPath key={`c-${n.id}`} id={`c-${n.id}`}>
              <rect x={n.x + 8} y={n.y} width={n.w - 16} height={n.h} />
            </clipPath>
          ))}
        </defs>
        {edges.map((e, i) => {
          const f = nMap.get(e.from), t = nMap.get(e.to);
          if (!f || !t) return null;
          const x1 = f.x + f.w, y1 = f.y + f.h / 2, x2 = t.x, y2 = t.y + t.h / 2, cx = (x1 + x2) / 2;
          return <path key={i} d={`M ${x1} ${y1} C ${cx} ${y1} ${cx} ${y2} ${x2} ${y2}`} fill="none" stroke="#D9D4CC" strokeWidth="1.5" />;
        })}
        {nodes.map(n => (
          <g key={n.id}>
            <rect x={n.x} y={n.y} width={n.w} height={n.h} rx="6"
              fill={n.opened ? 'rgba(200,59,80,0.07)' : 'rgba(255,255,255,0.6)'}
              stroke={n.opened ? '#C83B50' : '#D9D4CC'} strokeWidth="1" />
            <text x={n.x + n.w / 2} y={n.y + n.h / 2 + 3} textAnchor="middle"
              fill={n.opened ? '#C83B50' : '#6B6560'} fontSize="7.5"
              fontFamily="var(--font-dm-mono), monospace" letterSpacing="0.08em"
              clipPath={`url(#c-${n.id})`}>{n.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ── Sequence Card ─────────────────────────────────────────────────────────────

function SequenceCard({
  sequence,
  count,
  selected,
  expanded,
  onSelect,
  onExpand,
}: {
  sequence: WaitlistSequence;
  count: number;
  selected: boolean;
  expanded: boolean;
  onSelect: () => void;
  onExpand: () => void;
}) {
  const preview = sequence.description
    ? sequence.description.slice(0, 30) + (sequence.description.length > 30 ? '…' : '')
    : '';

  return (
    <div className={`${styles.card} ${selected ? styles.cardSelected : ''}`}>
      {/* ── Clickable card face (select) ── */}
      <button
        type="button"
        className={styles.cardFace}
        onClick={onSelect}
        aria-pressed={selected}
      >
        <span className={styles.cardTitle}>{sequence.title}</span>

        {preview && !expanded && (
          <span className={styles.cardSnippet}>{preview}</span>
        )}

        <span className={styles.cardVisual}>
          <PieCircle count={Math.min(count, MAX_PER_SEQUENCE)} />
          <span className={styles.cardCount}>
            {count}/{MAX_PER_SEQUENCE}&thinsp;to begin
          </span>
        </span>
      </button>

      {/* ── Details toggle ── */}
      <button
        type="button"
        className={`${styles.detailsToggle} ${expanded ? styles.detailsToggleOpen : ''}`}
        onClick={onExpand}
        aria-expanded={expanded}
        aria-label={expanded ? 'Hide details' : 'Show details'}
      >
        +
      </button>

      {/* ── Expanded details (description + graph) ── */}
      <div className={`${styles.details} ${expanded ? styles.detailsOpen : ''}`}>
        <div className={styles.detailsInner}>
          {sequence.description && (
            <div className={styles.detailsText}>
              <p className={styles.detailsDescription}>{sequence.description}</p>
            </div>
          )}
          {sequence.activities.length > 0 && (
            <div className={styles.detailsGraph}>
              <div className={styles.graphBlock}>
                <p className={styles.graphLabel}>Activity map</p>
                <div className={styles.graphBox}>
                  <ActivityGraph activities={sequence.activities} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WaitlistPage() {
  const [sequences, setSequences]   = useState<WaitlistSequence[]>([]);
  const [counts, setCounts]         = useState<Record<string, number>>({});
  const [loading, setLoading]       = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedId, setExpandedId]   = useState<string | null>(null);

  const [email, setEmail]     = useState('');
  const [status, setStatus]   = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const orig = document.body.style.background;
    document.body.style.background = '#F7F4EF';
    return () => { document.body.style.background = orig; };
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/sequences/waitlist`);
        if (!res.ok) throw new Error('Failed to load');
        const data: WaitlistSequence[] = await res.json();
        setSequences(data);
        if (data.length > 0) {
          const ids = data.map(s => s.id).join(',');
          const cr  = await fetch(`${API_BASE}/waitlist/counts?sequenceIds=${ids}`);
          if (cr.ok) { const cd = await cr.json(); setCounts(cd.counts || {}); }
        }
      } catch {
        setFetchError('Could not load sequences. Please try again.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function toggleSelect(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
    setErrorMsg('');
  }

  function toggleExpand(id: string) {
    setExpandedId(prev => prev === id ? null : id);
  }

  async function handleSubmit() {
    if (selectedIds.length === 0) { setErrorMsg('Select at least one sequence.'); return; }
    if (!email.trim()) { setErrorMsg('Enter your email address.'); return; }

    setStatus('loading');
    setErrorMsg('');

    try {
      await Promise.all(
        selectedIds.map(seqId =>
          fetch(`${API_BASE}/waitlist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.trim(), sequenceId: seqId }),
          })
        )
      );
      // Update local counts
      setCounts(prev => {
        const next = { ...prev };
        selectedIds.forEach(id => { next[id] = (next[id] || 0) + 1; });
        return next;
      });
      setStatus('success');
    } catch {
      setErrorMsg('Could not reach the server. Check your connection and try again.');
      setStatus('error');
    }
  }

  const selectedNames = selectedIds
    .map(id => sequences.find(s => s.id === id)?.title)
    .filter(Boolean) as string[];

  const nameList = selectedNames.length === 1
    ? selectedNames[0]
    : selectedNames.length === 2
      ? `${selectedNames[0]} and ${selectedNames[1]}`
      : selectedNames.slice(0, -1).join(', ') + `, and ${selectedNames[selectedNames.length - 1]}`;

  return (
    <div className={styles.page}>
      <div className={styles.grain} />

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.wordmark}>
            Holo<span className={styles.wordmarkAccent}>scopic</span>
          </Link>
          <UserMenu />
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.content}>

          {status === 'success' ? (
            /* ── Confirmation ── */
            <div className={styles.confirmation}>
              <div className={styles.checkIcon}>
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                  <circle cx="16" cy="16" r="15" stroke="#2a9d6f" strokeWidth="1.5" />
                  <path d="M10 16.5l4.5 4.5 7.5-9" stroke="#2a9d6f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h1 className={styles.confirmHeadline}>You&rsquo;re on the list.</h1>
              <p className={styles.confirmBody}>
                When <em>{nameList}</em> opens, we&rsquo;ll send you an invitation.
              </p>
              <Link href="/" className={styles.backLink}>← Back to home</Link>
            </div>

          ) : (
            /* ── Form ── */
            <>
              <p className={styles.eyebrow}>Gathering Cohorts</p>
              <h1 className={styles.headline}>Upcoming Sequences</h1>
              <p className={styles.body}>
                We&rsquo;re forming cohorts around specific sequences of activities.
                Select the ones you care about &mdash; when a round opens,
                you&rsquo;ll receive an invitation.
              </p>

              {/* ── Sequence cards ── */}
              {loading && (
                <div className={styles.loadingRow}>
                  <span className={styles.dots}><span /><span /><span /></span>
                </div>
              )}

              {!loading && fetchError && (
                <p className={styles.errorText}>{fetchError}</p>
              )}

              {!loading && !fetchError && sequences.length === 0 && (
                <div className={styles.emptyState}>
                  <p className={styles.emptyText}>No sequences are currently accepting signups.</p>
                  <Link href="/" className={styles.backLink}>← Back to home</Link>
                </div>
              )}

              {!loading && !fetchError && sequences.length > 0 && (
                <>
                  <p className={styles.sectionLabel}>Select sequences</p>

                  <div className={styles.cardGrid}>
                    {sequences.map(seq => (
                      <SequenceCard
                        key={seq.id}
                        sequence={seq}
                        count={counts[seq.id] || 0}
                        selected={selectedIds.includes(seq.id)}
                        expanded={expandedId === seq.id}
                        onSelect={() => toggleSelect(seq.id)}
                        onExpand={() => toggleExpand(seq.id)}
                      />
                    ))}
                  </div>

                  {/* ── Email row ── */}
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
                    type="button"
                    onClick={handleSubmit}
                    className={styles.submitBtn}
                    disabled={status === 'loading'}
                  >
                    {status === 'loading' ? 'Sending…' : 'Request Invitation →'}
                  </button>

                  <p className={styles.footnote}>
                    No spam. No pressure. Just a heads-up when your round begins.
                  </p>
                </>
              )}
            </>
          )}

        </div>
      </main>
    </div>
  );
}
