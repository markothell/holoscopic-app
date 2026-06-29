'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useInstance } from '@/contexts/InstanceContext';
import { PatternService, Pattern } from '@/services/patternService';
import { SequenceService } from '@/services/sequenceService';
import { ActivityService } from '@/services/activityService';
import { UrlUtils } from '@hs/activities';
import UserMenu from '@/components/UserMenu';
import PatternBuilderGraph, { type PatternBuilderGraphHandle } from '@/components/graph/PatternBuilderGraph';
import type { BuilderNodeData } from '@/components/graph/PatternBuilderNode';

// ─── Fork Form ────────────────────────────────────────────────────────────────

function ForkForm({ forkFromId }: { forkFromId: string }) {
  const router = useRouter();
  const { userId, holonBalance, refreshBalance } = useAuth();
  const { config: instanceConfig } = useInstance();
  const [parent, setParent] = useState<Pattern | null>(null);
  const [parentSequenceTitle, setParentSequenceTitle] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [thesis, setThesis] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    PatternService.get(forkFromId).then(async alg => {
      setParent(alg);
      setTitle(alg.title);
      setThesis(alg.thesis);
      if (alg.sequenceId) {
        try {
          const seq = await SequenceService.getSequence(alg.sequenceId);
          setParentSequenceTitle(seq.title || null);
        } catch { /* best-effort */ }
      }
    }).catch(() => {});
  }, [forkFromId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setSubmitting(true);
    setError(null);
    try {
      const { algorithm: alg, newSequenceUrlName } = await PatternService.fork(userId, forkFromId, { title, thesis, description: description || undefined });
      refreshBalance();
      router.push(`/patterns/${alg.id}${newSequenceUrlName ? '?sequenceCloned=1' : ''}`);
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
    }
  }

  const field: React.CSSProperties = { width: '100%', padding: '0.6rem 0.8rem', borderRadius: 8, fontSize: '0.88rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', resize: 'vertical' };
  const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.4rem' };
  const lt: React.CSSProperties = { fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {parent && (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <span>Forking from <strong style={{ color: 'var(--text-primary)' }}>{parent.title}</strong> by {parent.authorName}. Royalties will flow to the original author.</span>
          {parentSequenceTitle && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              The session sequence <strong style={{ color: 'var(--text-secondary)' }}>{parentSequenceTitle}</strong> will be copied as a draft template you can edit before going live.
            </span>
          )}
        </div>
      )}
      <label style={lbl}><span style={lt}>Title</span>
        <input type="text" required value={title} onChange={e => setTitle(e.target.value)}
          placeholder="Name your pattern" style={{ ...field, resize: undefined }} />
      </label>
      <label style={lbl}><span style={lt}>Thesis</span>
        <textarea required rows={3} value={thesis} onChange={e => setThesis(e.target.value)}
          placeholder="The central claim or insight this conversation pattern is built around"
          style={field} />
      </label>
      <label style={lbl}><span style={lt}>Description (optional)</span>
        <textarea rows={4} value={description} onChange={e => setDescription(e.target.value)}
          placeholder="How does it work? When should it be used?"
          style={field} />
      </label>
      {error && <p style={{ fontSize: '0.8rem', color: 'var(--accent)', margin: 0 }}>{error}</p>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.5rem' }}>
        <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)' }}>
          Balance: {holonBalance ?? '—'} H · Costs {instanceConfig?.holons?.algorithmPublishCost ?? '…'} H
        </span>
        <button type="submit" disabled={submitting}
          style={{ fontSize: '0.7rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0.6rem 1.5rem', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--text-primary)', cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
          {submitting ? 'Publishing…' : 'Publish Fork'}
        </button>
      </div>
    </form>
  );
}

// ─── Pattern Builder ──────────────────────────────────────────────────────────

