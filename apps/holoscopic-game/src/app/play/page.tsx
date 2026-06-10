'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import type { Topic } from '@/services/topicService';
import type { FrameRef } from '@/services/frameRefService';
import UserMenu from '@/components/UserMenu';

// ─── Types ────────────────────────────────────────────────────────────────────

type ActiveView = 'topics' | 'frames' | 'patterns';

type NodeData = {
  label: string;
  nodeType: 'topic' | 'activity' | 'sequence' | 'frame' | 'pattern';
  meta: Record<string, any>;
  [key: string]: unknown;
};

// ─── Geometry ────────────────────────────────────────────────────────────────

function radialPos(i: number, total: number, radius: number) {
  const angle = total === 1 ? -Math.PI / 2 : (2 * Math.PI * i / total) - Math.PI / 2;
  return { x: Math.round(Math.cos(angle) * radius), y: Math.round(Math.sin(angle) * radius) };
}

// ─── Node components ─────────────────────────────────────────────────────────

function CenterNode({ data }: { data: NodeData }) {
  const glowColors: Record<string, string> = {
    topic: 'var(--accent)', frame: '#C0A45E', pattern: '#5E90C0',
  };
  const c = glowColors[data.nodeType] || 'var(--accent)';
  return (
    <div style={{
      width: 90, height: 90, borderRadius: '50%',
      background: 'var(--bg-elevated)',
      border: `2px solid ${c}`,
      boxShadow: `0 0 18px ${c}44, 0 0 40px ${c}1A`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0.5rem', cursor: 'pointer', textAlign: 'center',
    }}>
      <span style={{
        fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace',
        color: 'var(--text-primary)', lineHeight: 1.3,
        display: '-webkit-box', WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word',
      }}>{data.label}</span>
    </div>
  );
}

