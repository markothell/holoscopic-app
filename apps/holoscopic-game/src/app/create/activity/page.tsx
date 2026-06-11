'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type ActivityType = 'dissolve' | 'resolve';

interface Frame {
  id: string;
  xLabel: string; xMin: string; xMax: string;
  yLabel: string; yMin: string; yMax: string;
}

interface Topic {
  id: string;
  title: string;
  description: string;
  status: string;
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const page: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-dm-mono), monospace',
};

const header: React.CSSProperties = {
  height: 50,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 1.5rem',
  borderBottom: '1px solid var(--border-subtle)',
  flexShrink: 0,
};

const label: React.CSSProperties = {
  display: 'block',
  fontSize: '0.5rem',
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  color: 'var(--text-muted)',
  marginBottom: '0.35rem',
};

const input: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-default)',
  borderRadius: 6,
  padding: '0.5rem 0.7rem',
  fontSize: '0.8rem',
  color: 'var(--text-primary)',
  boxSizing: 'border-box' as const,
  outline: 'none',
  fontFamily: 'inherit',
};

const textarea: React.CSSProperties = {
  ...input,
  resize: 'vertical' as const,
  minHeight: 72,
};

const btnFill: React.CSSProperties = {
  fontSize: '0.58rem',
  fontFamily: 'var(--font-dm-mono), monospace',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  padding: '0.5rem 1.4rem',
  borderRadius: 999,
  cursor: 'pointer',
  background: 'var(--accent)',
  border: 'none',
  color: 'var(--text-primary)',
};

const btnOutline: React.CSSProperties = {
  ...btnFill,
  background: 'transparent',
  border: '1px solid var(--border-strong)',
  color: 'var(--text-muted)',
};

// ─── Page inner (requires searchParams) ──────────────────────────────────────

