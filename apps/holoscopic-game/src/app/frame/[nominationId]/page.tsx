'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useInstance } from '@/contexts/InstanceContext';
import { FrameService, FrameNomination } from '@/services/frameService';
import UserMenu from '@/components/UserMenu';

export default function FrameNominationPage() {
  const params = useParams();
  const router = useRouter();
  const nominationId = params.nominationId as string;
  const { userId, isLoading: authLoading } = useAuth();
  const { ended } = useInstance();

  const [nomination, setNomination] = useState<FrameNomination | null>(null);
  const [sourceActivity, setSourceActivity] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [done, setDone] = useState(false);

  const [title, setTitle] = useState('');
  const [xLabel, setXLabel] = useState('');
  const [xMin, setXMin] = useState('');
  const [xMax, setXMax] = useState('');
  const [yLabel, setYLabel] = useState('');
  const [yMin, setYMin] = useState('');
  const [yMax, setYMax] = useState('');
  const [mapQuestion, setMapQuestion] = useState('');
  const [commentQuestion, setCommentQuestion] = useState('');
  const [objectNameQuestion, setObjectNameQuestion] = useState('');
  const [preamble, setPreamble] = useState('');

  useEffect(() => {
    if (authLoading) return;
    FrameService.get(nominationId)
      .then(({ nomination, sourceActivity }) => {
        setNomination(nomination);
        setSourceActivity(sourceActivity);
        if (sourceActivity) {
          setXLabel(sourceActivity.xAxis?.label || '');
          setXMin(sourceActivity.xAxis?.min || '');
          setXMax(sourceActivity.xAxis?.max || '');
          setYLabel(sourceActivity.yAxis?.label || '');
          setYMin(sourceActivity.yAxis?.min || '');
          setYMax(sourceActivity.yAxis?.max || '');
          setObjectNameQuestion(sourceActivity.objectNameQuestion || '');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [nominationId, authLoading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !nomination) return;
    setSubmitting(true);
    try {
      await FrameService.submit(userId, nomination.id, {
        title, mapQuestion, commentQuestion, objectNameQuestion, preamble,
        xAxis: { label: xLabel, min: xMin, max: xMax },
        yAxis: { label: yLabel, min: yMin, max: yMax },
      });
      setDone(true);
    } catch (err: any) {
      alert(err.message || 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDecline() {
    if (!userId || !nomination) return;
    if (!confirm('Are you sure you want to decline this nomination?')) return;
    setDeclining(true);
    try {
      await FrameService.decline(userId, nomination.id);
      router.push('/dashboard');
    } catch (err: any) {
      alert(err.message || 'Failed to decline');
    } finally {
      setDeclining(false);
    }
  }

  const inputStyle = {
    width: '100%', padding: '0.55rem 0.75rem', fontSize: '0.85rem',
    background: 'var(--bg-secondary)', border: '1px solid var(--border-default)',
    borderRadius: 6, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' as const,
  };
  const labelStyle = {
    display: 'block', fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace',
    letterSpacing: '0.08em', textTransform: 'uppercase' as const,
    color: 'var(--text-muted)', marginBottom: '0.35rem',
  };
  const fieldStyle = { marginBottom: '1rem' };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading…</p>
      </div>
    );
  }

  if (!nomination) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Nomination not found.</p>
      </div>
    );
  }

  if (done) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ maxWidth: 480, textAlign: 'center', padding: '2rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>Frame submitted</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Your new activity has been added to the sequence.</p>
          <Link href={`/sequence/${nomination.sequenceUrlName}`}
            style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0.5rem 1.2rem', borderRadius: 999, background: 'var(--accent)', color: 'var(--text-primary)', textDecoration: 'none' }}>
            Go to sequence →
          </Link>
        </div>
      </div>
    );
  }

  if (nomination.status !== 'pending') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            This nomination has already been {nomination.status}.
          </p>
          {nomination.status === 'submitted' && (
            <Link href={`/sequence/${nomination.sequenceUrlName}`}
              style={{ marginTop: '1rem', display: 'inline-block', fontSize: '0.8rem', color: 'var(--accent)', textDecoration: 'none' }}>
              View sequence →
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (userId && nomination.nomineeUserId !== userId) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>This nomination was not sent to you.</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <header style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ maxWidth: '100%', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem' }}>
          <Link href="/" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none' }}>
            Holo<span style={{ color: 'var(--accent)' }}>scopic</span>
          </Link>
          <UserMenu />
        </div>
      </header>

      <main style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1.5rem' }}>
        <div style={{ marginBottom: '2rem' }}>
          <span style={{ fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)' }}>
            Frame nomination
          </span>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0.4rem 0 0.5rem 0' }}>
            Create the next frame
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
            You've been invited to shape the next activity in{' '}
            <Link href={`/sequence/${nomination.sequenceUrlName}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
              this sequence
            </Link>
            {nomination.entryObjectName ? ` based on your entry "${nomination.entryObjectName}"` : ''}.
            Fill in the axis and questions that will guide everyone's thinking.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '1.5rem', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '0.7rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 1rem 0' }}>Activity</h2>
            <div style={fieldStyle}>
              <label style={labelStyle}>Title</label>
              <input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} required placeholder="Name this activity" />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Preamble (optional)</label>
              <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }} value={preamble} onChange={e => setPreamble(e.target.value)} placeholder="Context or framing for participants" />
            </div>
          </div>

          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '1.5rem', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '0.7rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 1rem 0' }}>Map question</h2>
            <div style={fieldStyle}>
              <label style={labelStyle}>Question participants answer by placing on the map</label>
              <input style={inputStyle} value={mapQuestion} onChange={e => setMapQuestion(e.target.value)} required placeholder="e.g. Where does this fall on familiarity and impact?" />
            </div>
          </div>

          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '1.5rem', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '0.7rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 1rem 0' }}>X axis</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={labelStyle}>Label</label>
                <input style={inputStyle} value={xLabel} onChange={e => setXLabel(e.target.value)} required placeholder="e.g. Familiarity" />
              </div>
              <div>
                <label style={labelStyle}>Left end</label>
                <input style={inputStyle} value={xMin} onChange={e => setXMin(e.target.value)} required placeholder="e.g. Unknown" />
              </div>
              <div>
                <label style={labelStyle}>Right end</label>
                <input style={inputStyle} value={xMax} onChange={e => setXMax(e.target.value)} required placeholder="e.g. Known" />
              </div>
            </div>
          </div>

          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '1.5rem', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '0.7rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 1rem 0' }}>Y axis</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={labelStyle}>Label</label>
                <input style={inputStyle} value={yLabel} onChange={e => setYLabel(e.target.value)} required placeholder="e.g. Impact" />
              </div>
              <div>
                <label style={labelStyle}>Bottom end</label>
                <input style={inputStyle} value={yMin} onChange={e => setYMin(e.target.value)} required placeholder="e.g. Low" />
              </div>
              <div>
                <label style={labelStyle}>Top end</label>
                <input style={inputStyle} value={yMax} onChange={e => setYMax(e.target.value)} required placeholder="e.g. High" />
              </div>
            </div>
          </div>

          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '1.5rem', marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '0.7rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 1rem 0' }}>Comment &amp; entry questions</h2>
            <div style={fieldStyle}>
              <label style={labelStyle}>Comment question</label>
              <input style={inputStyle} value={commentQuestion} onChange={e => setCommentQuestion(e.target.value)} required placeholder="e.g. What makes this distinct?" />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Entry name question (optional)</label>
              <input style={inputStyle} value={objectNameQuestion} onChange={e => setObjectNameQuestion(e.target.value)} placeholder="e.g. Name something that represents your perspective" />
            </div>
          </div>

          {ended && (
            <p style={{ fontSize: '0.75rem', color: 'var(--accent)', textAlign: 'right', marginBottom: '0.5rem' }}>
              This game has ended — nominations are read only.
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button type="button" onClick={handleDecline} disabled={declining || ended}
              style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.5rem 1.2rem', borderRadius: 999, border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-muted)', cursor: (declining || ended) ? (ended ? 'not-allowed' : 'wait') : 'pointer', opacity: (declining || ended) ? 0.6 : 1 }}>
              Decline
            </button>
            <button type="submit" disabled={submitting || ended}
              style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.5rem 1.4rem', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--text-primary)', cursor: (submitting || ended) ? (ended ? 'not-allowed' : 'wait') : 'pointer', opacity: (submitting || ended) ? 0.6 : 1 }}>
              {submitting ? 'Submitting…' : 'Submit frame'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
