'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useAuth } from '@/contexts/AuthContext';
import { useInstance } from '@/contexts/InstanceContext';
import { apiFetch } from '@/lib/api';
import { TopicService, type Topic } from '@/services/topicService';
import { FrameRefService, type FrameRef } from '@/services/frameRefService';
import { SequenceService } from '@/services/sequenceService';
import UserMenu from '@/components/UserMenu';

// ─── Types ────────────────────────────────────────────────────────────────────

type ActiveView = 'topics' | 'frames' | 'patterns';
type GraphMode = 'browse' | 'drill';

type NodeData = {
  label: string;
  nodeType: 'hub' | 'topic' | 'activity' | 'sequence' | 'frame' | 'pattern';
  meta: Record<string, any>;
  [key: string]: unknown;
};

// ─── Geometry ────────────────────────────────────────────────────────────────

function radialPos(i: number, total: number, radius: number) {
  const angle = total === 1 ? -Math.PI / 2 : (2 * Math.PI * i / total) - Math.PI / 2;
  return { x: Math.round(Math.cos(angle) * radius), y: Math.round(Math.sin(angle) * radius) };
}

// ─── Node components ─────────────────────────────────────────────────────────

function HubNode({ data }: { data: NodeData }) {
  return (
    <div style={{
      width: 100, height: 100, borderRadius: '50%',
      background: 'var(--bg-elevated)',
      border: '2px solid var(--accent)',
      boxShadow: '0 0 18px rgba(200,59,80,0.25), 0 0 40px rgba(200,59,80,0.10)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'default', textAlign: 'center', padding: '0.5rem',
    }}>
      <span style={{
        fontSize: '0.68rem', fontFamily: 'var(--font-dm-mono), monospace',
        letterSpacing: '0.1em', textTransform: 'uppercase' as const,
        color: 'var(--accent)', lineHeight: 1.3,
        display: '-webkit-box', WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical' as const, overflow: 'hidden', wordBreak: 'break-word' as const,
      }}>{data.label}</span>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

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
        WebkitBoxOrient: 'vertical' as const, overflow: 'hidden', wordBreak: 'break-word' as const,
      }}>{data.label}</span>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
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
      <div style={{ fontSize: '0.48rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.12em', color: border[data.nodeType]?.replace('0.35)','0.75)').replace('0.30)','0.75)').replace('0.32)','0.75)') || 'var(--text-muted)', textTransform: 'uppercase' as const, marginBottom: '0.15rem' }}>
        {caps[data.nodeType]}
      </div>
      <div style={{ fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-primary)', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden', wordBreak: 'break-word' as const }}>
        {data.label}
      </div>
      {data.meta?.subtitle && (
        <div style={{ fontSize: '0.48rem', color: 'var(--text-muted)', marginTop: '0.15rem', fontFamily: 'var(--font-dm-mono), monospace' }}>
          {data.meta.subtitle as string}
        </div>
      )}
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
    </div>
  );
}

const NODE_TYPES = { hub: HubNode, center: CenterNode, radial: RadialNode };

// ─── Sort options ─────────────────────────────────────────────────────────────

const SORT_OPTIONS: Record<ActiveView, { label: string; value: string }[]> = {
  topics: [{ label: 'Most supported', value: 'supporters' }, { label: 'Newest', value: 'newest' }, { label: 'Expiring soon', value: 'expiring' }],
  frames: [{ label: 'Most used', value: 'used' }, { label: 'Newest', value: 'newest' }],
  patterns: [{ label: 'Most members', value: 'members' }, { label: 'Newest', value: 'newest' }],
};

// ─── Style helpers ────────────────────────────────────────────────────────────

function btn(variant: 'fill' | 'outline'): React.CSSProperties {
  const base: React.CSSProperties = {
    fontSize: '0.58rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.08em',
    textTransform: 'uppercase' as const, padding: '0.32rem 0.75rem', borderRadius: 999,
    cursor: 'pointer', display: 'inline-block', lineHeight: 1.5,
  };
  return variant === 'fill'
    ? { ...base, background: 'var(--accent)', border: 'none', color: 'var(--text-primary)' }
    : { ...base, background: 'transparent', border: '1px solid var(--border-strong)', color: 'var(--text-muted)' };
}