function CreateActivityContent() {
  const router = useRouter();
  const params = useSearchParams();
  const frameId = params.get('frameId');
  const topicId = params.get('topicId');
  const { userId, isAuthenticated, isLoading: authLoading, refreshBalance } = useAuth();

  const [frame, setFrame] = useState<Frame | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [loadingCtx, setLoadingCtx] = useState(true);

  const [title, setTitle] = useState('');
  const [activityType, setActivityType] = useState<ActivityType>('dissolve');
  const [mapQuestion, setMapQuestion] = useState('');
  const [mapQuestion2, setMapQuestion2] = useState('');
  const [commentQuestion, setCommentQuestion] = useState('');
  const [xLabel, setXLabel] = useState('');
  const [xMin, setXMin] = useState('');
  const [xMax, setXMax] = useState('');
  const [yLabel, setYLabel] = useState('');
  const [yMin, setYMin] = useState('');
  const [yMax, setYMax] = useState('');
  const [maxEntries, setMaxEntries] = useState<2 | 4>(4);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load context
  useEffect(() => {
    setLoadingCtx(true);
    const load = async () => {
      try {
        if (frameId) {
          const d = await apiFetch(`/frame-refs/${frameId}`);
          if (d.frame) {
            setFrame(d.frame);
            setXLabel(d.frame.xLabel || '');
            setXMin(d.frame.xMin || '');
            setXMax(d.frame.xMax || '');
            setYLabel(d.frame.yLabel || '');
            setYMin(d.frame.yMin || '');
            setYMax(d.frame.yMax || '');
          }
        } else if (topicId) {
          const d = await apiFetch(`/topics/${topicId}`);
          if (d.topic) setTopic(d.topic);
        }
      } catch { /* context load failure is non-fatal */ }
      finally { setLoadingCtx(false); }
    };
    if (frameId || topicId) load();
    else setLoadingCtx(false);
  }, [frameId, topicId]);

  function slugify(s: string): string {
    return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    if (!title.trim()) { setError('Title is required'); return; }
    if (!mapQuestion.trim()) { setError('Map question is required'); return; }
    if (!xLabel.trim() || !yLabel.trim()) { setError('Both axis labels are required'); return; }
    if (!commentQuestion.trim()) { setError('Comment question is required'); return; }

    setSubmitting(true);
    setError(null);
    try {
      const slug = slugify(title.trim());
      const urlName = `${slug || 'map'}-${Date.now().toString(36)}`;
      const body: Record<string, any> = {
        title: title.trim(),
        urlName,
        activityType,
        mapQuestion: mapQuestion.trim(),
        mapQuestion2: activityType === 'dissolve' ? mapQuestion2.trim() : '',
        commentQuestion: commentQuestion.trim(),
        xAxis: { label: xLabel.trim(), min: xMin.trim() || '←', max: xMax.trim() || '→' },
        yAxis: { label: yLabel.trim(), min: yMin.trim() || '↓', max: yMax.trim() || '↑' },
        maxEntries,
        isPublic: true,
      };
      if (frameId) body.frameId = frameId;
      if (topicId) body.topicId = topicId;

      const data = await apiFetch('/activities', { method: 'POST', userId, body: JSON.stringify(body) });
      refreshBalance();
      const actUrlName = data?.data?.urlName;
      router.push(actUrlName ? `/${actUrlName}` : '/interview');
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
    }
  }

  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)', color: 'var(--text-muted)', fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.72rem' }}>
        loading…
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={page}>
        <header style={header}>
          <Link href="/interview" style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none' }}>
            inter<span style={{ color: 'var(--accent)' }}>View</span>
          </Link>
        </header>
        <div style={{ maxWidth: 480, margin: '6rem auto', padding: '0 1.5rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1.5rem' }}>You need to be signed in to create a map.</p>
          <Link href="/login" style={{ ...btnFill, textDecoration: 'none' }}>Sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={page}>
      {/* Header */}
      <header style={header}>
        <Link href="/interview" style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none' }}>
          inter<span style={{ color: 'var(--accent)' }}>View</span>
        </Link>
        <Link href="/interview" style={{ fontSize: '0.55rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', textDecoration: 'none' }}>
          ← Back
        </Link>
      </header>

      <main style={{ maxWidth: 560, margin: '0 auto', padding: '2.5rem 1.5rem' }}>
        {/* Context badge */}
        {!loadingCtx && (frame || topic) && (
          <div style={{ marginBottom: '2rem', padding: '0.85rem 1rem', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.45rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
              {frame ? 'Frame of Reference' : 'Topic'}
            </div>
            {frame && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <span style={{ color: '#C0A45E' }}>{frame.xLabel}</span>
                <span style={{ color: 'var(--text-muted)', margin: '0 0.5rem' }}>·</span>
                <span style={{ color: '#C0A45E' }}>{frame.yLabel}</span>
              </div>
            )}
            {topic && (
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{topic.title}</div>
            )}
          </div>
        )}

        <h1 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '2rem', letterSpacing: '-0.01em' }}>
          New Map
        </h1>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Activity type */}
          <div>
            <span style={label}>Map type</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {(['dissolve', 'resolve'] as ActivityType[]).map(t => (
                <button key={t} type="button" onClick={() => setActivityType(t)} style={{
                  padding: '0.4rem 1rem', borderRadius: 999, fontSize: '0.62rem',
                  letterSpacing: '0.07em', textTransform: 'uppercase', cursor: 'pointer',
                  background: activityType === t ? 'var(--accent)' : 'var(--bg-elevated)',
                  border: `1px solid ${activityType === t ? 'var(--accent)' : 'var(--border-default)'}`,
                  color: activityType === t ? 'var(--text-primary)' : 'var(--text-muted)',
                }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label style={label}>Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="What are we mapping?" style={input} />
          </div>

          {/* Map question */}
          <div>
            <label style={label}>{activityType === 'dissolve' ? 'Map question (X axis)' : 'Map question'}</label>
            <textarea value={mapQuestion} onChange={e => setMapQuestion(e.target.value)}
              placeholder="How would you position this on the map?" rows={2} style={textarea} />
          </div>

          {/* Dissolve second question */}
          {activityType === 'dissolve' && (
            <div>
              <label style={label}>Map question (Y axis)</label>
              <textarea value={mapQuestion2} onChange={e => setMapQuestion2(e.target.value)}
                placeholder="What does the vertical axis represent to you?" rows={2} style={textarea} />
            </div>
          )}

          {/* Axis labels */}
          <div>
            <span style={label}>X axis</span>
            <input value={xLabel} onChange={e => setXLabel(e.target.value)}
              placeholder="e.g. Individual ↔ Collective" style={{ ...input, marginBottom: '0.4rem' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
              <input value={xMin} onChange={e => setXMin(e.target.value)} placeholder="← left pole" style={{ ...input, fontSize: '0.7rem' }} />
              <input value={xMax} onChange={e => setXMax(e.target.value)} placeholder="right pole →" style={{ ...input, fontSize: '0.7rem' }} />
            </div>
          </div>

          <div>
            <span style={label}>Y axis</span>
            <input value={yLabel} onChange={e => setYLabel(e.target.value)}
              placeholder="e.g. Past ↔ Future" style={{ ...input, marginBottom: '0.4rem' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
              <input value={yMin} onChange={e => setYMin(e.target.value)} placeholder="↓ bottom pole" style={{ ...input, fontSize: '0.7rem' }} />
              <input value={yMax} onChange={e => setYMax(e.target.value)} placeholder="top pole ↑" style={{ ...input, fontSize: '0.7rem' }} />
            </div>
          </div>

          {/* Comment question */}
          <div>
            <label style={label}>Comment question</label>
            <textarea value={commentQuestion} onChange={e => setCommentQuestion(e.target.value)}
              placeholder="What object or example represents your position?" rows={2} style={textarea} />
          </div>

          {/* Slots */}
          <div>
            <span style={label}>Participant slots</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {([2, 4] as const).map(n => (
                <button key={n} type="button" onClick={() => setMaxEntries(n)} style={{
                  padding: '0.4rem 0.9rem', borderRadius: 999, fontSize: '0.62rem',
                  letterSpacing: '0.07em', cursor: 'pointer',
                  background: maxEntries === n ? 'var(--bg-elevated)' : 'transparent',
                  border: `1px solid ${maxEntries === n ? 'var(--border-strong)' : 'var(--border-default)'}`,
                  color: maxEntries === n ? 'var(--text-primary)' : 'var(--text-muted)',
                }}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {error && <p style={{ fontSize: '0.72rem', color: 'var(--accent)', margin: 0 }}>{error}</p>}

          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', paddingTop: '0.5rem' }}>
            <Link href="/interview" style={{ ...btnOutline, textDecoration: 'none' }}>Cancel</Link>
            <button type="submit" disabled={submitting} style={{ ...btnFill, opacity: submitting ? 0.7 : 1 }}>
              {submitting ? 'Creating…' : 'Create Map'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

export default function CreateActivityPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)', color: 'var(--text-muted)', fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.72rem' }}>
        loading…
      </div>
    }>
      <CreateActivityContent />
    </Suspense>
  );
}