function PatternBuilder() {
  const router = useRouter();
  const { userId, holonBalance, refreshBalance } = useAuth();
  const { config: instanceConfig } = useInstance();

  const [title, setTitle] = useState('');
  const [thesis, setThesis] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState('');

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeData, setSelectedNodeData] = useState<BuilderNodeData | null>(null);

  const graphRef = useRef<PatternBuilderGraphHandle | null>(null);

  const handleNodeSelect = useCallback((id: string | null, data: BuilderNodeData | null) => {
    setSelectedNodeId(id);
    setSelectedNodeData(data);
  }, []);

  const updateSelectedField = useCallback((field: keyof BuilderNodeData, value: string) => {
    if (!selectedNodeId) return;
    graphRef.current?.updateNode(selectedNodeId, { [field]: value });
    setSelectedNodeData(prev => prev ? { ...prev, [field]: value } : prev);
  }, [selectedNodeId]);

  async function handleSave(publish: boolean) {
    if (!userId) { router.push('/login'); return; }
    if (!title.trim()) { setError('Pattern title is required.'); return; }
    if (!thesis.trim()) { setError('Thesis is required.'); return; }

    const state = graphRef.current?.getState();
    const graphNodes = state?.nodes ?? [];
    const graphEdges = state?.edges ?? [];

    setSaving(true);
    setError(null);

    try {
      let sequenceId: string | undefined;

      if (graphNodes.length > 0) {
        // 1. Create draft activities for each node
        setSaveStatus('Creating activities…');
        const existingActivities = await ActivityService.getActivities();
        const takenUrls = existingActivities.map((a: any) => a.urlName);

        // Generate all URLs up-front (sequential) to avoid name collisions within the batch
        const nodePayloads = graphNodes.map((node, i) => {
          const nodeTitle = node.title.trim() || `Step ${i + 1}`;
          const urlName = UrlUtils.generateUniqueActivityName(nodeTitle, takenUrls);
          takenUrls.push(urlName);
          return { node, nodeTitle, urlName };
        });

        // Then create activities in parallel
        const created = await Promise.all(nodePayloads.map(async ({ node, nodeTitle, urlName }) => {
          const activity = await ActivityService.createActivity({
            title: nodeTitle,
            urlName,
            activityType: node.activityType as any,
            mapQuestion: node.mapQuestion?.trim() || 'Edit this activity to add your mapping question.',
            mapQuestion2: '',
            objectNameQuestion: 'Name something that represents your perspective',
            xAxisLabel: '←→',
            xAxisMin: 'Less',
            xAxisMax: 'More',
            yAxisLabel: '↑↓',
            yAxisMin: 'Less',
            yAxisMax: 'More',
            commentQuestion: node.commentQuestion?.trim() || "What's your perspective?",
            preamble: node.preamble?.trim() || '',
            wikiLink: '',
            starterData: '',
            votesPerUser: null,
            maxEntries: 1,
            showProfileLinks: true,
            showAxisLabels: true,
          } as any);

          return { tempId: node.id, activityId: activity.id };
        }));

        // 2. Build activity map and compute parentActivityIds from edges
        const tempToReal: Record<string, string> = {};
        created.forEach(({ tempId, activityId }) => { tempToReal[tempId] = activityId; });

        const activities = graphNodes.map((node, i) => {
          const parentActivityIds = graphEdges
            .filter(e => e.target === node.id)
            .map(e => tempToReal[e.source])
            .filter(Boolean);

          return {
            activityId: tempToReal[node.id],
            order: i,
            autoClose: false,
            duration: null,
            parentActivityIds,
          };
        });

        // 3. Create sequence (add short random suffix to avoid url conflicts)
        setSaveStatus('Creating sequence…');
        const seqUrlBase = UrlUtils.generateUniqueActivityName(title.trim(), []);
        const seqUrl = `${seqUrlBase}-${Math.random().toString(36).slice(2, 6)}`;
        const seq = await SequenceService.createSequence({
          title: title.trim(),
          urlName: seqUrl,
          description: description.trim() || undefined,
          createdBy: userId,
          activities,
        });
        sequenceId = seq.id;
      }

      // 4. Create / publish pattern
      setSaveStatus(publish ? 'Publishing…' : 'Saving…');
      const pattern = await PatternService.publish(userId, {
        title: title.trim(),
        thesis: thesis.trim(),
        description: description.trim() || undefined,
        sequenceId,
      });

      refreshBalance();
      router.push(`/patterns/${pattern.id}`);
    } catch (e: any) {
      setError(e.message || 'Something went wrong.');
      setSaving(false);
      setSaveStatus('');
    }
  }

  const fieldStyle: React.CSSProperties = { width: '100%', padding: '0.55rem 0.75rem', borderRadius: 7, fontSize: '0.85rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' };
  const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.35rem' };
  const lt: React.CSSProperties = { fontSize: '0.58rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--text-muted)' };

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{
        width: 280, flexShrink: 0,
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex', flexDirection: 'column',
        padding: '1.5rem 1.25rem',
        gap: '1rem', overflowY: 'auto',
      }}>

        {selectedNodeId && selectedNodeData ? (
          /* ── Step detail panel ── */
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <button onClick={() => handleNodeSelect(null, null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', cursor: 'pointer', padding: 0, textTransform: 'uppercase' }}>
                ← Pattern
              </button>
            </div>
            <h2 style={{ fontSize: '0.7rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0 }}>
              Step Details
            </h2>

            <label style={lbl}>
              <span style={lt}>Step Title</span>
              <input type="text" value={selectedNodeData.title}
                onChange={e => updateSelectedField('title', e.target.value)}
                placeholder="Name this step"
                style={{ ...fieldStyle, resize: undefined }} />
            </label>

            <label style={lbl}>
              <span style={lt}>Map Question</span>
              <textarea rows={3} value={selectedNodeData.mapQuestion || ''}
                onChange={e => updateSelectedField('mapQuestion', e.target.value)}
                placeholder="Where do you place yourself on this map?"
                style={fieldStyle} />
            </label>

            <label style={lbl}>
              <span style={lt}>Comment Question</span>
              <textarea rows={2} value={selectedNodeData.commentQuestion || ''}
                onChange={e => updateSelectedField('commentQuestion', e.target.value)}
                placeholder="What's your perspective?"
                style={fieldStyle} />
            </label>

            <label style={lbl}>
              <span style={lt}>Preamble (optional)</span>
              <textarea rows={3} value={selectedNodeData.preamble || ''}
                onChange={e => updateSelectedField('preamble', e.target.value)}
                placeholder="Context or instructions shown before participants map themselves"
                style={fieldStyle} />
            </label>

            <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
              Save the pattern first to get a link to the full activity editor.
            </p>
          </>
        ) : (
          /* ── Pattern detail panel ── */
          <>
            <h2 style={{ fontSize: '0.7rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0 }}>
              Pattern Details
            </h2>

            <label style={lbl}>
              <span style={lt}>Title <span style={{ color: 'var(--accent)' }}>*</span></span>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                placeholder="Name your pattern"
                style={{ ...fieldStyle, resize: undefined }} />
            </label>

            <label style={lbl}>
              <span style={lt}>Thesis <span style={{ color: 'var(--accent)' }}>*</span></span>
              <textarea rows={4} value={thesis} onChange={e => setThesis(e.target.value)}
                placeholder="The central claim or insight this conversation pattern is built around"
                style={fieldStyle} />
            </label>

            <label style={lbl}>
              <span style={lt}>Description</span>
              <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)}
                placeholder="When should it be used? What does it require?"
                style={fieldStyle} />
            </label>

            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {error && <p style={{ fontSize: '0.75rem', color: 'var(--accent)', margin: 0 }}>{error}</p>}
              {saving && saveStatus && <p style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)', margin: 0 }}>{saveStatus}</p>}
              <div style={{ fontSize: '0.62rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Balance: {holonBalance ?? '—'} H<br />
                Costs {instanceConfig?.holons?.algorithmPublishCost ?? '…'} H to publish
              </div>
              <button onClick={() => handleSave(true)} disabled={saving}
                style={{ fontSize: '0.68rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0.6rem 0', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--text-primary)', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1, width: '100%' }}>
                {saving ? 'Working…' : 'Publish Pattern'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Graph canvas */}
      <div style={{ flex: 1, background: '#F7F4EF', position: 'relative', minWidth: 0 }}>
        <PatternBuilderGraph ref={graphRef} onNodeSelect={handleNodeSelect} />
      </div>
    </div>
  );
}

// ─── Page Shell ───────────────────────────────────────────────────────────────

function CreatePatternContent() {
  const searchParams = useSearchParams();
  const forkFromId = searchParams.get('forkFrom') || undefined;
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading…</p>
    </div>
  );

  if (!isAuthenticated) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        <Link href="/login" style={{ color: 'var(--accent)' }}>Sign in</Link> to create a pattern.
      </p>
    </div>
  );

  if (forkFromId) {
    return (
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1.5rem' }}>
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.4rem 0' }}>Fork Pattern</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
            Adjust the title and thesis for your fork. The session sequence will be copied as a draft.
          </p>
        </div>
        <ForkForm forkFromId={forkFromId} />
      </main>
    );
  }

  return <PatternBuilder />;
}

export default function CreatePatternPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}>
      <header style={{ borderBottom: '1px solid var(--border-subtle)', padding: '0 1.5rem', flexShrink: 0 }}>
        <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <Link href="/" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none' }}>
              Holo<span style={{ color: 'var(--accent)' }}>scopic</span>
            </Link>
            <Link href="/patterns" style={{ fontSize: '0.68rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', color: 'var(--text-muted)', textDecoration: 'none', textTransform: 'uppercase' }}>
              ← Patterns
            </Link>
          </div>
          <UserMenu />
        </div>
      </header>

      <Suspense fallback={
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading…</p>
        </div>
      }>
        <CreatePatternContent />
      </Suspense>
    </div>
  );
}