function RadialNode({ data }: { data: NodeData }) {
  const bg: Record<string, string> = {
    activity: 'rgba(200,59,80,0.12)', sequence: 'rgba(52,211,153,0.08)',
    frame: 'rgba(192,164,94,0.10)', topic: 'rgba(200,59,80,0.10)', pattern: 'rgba(94,144,192,0.10)',
  };
  const border: Record<string, string> = {
    activity: 'rgba(200,59,80,0.35)', sequence: 'rgba(52,211,153,0.30)',
    frame: 'rgba(192,164,94,0.32)', topic: 'rgba(200,59,80,0.30)', pattern: 'rgba(94,144,192,0.30)',
  };
  const caps: Record<string, string> = {
    activity: (data.meta?.activityType as string)?.toUpperCase().replace('HOLOSCOPIC','DISSOLVE').replace('FINDTHECENTER','RESOLVE') || 'MAP',
    sequence: 'PATTERN', frame: 'FRAME', topic: 'TOPIC', pattern: 'PATTERN',
  };
  return (
    <div style={{
      width: 130, background: bg[data.nodeType] || 'var(--bg-elevated)',
      border: `1px solid ${border[data.nodeType] || 'var(--border-default)'}`,
      borderRadius: 8, padding: '0.4rem 0.6rem', cursor: 'pointer',
    }}>
      <div style={{ fontSize: '0.48rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.12em', color: border[data.nodeType]?.replace('0.35)','0.75)').replace('0.30)','0.75)').replace('0.32)','0.75)') || 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.15rem' }}>
        {caps[data.nodeType]}
      </div>
      <div style={{ fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-primary)', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>
        {data.label}
      </div>
      {data.meta?.subtitle && (
        <div style={{ fontSize: '0.48rem', color: 'var(--text-muted)', marginTop: '0.15rem', fontFamily: 'var(--font-dm-mono), monospace' }}>
          {data.meta.subtitle as string}
        </div>
      )}
    </div>
  );
}

const NODE_TYPES = { center: CenterNode, radial: RadialNode };

// ─── Sort options ─────────────────────────────────────────────────────────────

const SORT_OPTIONS: Record<ActiveView, { label: string; value: string }[]> = {
  topics: [{ label: 'Most supported', value: 'supporters' }, { label: 'Newest', value: 'newest' }, { label: 'Expiring soon', value: 'expiring' }],
  frames: [{ label: 'Most used', value: 'used' }, { label: 'Newest', value: 'newest' }],
  patterns: [{ label: 'Most members', value: 'members' }, { label: 'Newest', value: 'newest' }],
};

// ─── Shared style helpers ─────────────────────────────────────────────────────

function btn(variant: 'fill' | 'outline'): React.CSSProperties {
  const base: React.CSSProperties = {
    fontSize: '0.58rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.08em',
    textTransform: 'uppercase', padding: '0.32rem 0.75rem', borderRadius: 999,
    cursor: 'pointer', display: 'inline-block', lineHeight: 1.5,
  };
  return variant === 'fill'
    ? { ...base, background: 'var(--accent)', border: 'none', color: 'var(--text-primary)' }
    : { ...base, background: 'transparent', border: '1px solid var(--border-strong)', color: 'var(--text-muted)' };
}

const inputCss: React.CSSProperties = {
  width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
  borderRadius: 6, padding: '0.42rem 0.6rem', fontSize: '0.75rem',
  color: 'var(--text-primary)', boxSizing: 'border-box', outline: 'none',
};
const labelCss: React.CSSProperties = {
  display: 'block', fontSize: '0.5rem', fontFamily: 'var(--font-dm-mono), monospace',
  letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem',
};

// ─── Popup card ───────────────────────────────────────────────────────────────

function PopupCard({ node, onClose, userId, onAction }: {
  node: Node<NodeData>;
  onClose: () => void;
  userId: string | null;
  onAction: () => void;
}) {
  const d = node.data;
  const meta = d.meta || {};

  async function act(path: string, method = 'POST') {
    if (!userId) return;
    try { await apiFetch(path, { method, userId }); onAction(); }
    catch (e: any) { alert(e.message); }
  }

  return (
    <div style={{
      position: 'absolute', top: '1.25rem', right: '1.25rem', width: 290, zIndex: 200,
      background: 'var(--bg-secondary)', border: '1px solid var(--border-strong)',
      borderRadius: 14, padding: '1.1rem 1.25rem',
      boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.65rem' }}>
        <div>
          <div style={{ fontSize: '0.48rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
            {d.nodeType}
          </div>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0, lineHeight: 1.3 }}>{d.label}</h3>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: 0, flexShrink: 0, marginLeft: '0.5rem' }}>×</button>
      </div>

      {/* Topic */}
      {d.nodeType === 'topic' && (
        <div style={{ marginBottom: '0.75rem' }}>
          {meta.description && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 0.5rem', lineHeight: 1.5 }}>{meta.description as string}</p>}
          <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)' }}>
            <span>{(meta.supporterCount as number) ?? 0} supporters</span>
            <span>◈ {(meta.holonPool as number) ?? 0} pool</span>
          </div>
        </div>
      )}

      {/* Activity */}
      {d.nodeType === 'activity' && (
        <div style={{ marginBottom: '0.75rem' }}>
          {meta.frameLabel && <p style={{ fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)', margin: '0 0 0.35rem' }}>{meta.frameLabel as string}</p>}
          {meta.question && <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 0.4rem', lineHeight: 1.5 }}>{meta.question as string}</p>}
          {meta.slots != null && (
            <span style={{ fontSize: '0.58rem', fontFamily: 'var(--font-dm-mono), monospace', color: (meta.slots as number) === 0 ? 'var(--accent)' : 'var(--accent-emerald)' }}>
              {(meta.slots as number) === 0 ? 'Full' : `${meta.slots} open`}
            </span>
          )}
        </div>
      )}

      {/* Frame */}
      {d.nodeType === 'frame' && (
        <div style={{ marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          {meta.xLabel && <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-secondary)' }}>x: {meta.xLabel as string}</div>}
          {meta.yLabel && <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-secondary)' }}>y: {meta.yLabel as string}</div>}
          {meta.usageCount != null && <div style={{ fontSize: '0.58rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)' }}>{meta.usageCount as number} activities</div>}
        </div>
      )}

      {/* Sequence / Pattern */}
      {(d.nodeType === 'sequence' || d.nodeType === 'pattern') && (
        <div style={{ marginBottom: '0.75rem' }}>
          {meta.description && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 0.4rem', lineHeight: 1.5 }}>{meta.description as string}</p>}
          <div style={{ display: 'flex', gap: '0.6rem', fontSize: '0.58rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)' }}>
            {meta.memberCount != null && <span>{meta.memberCount as number} members</span>}
            {meta.status && <span style={{ textTransform: 'uppercase', color: meta.status === 'active' ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>{meta.status as string}</span>}
          </div>
        </div>
      )}

      {/* CTAs */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {d.nodeType === 'topic' && userId && meta.status === 'nominated' && !meta.isNominator && (
          meta.isSupporter
            ? <button onClick={() => act(`/topics/${meta.topicId}/unsupport`)} style={btn('outline')}>Unsupport</button>
            : <button onClick={() => act(`/topics/${meta.topicId}/support`)} style={btn('fill')}>Support</button>
        )}
        {d.nodeType === 'topic' && userId && (
          <Link href={`/create/activity?topicId=${meta.topicId}`} style={{ ...btn('outline'), textDecoration: 'none' }}>Add activity</Link>
        )}
        {d.nodeType === 'activity' && meta.urlName && (
          <Link href={`/${meta.urlName as string}`} style={{ ...btn('fill'), textDecoration: 'none' }}>Join</Link>
        )}
        {d.nodeType === 'activity' && meta.slots === 0 && meta.topicId && (
          <Link href={`/create/activity?topicId=${meta.topicId}`} style={{ ...btn('outline'), textDecoration: 'none' }}>New map</Link>
        )}
        {d.nodeType === 'frame' && meta.frameId && (
          <Link href={`/create/activity?frameId=${meta.frameId as string}`} style={{ ...btn('fill'), textDecoration: 'none' }}>Start a map</Link>
        )}
        {(d.nodeType === 'sequence' || d.nodeType === 'pattern') && meta.urlName && (
          <Link href={`/sequence/${meta.urlName as string}`} style={{ ...btn('fill'), textDecoration: 'none' }}>Enter →</Link>
        )}
        {d.nodeType === 'pattern' && meta.id && (
          <Link href={`/patterns/${meta.id as string}`} style={{ ...btn('outline'), textDecoration: 'none' }}>Propose session</Link>
        )}
      </div>
    </div>
  );
}

// ─── Creation form ────────────────────────────────────────────────────────────

function CreationForm({ view, userId, onCreated, onClose }: {
  view: ActiveView; userId: string | null; onCreated: () => void; onClose: () => void;
}) {
  const router = useRouter();
  const [fields, setFields] = useState({ title: '', description: '', xLabel: '', xMin: '', xMax: '', yLabel: '', yMin: '', yMax: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (view === 'patterns') { router.push('/create/pattern'); onClose(); } }, [view]);

  if (view === 'patterns') return null;

  const set = (k: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFields(p => ({ ...p, [k]: e.target.value }));

  async function submit() {
    if (!userId) return;
    setSubmitting(true); setError(null);
    try {
      if (view === 'topics') {
        if (!fields.title.trim() || !fields.description.trim()) throw new Error('Title and description required');
        await apiFetch('/topics/nominate', { method: 'POST', userId, body: JSON.stringify({ title: fields.title.trim(), description: fields.description.trim() }) });
      } else {
        if (!fields.xLabel.trim() || !fields.yLabel.trim()) throw new Error('Both axis labels required');
        await apiFetch('/frame-refs', { method: 'POST', userId, body: JSON.stringify({ xLabel: fields.xLabel.trim(), xMin: fields.xMin.trim(), xMax: fields.xMax.trim(), yLabel: fields.yLabel.trim(), yMin: fields.yMin.trim(), yMax: fields.yMax.trim() }) });
      }
      onCreated(); onClose();
    } catch (e: any) { setError(e.message); setSubmitting(false); }
  }

  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '0.85rem 1rem', background: 'var(--bg-primary)', flexShrink: 0 }}>
      {view === 'topics' && (
        <>
          <label style={labelCss}>Title</label>
          <input value={fields.title} onChange={set('title')} placeholder="What should be explored?" style={{ ...inputCss, marginBottom: '0.5rem' }} />
          <label style={labelCss}>Description</label>
          <textarea value={fields.description} onChange={set('description')} placeholder="Why is this important?" rows={2}
            style={{ ...inputCss, resize: 'vertical' }} />
        </>
      )}
      {view === 'frames' && (
        <>
          <label style={labelCss}>X-axis label</label>
          <input value={fields.xLabel} onChange={set('xLabel')} placeholder="e.g. Individual ↔ Collective" style={{ ...inputCss, marginBottom: '0.35rem' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem', marginBottom: '0.5rem' }}>
            <input value={fields.xMin} onChange={set('xMin')} placeholder="← left" style={{ ...inputCss, fontSize: '0.68rem' }} />
            <input value={fields.xMax} onChange={set('xMax')} placeholder="right →" style={{ ...inputCss, fontSize: '0.68rem' }} />
          </div>
          <label style={labelCss}>Y-axis label</label>
          <input value={fields.yLabel} onChange={set('yLabel')} placeholder="e.g. Past ↔ Future" style={{ ...inputCss, marginBottom: '0.35rem' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
            <input value={fields.yMin} onChange={set('yMin')} placeholder="↓ bottom" style={{ ...inputCss, fontSize: '0.68rem' }} />
            <input value={fields.yMax} onChange={set('yMax')} placeholder="top ↑" style={{ ...inputCss, fontSize: '0.68rem' }} />
          </div>
        </>
      )}
      {error && <p style={{ fontSize: '0.68rem', color: 'var(--accent)', margin: '0.4rem 0 0' }}>{error}</p>}
      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.65rem', justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ ...btn('outline'), border: '1px solid var(--border-default)' }}>Cancel</button>
        <button onClick={submit} disabled={submitting} style={{ ...btn('fill'), opacity: submitting ? 0.7 : 1 }}>
          {submitting ? '…' : view === 'topics' ? 'Nominate' : 'Create'}
        </button>
      </div>
    </div>
  );
}

// ─── List item ────────────────────────────────────────────────────────────────

function ListItem({ item, view, isSelected, onClick }: {
  item: any; view: ActiveView; isSelected: boolean; onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer',
        background: hovered && !isSelected ? 'var(--bg-elevated)' : isSelected ? 'rgba(200,59,80,0.06)' : 'transparent',
        border: 'none', borderLeft: `2px solid ${isSelected ? 'var(--accent)' : 'transparent'}`,
        padding: '0.5rem 1rem 0.5rem 0.85rem', transition: 'background 0.1s, border-color 0.1s',
      }}>
      {view === 'topics' && (
        <>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.3, marginBottom: '0.18rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isSelected ? 600 : 400 }}>
            {item.title}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.55rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)' }}>
            <span>{item.supporterCount ?? 0} supporters</span>
            <span style={{ textTransform: 'uppercase', color: item.status === 'confirmed' ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>{item.status}</span>
          </div>
        </>
      )}
      {view === 'frames' && (
        <>
          <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-secondary)', marginBottom: '0.12rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.xLabel}
          </div>
          <div style={{ fontSize: '0.62rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.yLabel}
          </div>
        </>
      )}
      {view === 'patterns' && (
        <>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.3, marginBottom: '0.18rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isSelected ? 600 : 400 }}>
            {item.title}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.55rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)' }}>
            <span>{item.memberCount ?? (item.members?.length ?? 0)} members</span>
            <span style={{ textTransform: 'uppercase', color: item.status === 'active' ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>{item.status}</span>
          </div>
        </>
      )}
    </button>
  );
}

// ─── Inner page (needs ReactFlow context) ────────────────────────────────────

function PlayPageInner() {
  const router = useRouter();
  const { userId, holonBalance, isAuthenticated, refreshBalance } = useAuth();
  const { fitView } = useReactFlow();

  const [activeView, setActiveView] = useState<ActiveView>('topics');
  const [sortOrder, setSortOrder] = useState('supporters');
  const [items, setItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [popupNode, setPopupNode] = useState<Node<NodeData> | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Fetch list
  const fetchList = useCallback(async () => {
    setLoadingItems(true);
    setSelectedId(null);
    setNodes([]);
    setEdges([]);
    setPopupNode(null);
    try {
      if (activeView === 'topics') {
        const d = await apiFetch('/topics?status=nominated');
        setItems(d.topics ?? []);
      } else if (activeView === 'frames') {
        const d = await apiFetch('/frame-refs?limit=100');
        setItems(d.frames ?? []);
      } else {
        const d = await apiFetch('/sequences/public');
        setItems(d.sequences ?? []);
      }
    } catch { setItems([]); }
    finally { setLoadingItems(false); }
  }, [activeView, setNodes, setEdges]);

  useEffect(() => { fetchList(); }, [fetchList]);

  // Sort
  const sortedItems = [...items].sort((a, b) => {
    if (activeView === 'topics') {
      if (sortOrder === 'supporters') return (b.supporterCount ?? 0) - (a.supporterCount ?? 0);
      if (sortOrder === 'expiring') return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
      return new Date(b.nominatedAt ?? 0).getTime() - new Date(a.nominatedAt ?? 0).getTime();
    }
    if (activeView === 'patterns' && sortOrder === 'members') return (b.members?.length ?? 0) - (a.members?.length ?? 0);
    return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
  });

  // Build graph on selection
  useEffect(() => {
    if (!selectedId) return;
    const item = items.find(i => i.id === selectedId);
    if (!item) return;
    setLoadingGraph(true);
    setPopupNode(null);

    (async () => {
      try {
        let centerNode: Node<NodeData>;
        let radialNodes: Node<NodeData>[] = [];

        if (activeView === 'topics') {
          centerNode = {
            id: 'center', type: 'center', position: { x: -45, y: -45 },
            data: {
              label: item.title, nodeType: 'topic',
              meta: { topicId: item.id, description: item.description, supporterCount: item.supporterCount, holonPool: item.holonPool, status: item.status, isNominator: item.nominatedBy === userId, isSupporter: item.supporters?.some((s: any) => s.userId === userId) },
            },
          };
          const [actR, seqR] = await Promise.allSettled([
            apiFetch(`/activities?topicId=${selectedId}`).then(d => d.data?.activities ?? []),
            apiFetch(`/sequences/public?topicId=${selectedId}`).then(d => d.sequences ?? []),
          ]);
          const acts = actR.status === 'fulfilled' ? actR.value : [];
          const seqs = seqR.status === 'fulfilled' ? seqR.value : [];
          const total = acts.length + seqs.length;
          radialNodes = [
            ...acts.map((a: any, i: number) => {
              const { x, y } = radialPos(i, total || 1, 260);
              return { id: a.id, type: 'radial' as const, position: { x: x - 65, y: y - 25 }, data: { label: a.title, nodeType: 'activity' as const, meta: { urlName: a.urlName, activityType: a.activityType, question: a.mapQuestion, slots: a.maxEntries ? Math.max(0, a.maxEntries - (a.participants?.length ?? 0)) : null, topicId: item.id } } };
            }),
            ...seqs.map((s: any, i: number) => {
              const { x, y } = radialPos(acts.length + i, total || 1, 260);
              return { id: s.id, type: 'radial' as const, position: { x: x - 65, y: y - 25 }, data: { label: s.title, nodeType: 'sequence' as const, meta: { urlName: s.urlName, memberCount: s.members?.length ?? 0, status: s.status, description: s.description } } };
            }),
          ];

        } else if (activeView === 'frames') {
          centerNode = {
            id: 'center', type: 'center', position: { x: -45, y: -45 },
            data: { label: `${item.xLabel} / ${item.yLabel}`, nodeType: 'frame', meta: { frameId: item.id, xLabel: item.xLabel, yLabel: item.yLabel } },
          };
          const usage = await apiFetch(`/frame-refs/${selectedId}/usage`).catch(() => ({ activities: [], topics: [] }));
          const all = [...(usage.topics ?? []), ...(usage.activities ?? [])];
          centerNode.data.meta.usageCount = (usage.activities ?? []).length;
          radialNodes = all.map((n: any, i: number) => {
            const { x, y } = radialPos(i, all.length || 1, 260);
            const isAct = !!n.activityType;
            return { id: n.id, type: 'radial' as const, position: { x: x - 65, y: y - 25 }, data: { label: n.title, nodeType: (isAct ? 'activity' : 'topic') as NodeData['nodeType'], meta: isAct ? { urlName: n.urlName, activityType: n.activityType } : { topicId: n.id, status: n.status } } };
          });

        } else {
          centerNode = {
            id: 'center', type: 'center', position: { x: -45, y: -45 },
            data: { label: item.title, nodeType: 'pattern', meta: { urlName: item.urlName, id: item.id, memberCount: item.members?.length ?? 0, status: item.status, description: item.description } },
          };
          const seqData = await apiFetch(`/sequences/${selectedId}`).catch(() => null);
          const seqActs = seqData?.sequence?.activities ?? seqData?.activities ?? [];
          radialNodes = seqActs.map((sa: any, i: number) => {
            const { x, y } = radialPos(i, seqActs.length || 1, 260);
            return { id: sa.activityId || `act-${i}`, type: 'radial' as const, position: { x: x - 65, y: y - 25 }, data: { label: sa.activity?.title ?? sa.activityId, nodeType: 'activity' as const, meta: { urlName: sa.activity?.urlName, activityType: sa.activity?.activityType } } };
          });
        }

        const newEdges: Edge[] = radialNodes.map(n => ({
          id: `e-${n.id}`, source: 'center', target: n.id,
          style: { stroke: 'rgba(215,205,195,0.14)', strokeWidth: 1 },
          animated: false,
        }));

        setNodes([centerNode, ...radialNodes]);
        setEdges(newEdges);
        setTimeout(() => fitView({ padding: 0.18, duration: 450 }), 80);
      } finally { setLoadingGraph(false); }
    })();
  }, [selectedId, activeView, items, userId, setNodes, setEdges, fitView]);

  const handleNodeClick = useCallback((_: any, node: Node) => {
    setPopupNode(node as Node<NodeData>);
  }, []);

  const switchView = (v: ActiveView) => {
    setActiveView(v);
    setSortOrder(SORT_OPTIONS[v][0].value);
    setShowCreate(false);
    setPopupNode(null);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-primary)' }}>

      {/* SIDEBAR */}
      <aside style={{ width: 272, flexShrink: 0, borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Logo + user */}
        <div style={{ height: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1rem', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <Link href="/" style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none' }}>
            Holo<span style={{ color: 'var(--accent)' }}>scopic</span>
          </Link>
          <UserMenu />
        </div>

        {/* View tabs */}
        <div style={{ padding: '0.7rem 0.85rem 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 7, padding: '2px' }}>
            {(['topics', 'frames', 'patterns'] as ActiveView[]).map(v => (
              <button key={v} onClick={() => switchView(v)} style={{
                flex: 1, padding: '0.3rem 0',
                fontSize: '0.52rem', fontFamily: 'var(--font-dm-mono), monospace',
                letterSpacing: '0.07em', textTransform: 'uppercase', border: 'none', borderRadius: 5, cursor: 'pointer',
                background: activeView === v ? 'var(--bg-elevated)' : 'transparent',
                color: activeView === v ? 'var(--text-primary)' : 'var(--text-muted)',
                transition: 'all 0.12s',
              }}>{v}</button>
            ))}
          </div>

          {/* Sort */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '0.48rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>Sort</span>
            <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.58rem', fontFamily: 'var(--font-dm-mono), monospace', cursor: 'pointer', outline: 'none' }}>
              {SORT_OPTIONS[activeView].map(o => (
                <option key={o.value} value={o.value} style={{ background: 'var(--bg-secondary)' }}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* List header + add */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.45rem 1rem 0.25rem 1rem', flexShrink: 0 }}>
          <span style={{ fontSize: '0.48rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            {loadingItems ? '…' : `${sortedItems.length} ${activeView}`}
          </span>
          {isAuthenticated && (
            <button onClick={() => setShowCreate(v => !v)} title={`Add ${activeView.slice(0, -1)}`} style={{
              width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, fontSize: '0.75rem', lineHeight: 1, transition: 'all 0.12s',
              border: `1px solid ${showCreate ? 'var(--accent)' : 'var(--border-default)'}`,
              background: showCreate ? 'var(--accent)' : 'transparent',
              color: showCreate ? 'var(--text-primary)' : 'var(--text-muted)',
            }}>{showCreate ? '−' : '+'}</button>
          )}
        </div>

        {/* Creation form */}
        {showCreate && isAuthenticated && (
          <CreationForm view={activeView} userId={userId} onCreated={fetchList} onClose={() => setShowCreate(false)} />
        )}

        {/* Items */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingItems && (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)' }}>loading…</div>
          )}
          {!loadingItems && sortedItems.length === 0 && (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-muted)' }}>No {activeView} yet</div>
          )}
          {sortedItems.map(item => (
            <ListItem key={item.id} item={item} view={activeView} isSelected={selectedId === item.id} onClick={() => { setSelectedId(item.id); setShowCreate(false); }} />
          ))}
        </div>

        {/* Holon balance */}
        {isAuthenticated && (
          <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '0.55rem 1rem', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: '0.5rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Balance</span>
            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--accent)', fontWeight: 600, marginLeft: 'auto' }}>◈ {holonBalance ?? 0}</span>
          </div>
        )}
      </aside>

      {/* GRAPH CANVAS */}
      <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Empty state */}
        {nodes.length === 0 && !loadingGraph && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', pointerEvents: 'none', gap: '0.7rem' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', border: '1px solid rgba(215,205,195,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '1rem', opacity: 0.35 }}>◎</span>
            </div>
            <p style={{ fontSize: '0.72rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.06em', margin: 0, opacity: 0.5 }}>
              Select a {activeView.slice(0, -1)} to explore its connections
            </p>
          </div>
        )}

        {/* Loading overlay */}
        {loadingGraph && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)', letterSpacing: '0.1em' }}>mapping…</span>
          </div>
        )}

        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          nodeTypes={NODE_TYPES}
          fitView panOnScroll zoomOnScroll
          minZoom={0.25} maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
          style={{ background: 'var(--bg-primary)', width: '100%', height: '100%' }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="rgba(215,205,195,0.07)" />
        </ReactFlow>

        {/* Popup */}
        {popupNode && (
          <PopupCard
            node={popupNode}
            onClose={() => setPopupNode(null)}
            userId={userId}
            onAction={() => { refreshBalance(); fetchList(); setPopupNode(null); }}
          />
        )}
      </main>
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function PlayPage() {
  return (
    <ReactFlowProvider>
      <PlayPageInner />
    </ReactFlowProvider>
  );
}