const inputCss: React.CSSProperties = {
  width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
  borderRadius: 6, padding: '0.42rem 0.6rem', fontSize: '0.75rem',
  color: 'var(--text-primary)', boxSizing: 'border-box' as const, outline: 'none',
};
const labelCss: React.CSSProperties = {
  display: 'block', fontSize: '0.5rem', fontFamily: 'var(--font-dm-mono), monospace',
  letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--text-muted)', marginBottom: '0.25rem',
};

// ─── Popup card ───────────────────────────────────────────────────────────────

function PopupCard({ node, onClose, userId, onAction, holonBalance, holonsConfig }: {
  node: Node<NodeData>;
  onClose: () => void;
  userId: string | null;
  onAction: () => void;
  holonBalance: number | null;
  holonsConfig: { supportCost: number; activityStakeAmount: number } | null;
}) {
  const d = node.data;
  const meta = d.meta || {};
  const bal = holonBalance ?? 0;
  const canAffordSupport = holonsConfig ? bal >= holonsConfig.supportCost : true;
  const canAffordStake   = holonsConfig ? bal >= holonsConfig.activityStakeAmount : true;

  async function act(fn: () => Promise<unknown>) {
    if (!userId) return;
    try { await fn(); onAction(); }
    catch (e: any) { alert((e as Error).message); }
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
          <div style={{ fontSize: '0.48rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
            {d.nodeType}
          </div>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0, lineHeight: 1.3 }}>{d.label}</h3>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: 0, flexShrink: 0, marginLeft: '0.5rem' }}>×</button>
      </div>

      {d.nodeType === 'topic' && (
        <div style={{ marginBottom: '0.75rem' }}>
          {meta.description && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 0.5rem', lineHeight: 1.5 }}>{meta.description as string}</p>}
          <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)' }}>
            <span>{(meta.supporterCount as number) ?? 0} supporters</span>
            <span>◈ {(meta.holonPool as number) ?? 0} pool</span>
          </div>
        </div>
      )}

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

      {d.nodeType === 'frame' && (
        <div style={{ marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          {meta.xLabel && <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-secondary)' }}>x: {meta.xLabel as string}</div>}
          {meta.yLabel && <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-secondary)' }}>y: {meta.yLabel as string}</div>}
          {meta.usageCount != null && <div style={{ fontSize: '0.58rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)' }}>{meta.usageCount as number} activities</div>}
        </div>
      )}

      {(d.nodeType === 'sequence' || d.nodeType === 'pattern') && (
        <div style={{ marginBottom: '0.75rem' }}>
          {meta.description && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 0.4rem', lineHeight: 1.5 }}>{meta.description as string}</p>}
          <div style={{ display: 'flex', gap: '0.6rem', fontSize: '0.58rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)' }}>
            {meta.memberCount != null && <span>{meta.memberCount as number} members</span>}
            {meta.status && <span style={{ textTransform: 'uppercase' as const, color: meta.status === 'active' ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>{meta.status as string}</span>}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' as const }}>
        {d.nodeType === 'topic' && userId && meta.status === 'nominated' && !meta.isNominator && (
          meta.isSupporter
            ? <button onClick={() => act(() => TopicService.unsupport(userId!, meta.topicId))} style={btn('outline')}>Unsupport</button>
            : canAffordSupport
              ? <button onClick={() => act(() => TopicService.support(userId!, meta.topicId))} style={btn('fill')}>Support</button>
              : <span style={{ ...btn('outline'), opacity: 0.45, cursor: 'not-allowed' }} title={`Need ${holonsConfig?.supportCost ?? '?'} ◈`}>Support</span>
        )}
        {d.nodeType === 'topic' && userId && meta.status === 'confirmed' && (
          canAffordStake
            ? <Link href={`/create/activity?topicId=${meta.topicId}`} style={{ ...btn('outline'), textDecoration: 'none' }}>Add activity</Link>
            : <span style={{ ...btn('outline'), opacity: 0.45, cursor: 'not-allowed' }} title={`Need ${holonsConfig?.activityStakeAmount ?? '?'} ◈`}>Add activity</span>
        )}
        {d.nodeType === 'activity' && meta.urlName && (
          <Link href={`/${meta.urlName as string}`} style={{ ...btn('fill'), textDecoration: 'none' }}>Join</Link>
        )}
        {d.nodeType === 'activity' && meta.slots === 0 && meta.topicId && (
          <Link href={`/create/activity?topicId=${meta.topicId}`} style={{ ...btn('outline'), textDecoration: 'none' }}>New map</Link>
        )}
        {d.nodeType === 'frame' && meta.frameId && (
          canAffordStake
            ? <Link href={`/create/activity?frameId=${meta.frameId as string}`} style={{ ...btn('fill'), textDecoration: 'none' }}>Start a map</Link>
            : <span style={{ ...btn('fill'), opacity: 0.45, cursor: 'not-allowed' }} title={`Need ${holonsConfig?.activityStakeAmount ?? '?'} ◈`}>Start a map</span>
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
  const [fields, setFields] = useState({ title: '', description: '', xLabel: '', xMin: '', xMax: '', yLabel: '', yMin: '', yMax: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (view === 'patterns') {
    return (
      <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '0.85rem 1rem', background: 'var(--bg-primary)', flexShrink: 0 }}>
        <Link href="/create/pattern" onClick={onClose} style={{ ...btn('fill'), textDecoration: 'none', display: 'block', textAlign: 'center' }}>
          Create Pattern
        </Link>
      </div>
    );
  }

  const set = (k: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFields(p => ({ ...p, [k]: e.target.value }));

  async function submit() {
    if (!userId) return;
    setSubmitting(true); setError(null);
    try {
      if (view === 'topics') {
        if (!fields.title.trim() || !fields.description.trim()) throw new Error('Title and description required');
        await TopicService.nominate(userId, { title: fields.title.trim(), description: fields.description.trim() });
      } else {
        if (!fields.xLabel.trim() || !fields.yLabel.trim()) throw new Error('Both axis labels required');
        await FrameRefService.create(userId, { xLabel: fields.xLabel.trim(), xMin: fields.xMin.trim(), xMax: fields.xMax.trim(), yLabel: fields.yLabel.trim(), yMin: fields.yMin.trim(), yMax: fields.yMax.trim() });
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
            style={{ ...inputCss, resize: 'vertical' as const }} />
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
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.3, marginBottom: '0.18rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, fontWeight: isSelected ? 600 : 400 }}>
            {item.title}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.55rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)' }}>
            <span>{item.supporterCount ?? 0} supporters</span>
            <span style={{ textTransform: 'uppercase' as const, color: item.status === 'confirmed' ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>{item.status}</span>
          </div>
        </>
      )}
      {view === 'frames' && (
        <>
          <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-secondary)', marginBottom: '0.12rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
            {item.xLabel}
          </div>
          <div style={{ fontSize: '0.62rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
            {item.yLabel}
          </div>
        </>
      )}
      {view === 'patterns' && (
        <>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.3, marginBottom: '0.18rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, fontWeight: isSelected ? 600 : 400 }}>
            {item.title}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.55rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)' }}>
            <span>{item.memberCount ?? (item.members?.length ?? 0)} members</span>
            <span style={{ textTransform: 'uppercase' as const, color: item.status === 'active' ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>{item.status}</span>
          </div>
        </>
      )}
    </button>
  );
}

// ─── Inner page (needs ReactFlow context) ────────────────────────────────────

const BROWSE_MAX = 20;

function InterViewPageInner() {
  const { userId, holonBalance, isAuthenticated, refreshBalance } = useAuth();
  const { instance } = useInstance();
  const { fitView } = useReactFlow();

  const [activeView, setActiveView] = useState<ActiveView>('topics');
  const [sortOrder, setSortOrder] = useState('supporters');
  const [items, setItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [graphMode, setGraphMode] = useState<GraphMode>('browse');
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [popupNode, setPopupNode] = useState<Node<NodeData> | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Responsive detection
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
      else setSidebarOpen(true);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Fetch list
  const fetchList = useCallback(async () => {
    setLoadingItems(true);
    setSelectedId(null);
    setGraphMode('browse');
    setNodes([]);
    setEdges([]);
    setPopupNode(null);
    try {
      if (activeView === 'topics') {
        const topics = await TopicService.list('nominated');
        setItems(topics);
      } else if (activeView === 'frames') {
        const { frames } = await FrameRefService.list(undefined, 100);
        setItems(frames);
      } else {
        const sequences = await SequenceService.getPublicSequences();
        setItems(sequences);
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

  // ── Browse graph (all items radial) ───────────────────────────────────────
  useEffect(() => {
    if (loadingItems || graphMode !== 'browse') return;
    const visible = sortedItems.slice(0, BROWSE_MAX);
    if (visible.length === 0) {
      setNodes([]); setEdges([]);
      return;
    }

    const hubLabels: Record<ActiveView, string> = { topics: 'Topics', frames: 'Frames', patterns: 'Patterns' };
    const hubNode: Node<NodeData> = {
      id: 'hub', type: 'hub', position: { x: -50, y: -50 },
      data: { label: hubLabels[activeView], nodeType: 'hub', meta: { isDrill: false } },
    };

    const radialNodes: Node<NodeData>[] = visible.map((item, i) => {
      const { x, y } = radialPos(i, visible.length, 280);
      let label = '';
      let nodeType: NodeData['nodeType'] = 'topic';
      let meta: Record<string, any> = {};

      if (activeView === 'topics') {
        label = item.title;
        nodeType = 'topic';
        meta = { topicId: item.id, description: item.description, supporterCount: item.supporterCount, holonPool: item.holonPool, status: item.status, isNominator: item.nominatedBy === userId, isSupporter: item.supporters?.some((s: any) => s.userId === userId) };
      } else if (activeView === 'frames') {
        label = `${item.xLabel} / ${item.yLabel}`;
        nodeType = 'frame';
        meta = { frameId: item.id, xLabel: item.xLabel, yLabel: item.yLabel };
      } else {
        label = item.title;
        nodeType = 'pattern';
        meta = { urlName: item.urlName, id: item.id, memberCount: item.members?.length ?? 0, status: item.status, description: item.description };
      }

      return {
        id: item.id, type: 'radial' as const,
        position: { x: x - 65, y: y - 25 },
        data: { label, nodeType, meta },
      };
    });

    const browseEdges: Edge[] = radialNodes.map(n => ({
      id: `e-${n.id}`, source: 'hub', target: n.id,
      style: { stroke: 'rgba(215,205,195,0.28)', strokeWidth: 1 },
      animated: false,
    }));

    setNodes([hubNode, ...radialNodes]);
    setEdges(browseEdges);
    setTimeout(() => fitView({ padding: 0.18, duration: 450 }), 80);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingItems, graphMode, activeView, items, userId]);

  // ── Drill graph (one item's connections) ──────────────────────────────────
  useEffect(() => {
    if (!selectedId || graphMode !== 'drill') return;
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
            apiFetch(`/sequences/public?topicId=${selectedId}`).then((d: any) => d ?? []),
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
          const usage = await FrameRefService.getUsage(selectedId).catch(() => ({ frame: null, activities: [], topics: [] }));
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
          const seqData = await SequenceService.getSequence(selectedId).catch(() => null);
          const seqActs = seqData?.activities ?? [];
          radialNodes = seqActs.map((sa: any, i: number) => {
            const { x, y } = radialPos(i, seqActs.length || 1, 260);
            return { id: sa.activityId || `act-${i}`, type: 'radial' as const, position: { x: x - 65, y: y - 25 }, data: { label: sa.activity?.title ?? sa.activityId, nodeType: 'activity' as const, meta: { urlName: sa.activity?.urlName, activityType: sa.activity?.activityType } } };
          });
        }

        const newEdges: Edge[] = radialNodes.map(n => ({
          id: `e-${n.id}`, source: 'center', target: n.id,
          style: { stroke: 'rgba(215,205,195,0.30)', strokeWidth: 1 },
          animated: false,
        }));

        setNodes([centerNode, ...radialNodes]);
        setEdges(newEdges);
        setTimeout(() => fitView({ padding: 0.18, duration: 450 }), 80);
      } finally { setLoadingGraph(false); }
    })();
  }, [selectedId, graphMode, activeView, items, userId, setNodes, setEdges, fitView]);

  const handleNodeClick = useCallback((_: any, node: Node) => {
    const n = node as Node<NodeData>;
    if (graphMode === 'browse') {
      if (n.id === 'hub') return;
      setSelectedId(n.id);
      setGraphMode('drill');
    } else {
      setPopupNode(n);
    }
  }, [graphMode]);

  const handleListItemClick = (id: string) => {
    setSelectedId(id);
    setGraphMode('drill');
    setShowCreate(false);
    if (isMobile) setSidebarOpen(false);
  };

  const switchView = (v: ActiveView) => {
    setActiveView(v);
    setSortOrder(SORT_OPTIONS[v][0].value);
    setShowCreate(false);
    setPopupNode(null);
    setSelectedId(null);
    setGraphMode('browse');
  };

  const handleAction = () => {
    refreshBalance();
    fetchList();
    setPopupNode(null);
  };

  const handleCreated = () => {
    refreshBalance();
    fetchList();
  };

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden', background: 'var(--bg-primary)', position: 'relative' }}>

      {/* Mobile overlay backdrop */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.5)' }}
        />
      )}

      {/* SIDEBAR */}
      <aside style={{
        width: 272, flexShrink: 0,
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex', flexDirection: 'column',
        background: 'var(--bg-primary)',
        ...(isMobile ? {
          position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 100,
          transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.22s cubic-bezier(0.4,0,0.2,1)',
        } : {}),
      }}>

        {/* Logo + user */}
        <div style={{ height: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1rem', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              inter<span style={{ color: 'var(--accent)' }}>View</span>
            </span>
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
                letterSpacing: '0.07em', textTransform: 'uppercase' as const, border: 'none', borderRadius: 5, cursor: 'pointer',
                background: activeView === v ? 'var(--bg-elevated)' : 'transparent',
                color: activeView === v ? 'var(--text-primary)' : 'var(--text-muted)',
                transition: 'all 0.12s',
              }}>{v}</button>
            ))}
          </div>

          {/* Sort */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '0.48rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' as const, flexShrink: 0 }}>Sort</span>
            <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.58rem', fontFamily: 'var(--font-dm-mono), monospace', cursor: 'pointer', outline: 'none' }}>
              {SORT_OPTIONS[activeView].map(o => (
                <option key={o.value} value={o.value} style={{ background: 'var(--bg-secondary)' }}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* List header + add */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.45rem 1rem 0.25rem 1rem', flexShrink: 0 }}>
          <span style={{ fontSize: '0.48rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--text-muted)' }}>
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
          <CreationForm view={activeView} userId={userId} onCreated={handleCreated} onClose={() => setShowCreate(false)} />
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
            <ListItem key={item.id} item={item} view={activeView} isSelected={selectedId === item.id} onClick={() => handleListItemClick(item.id)} />
          ))}
        </div>

        {/* Footer: holon balance + game info */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '0.55rem 1rem', flexShrink: 0 }}>
          {instance?.gameNumber != null && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: '0.45rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--text-muted)' }}>
                Game #{instance.gameNumber}
              </span>
              {instance.gameVersion && (
                <span style={{ fontSize: '0.45rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)' }}>
                  v{instance.gameVersion}
                </span>
              )}
            </div>
          )}
          {isAuthenticated && (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: '0.5rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--text-muted)' }}>Balance</span>
              <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--accent)', fontWeight: 600, marginLeft: 'auto' }}>◈ {holonBalance ?? 0}</span>
            </div>
          )}
        </div>
      </aside>

      {/* GRAPH CANVAS */}
      <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Mobile sidebar toggle */}
        {isMobile && (
          <button
            onClick={() => setSidebarOpen(v => !v)}
            style={{
              position: 'absolute', top: '0.75rem', left: '0.75rem', zIndex: 50,
              width: 36, height: 36, borderRadius: 8,
              background: 'var(--bg-secondary)', border: '1px solid var(--border-strong)',
              color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1rem',
            }}
            aria-label="Toggle sidebar"
          >
            ☰
          </button>
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
            onAction={handleAction}
            holonBalance={holonBalance}
            holonsConfig={instance?.config?.holons
              ? { supportCost: instance.config.holons.supportCost, activityStakeAmount: instance.config.holons.activityStakeAmount }
              : null}
          />
        )}

        {/* Drill mode indicator */}
        {graphMode === 'drill' && selectedId && (
          <button
            onClick={() => { setSelectedId(null); setGraphMode('browse'); }}
            style={{
              position: 'absolute', bottom: '1.25rem', left: '50%', transform: 'translateX(-50%)',
              fontSize: '0.52rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em',
              textTransform: 'uppercase' as const, padding: '0.4rem 1rem', borderRadius: 999, cursor: 'pointer',
              background: 'var(--bg-secondary)', border: '1px solid var(--border-default)',
              color: 'var(--text-muted)', zIndex: 50,
            }}
          >
            ← all {activeView}
          </button>
        )}
      </main>
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function InterViewPage() {
  return (
    <ReactFlowProvider>
      <InterViewPageInner />
    </ReactFlowProvider>
  );
}
