'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  MarkerType,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useAuth } from '@/contexts/AuthContext';
import { useInstance } from '@/contexts/InstanceContext';
import { apiFetch } from '@/lib/api';
import { TopicService } from '@/services/topicService';
import { FrameRefService } from '@/services/frameRefService';
import { SequenceService } from '@/services/sequenceService';
import { AlgorithmService } from '@/services/algorithmService';
import GameNav from '@/components/GameNav';
import Toasts, { toast } from '@/components/Toasts';
import FirstVisitOverlay from '@/components/FirstVisitOverlay';
import { STR, HOLON_SYMBOL } from '@/lib/strings';
import { btn, inputCss, labelCss, mono } from '@/lib/ui';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

export type HubView = 'topics' | 'frames' | 'patterns';
type GraphMode = 'browse' | 'drill';

type NodeData = {
  label: string;
  nodeType: 'hub' | 'topic' | 'activity' | 'sequence' | 'frame' | 'pattern';
  meta: Record<string, any>;
  [key: string]: unknown;
};

// ─── Geometry & time ─────────────────────────────────────────────────────────

function radialPos(i: number, total: number, radius: number) {
  const angle = total === 1 ? -Math.PI / 2 : (2 * Math.PI * i / total) - Math.PI / 2;
  return { x: Math.round(Math.cos(angle) * radius), y: Math.round(Math.sin(angle) * radius) };
}

function timeLeft(iso?: string | null): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'expiring';
  const h = Math.floor(ms / 3600000);
  if (h >= 48) return `${Math.floor(h / 24)}d left`;
  if (h >= 1) return `${h}h left`;
  return `${Math.max(1, Math.floor(ms / 60000))}m left`;
}

// ─── Node palette (light theme) ──────────────────────────────────────────────

const NODE_TEXT: Record<string, string> = {
  topic: 'var(--node-topic)', activity: 'var(--node-topic)',
  frame: 'var(--node-frame)', pattern: 'var(--node-pattern)', sequence: 'var(--node-sequence)',
};
// Tints layered over the opaque page color — nodes must be solid so edges
// (which render beneath them) don't show through the card.
const tintOver = (tint: string) => `linear-gradient(${tint}, ${tint}), var(--bg-primary)`;
const NODE_BG: Record<string, string> = {
  topic: tintOver('rgba(200,59,80,0.06)'), activity: tintOver('rgba(200,59,80,0.06)'),
  frame: tintOver('rgba(154,123,47,0.07)'), pattern: tintOver('rgba(61,111,163,0.07)'), sequence: tintOver('rgba(14,143,102,0.07)'),
};
const NODE_BORDER: Record<string, string> = {
  topic: 'rgba(200,59,80,0.4)', activity: 'rgba(200,59,80,0.4)',
  frame: 'rgba(154,123,47,0.42)', pattern: 'rgba(61,111,163,0.42)', sequence: 'rgba(14,143,102,0.42)',
};

// ─── Node components ─────────────────────────────────────────────────────────

function HubNode({ data }: { data: NodeData }) {
  return (
    <div style={{
      width: 104, height: 104, borderRadius: '50%',
      background: 'var(--bg-secondary)',
      border: '2px solid var(--accent)',
      boxShadow: '0 0 0 5px rgba(200,59,80,0.06), 0 1px 4px rgba(15,13,11,0.08)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'default', textAlign: 'center', padding: '0.5rem',
    }}>
      <span style={{
        fontSize: 'var(--text-2xs)', fontFamily: mono,
        letterSpacing: '0.1em', textTransform: 'uppercase' as const,
        color: 'var(--accent)', lineHeight: 1.3,
        display: '-webkit-box', WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical' as const, overflow: 'hidden', wordBreak: 'break-word' as const,
      }}>{data.label}</span>
      <Handle id="out-c" type="source" position={Position.Top} style={{ opacity: 0, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} />
    </div>
  );
}

function CenterNode({ data }: { data: NodeData }) {
  const c = NODE_TEXT[data.nodeType] || 'var(--accent)';

  // A frame IS its geometry — render the focused frame as a mini labeled grid
  if (data.nodeType === 'frame') {
    const m = data.meta || {};
    const pole: React.CSSProperties = {
      position: 'absolute', fontSize: '0.55rem', fontFamily: mono,
      color: 'var(--text-muted)', whiteSpace: 'nowrap', maxWidth: 90,
      overflow: 'hidden', textOverflow: 'ellipsis',
    };
    return (
      <div style={{
        width: 150, height: 150, position: 'relative',
        background: 'var(--bg-secondary)', border: `2px solid ${c}`,
        borderRadius: 12, boxShadow: '0 0 0 5px rgba(154,123,47,0.06), 0 1px 4px rgba(15,13,11,0.08)',
        cursor: 'pointer',
      }}>
        {/* axes */}
        <div style={{ position: 'absolute', left: '50%', top: 10, bottom: 10, width: 1, background: 'var(--border-strong)' }} />
        <div style={{ position: 'absolute', top: '50%', left: 10, right: 10, height: 1, background: 'var(--border-strong)' }} />
        {/* pole labels (fall back to axis names) */}
        <span style={{ ...pole, top: 5, left: '50%', transform: 'translateX(-50%)' }}>{(m.yMax as string) || (m.yLabel as string)}</span>
        <span style={{ ...pole, bottom: 5, left: '50%', transform: 'translateX(-50%)' }}>{(m.yMin as string) || ''}</span>
        <span style={{ ...pole, left: 5, top: '50%', transform: 'translateY(-50%)', maxWidth: 60 }}>{(m.xMin as string) || ''}</span>
        <span style={{ ...pole, right: 5, top: '50%', transform: 'translateY(-50%)', maxWidth: 60, textAlign: 'right' }}>{(m.xMax as string) || (m.xLabel as string)}</span>
        <Handle id="out-c" type="source" position={Position.Top} style={{ opacity: 0, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} />
        <Handle id="out-r" type="source" position={Position.Right} style={{ opacity: 0 }} />
      </div>
    );
  }

  return (
    <div style={{
      width: 96, height: 96, borderRadius: '50%',
      background: 'var(--bg-secondary)',
      border: `2px solid ${c}`,
      boxShadow: '0 0 0 5px rgba(15,13,11,0.04), 0 1px 4px rgba(15,13,11,0.08)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0.5rem', cursor: 'pointer', textAlign: 'center',
    }}>
      <span style={{
        fontSize: 'var(--text-2xs)', fontFamily: mono,
        color: 'var(--text-primary)', lineHeight: 1.3,
        display: '-webkit-box', WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical' as const, overflow: 'hidden', wordBreak: 'break-word' as const,
      }}>{data.label}</span>
      <Handle id="out-c" type="source" position={Position.Top} style={{ opacity: 0, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} />
      <Handle id="out-r" type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

function RadialNode({ data }: { data: NodeData }) {
  const meta = data.meta || {};

  // Ghost node: a call-to-action placeholder in empty drills
  if (meta.ghost) {
    return (
      <div style={{
        width: 150, background: 'var(--bg-primary)',
        border: '1.5px dashed var(--border-strong)',
        borderRadius: 8, padding: '0.55rem 0.65rem', cursor: 'pointer', textAlign: 'center',
      }}>
        <div style={{ fontSize: 'var(--text-xs)', fontFamily: mono, color: 'var(--text-muted)', lineHeight: 1.4 }}>
          {data.label}
        </div>
        <Handle id="in-c" type="target" position={Position.Top} style={{ opacity: 0, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} />
      </div>
    );
  }

  let caps: string;
  switch (data.nodeType) {
    case 'activity':
      caps = (meta.activityType as string)?.toUpperCase().replace('HOLOSCOPIC', 'DISSOLVE').replace('FINDTHECENTER', 'RESOLVE') || STR.map.toUpperCase();
      break;
    case 'sequence':
    case 'pattern':
      caps = STR.pattern.toUpperCase();
      break;
    case 'frame':
      caps = STR.frame.toUpperCase();
      break;
    default:
      caps = meta.status === 'confirmed'
        ? `${STR.topic.toUpperCase()} · OPEN`
        : meta.expiresAt
          ? `${STR.topic.toUpperCase()} · ${timeLeft(meta.expiresAt as string)}`
          : STR.topic.toUpperCase();
  }
  const isConfirmedTopic = data.nodeType === 'topic' && meta.status === 'confirmed';
  // Signal-based sizing: 0..1 scale (relative to the most active visible item)
  const sizeScale = typeof meta.scale === 'number' ? meta.scale : 0;

  return (
    <div style={{
      width: 136 + Math.round(sizeScale * 44), background: isConfirmedTopic ? 'var(--bg-secondary)' : (NODE_BG[data.nodeType] || 'var(--bg-secondary)'),
      border: `${isConfirmedTopic ? '1.5px' : '1px'} solid ${NODE_BORDER[data.nodeType] || 'var(--border-default)'}`,
      borderRadius: 8, padding: '0.45rem 0.65rem', cursor: 'pointer',
      boxShadow: '0 1px 3px rgba(15,13,11,0.05)',
    }}>
      <div style={{
        fontSize: 'var(--text-2xs)', fontFamily: mono, letterSpacing: '0.1em',
        color: isConfirmedTopic ? 'var(--accent-emerald)' : (NODE_TEXT[data.nodeType] || 'var(--text-muted)'),
        textTransform: 'uppercase' as const, marginBottom: '0.18rem',
      }}>
        {caps}
      </div>
      <div style={{ fontSize: 'var(--text-xs)', fontFamily: mono, color: 'var(--text-primary)', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden', wordBreak: 'break-word' as const }}>
        {data.label}
      </div>
      {meta.subtitle && (
        <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginTop: '0.18rem', fontFamily: mono }}>
          {meta.subtitle as string}
        </div>
      )}
      <Handle id="in-c" type="target" position={Position.Top} style={{ opacity: 0, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} />
      <Handle id="in-l" type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle id="out-r" type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Handle id="out-c" type="source" position={Position.Top} style={{ opacity: 0, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} />
    </div>
  );
}

// Tiny textless satellite — shows that a node has children (full scale of the
// game) without crowding the actionable content. Click drills into the parent.
function DotNode({ data }: { data: NodeData }) {
  const c = NODE_TEXT[data.nodeType] || 'var(--text-muted)';
  return (
    <div style={{ width: 9, height: 9, borderRadius: '50%', background: c, opacity: 0.45, cursor: 'pointer' }}>
      <Handle id="in-c" type="target" position={Position.Top} style={{ opacity: 0, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} />
    </div>
  );
}

const NODE_TYPES = { hub: HubNode, center: CenterNode, radial: RadialNode, dot: DotNode };

// ─── Sort options ─────────────────────────────────────────────────────────────

const SORT_OPTIONS: Record<HubView, { label: string; value: string }[]> = {
  topics: [{ label: 'Most active', value: 'active' }, { label: 'Most supported', value: 'supporters' }, { label: 'Newest', value: 'newest' }, { label: 'Expiring soon', value: 'expiring' }],
  frames: [{ label: 'Most used', value: 'used' }, { label: 'Newest', value: 'newest' }],
  patterns: [{ label: 'Newest', value: 'newest' }],
};

// ─── Popup card ───────────────────────────────────────────────────────────────

function PopupCard({ node, onClose, userId, onAction, holonBalance, holonsConfig, onExplore, isAdmin }: {
  node: Node<NodeData>;
  onClose: () => void;
  userId: string | null;
  onAction: () => void;
  holonBalance: number | null;
  holonsConfig: { supportCost: number; activityStakeAmount: number } | null;
  onExplore?: () => void;
  isAdmin?: boolean;
}) {
  const d = node.data;
  const meta = d.meta || {};
  const bal = holonBalance ?? 0;
  const canAffordSupport = holonsConfig ? bal >= holonsConfig.supportCost : true;
  const canAffordStake   = holonsConfig ? bal >= holonsConfig.activityStakeAmount : true;

  async function act(fn: () => Promise<unknown>, successMsg?: string) {
    if (!userId) return;
    try {
      await fn();
      if (successMsg) toast(successMsg, 'success');
      onAction();
    }
    catch (e: any) { toast((e as Error).message, 'error'); }
  }

  const metaRow: React.CSSProperties = { display: 'flex', gap: '0.75rem', fontSize: 'var(--text-2xs)', fontFamily: mono, color: 'var(--text-muted)' };

  return (
    <div style={{
      position: 'absolute', top: '1.25rem', right: '1.25rem', width: 300, zIndex: 200,
      background: 'var(--bg-secondary)', border: '1px solid var(--border-default)',
      borderRadius: 14, padding: '1.1rem 1.25rem',
      boxShadow: '0 12px 40px rgba(15,13,11,0.16)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.65rem' }}>
        <div>
          <div style={{ fontSize: 'var(--text-2xs)', fontFamily: mono, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
            {d.nodeType === 'sequence' ? STR.pattern : d.nodeType === 'activity' ? STR.map : d.nodeType}
          </div>
          <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)', margin: 0, lineHeight: 1.3 }}>{d.label}</h3>
        </div>
        <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: 0, flexShrink: 0, marginLeft: '0.5rem' }}>×</button>
      </div>

      {d.nodeType === 'topic' && (
        <div style={{ marginBottom: '0.75rem' }}>
          {meta.description && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: '0 0 0.5rem', lineHeight: 1.5 }}>{meta.description as string}</p>}
          {meta.status === 'confirmed' ? (
            <div style={metaRow}>
              <span style={{ color: 'var(--accent-emerald)', textTransform: 'uppercase' as const }}>Open for {STR.maps.toLowerCase()}</span>
              {meta.activityCount != null && <span>{meta.activityCount as number} {STR.maps.toLowerCase()}</span>}
              <span>{HOLON_SYMBOL} {(meta.holonPool as number) ?? 0} pool</span>
            </div>
          ) : (
            <div style={metaRow}>
              <span>{(meta.supporterCount as number) ?? 0}{meta.quorumThreshold ? `/${meta.quorumThreshold}` : ''} supporters</span>
              {meta.expiresAt && <span>{timeLeft(meta.expiresAt as string)}</span>}
              <span>{HOLON_SYMBOL} {(meta.holonPool as number) ?? 0} pool</span>
            </div>
          )}
        </div>
      )}

      {d.nodeType === 'activity' && (
        <div style={{ marginBottom: '0.75rem' }}>
          {meta.frameLabel && <p style={{ fontSize: 'var(--text-2xs)', fontFamily: mono, color: 'var(--text-muted)', margin: '0 0 0.35rem' }}>{meta.frameLabel as string}</p>}
          {meta.question && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: '0 0 0.4rem', lineHeight: 1.5 }}>{meta.question as string}</p>}
          {meta.slots != null && (
            <span style={{ fontSize: 'var(--text-2xs)', fontFamily: mono, color: (meta.slots as number) === 0 ? 'var(--accent)' : 'var(--accent-emerald)' }}>
              {(meta.slots as number) === 0 ? 'Full' : `${meta.slots} open`}
            </span>
          )}
        </div>
      )}

      {d.nodeType === 'frame' && (
        <div style={{ marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          {meta.xLabel && <div style={{ fontSize: 'var(--text-xs)', fontFamily: mono, color: 'var(--text-secondary)' }}>x: {meta.xLabel as string}</div>}
          {meta.yLabel && <div style={{ fontSize: 'var(--text-xs)', fontFamily: mono, color: 'var(--text-secondary)' }}>y: {meta.yLabel as string}</div>}
          {meta.usageCount != null && <div style={{ fontSize: 'var(--text-2xs)', fontFamily: mono, color: 'var(--text-muted)' }}>{meta.usageCount as number} {STR.maps.toLowerCase()}</div>}
        </div>
      )}

      {(d.nodeType === 'sequence' || d.nodeType === 'pattern') && (
        <div style={{ marginBottom: '0.75rem' }}>
          {meta.description && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: '0 0 0.4rem', lineHeight: 1.5 }}>{meta.description as string}</p>}
          <div style={metaRow}>
            {meta.authorName && <span>by {meta.authorName as string}</span>}
            {meta.memberCount != null && <span>{meta.memberCount as number} members</span>}
            {meta.status && <span style={{ textTransform: 'uppercase' as const, color: meta.status === 'active' ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>{meta.status as string}</span>}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' as const }}>
        {onExplore && (
          <button onClick={onExplore} style={btn('outline')}>Explore →</button>
        )}
        {d.nodeType === 'topic' && userId && meta.status === 'nominated' && !meta.isNominator && (
          meta.isSupporter
            ? <button onClick={() => act(() => TopicService.unsupport(userId!, meta.topicId), `Support withdrawn — your ${HOLON_SYMBOL}${holonsConfig?.supportCost ?? ''} wager returned`)} style={btn('outline')}>Unsupport</button>
            : canAffordSupport
              ? <button onClick={() => act(() => TopicService.support(userId!, meta.topicId), `${HOLON_SYMBOL}${holonsConfig?.supportCost ?? ''} wagered on "${d.label}" — returned if it expires`)} style={btn('fill')}>Support · {HOLON_SYMBOL}{holonsConfig?.supportCost ?? ''}</button>
              : <span style={{ ...btn('outline'), opacity: 0.5, cursor: 'not-allowed' }}>Need {HOLON_SYMBOL}{holonsConfig?.supportCost} — you have {HOLON_SYMBOL}{bal}</span>
        )}
        {d.nodeType === 'topic' && userId && meta.status === 'confirmed' && (
          canAffordStake
            ? <Link href={`/create/activity?topicId=${meta.topicId}`} style={{ ...btn('fill'), textDecoration: 'none' }}>Start a {STR.map.toLowerCase()} · {HOLON_SYMBOL}{holonsConfig?.activityStakeAmount ?? ''}</Link>
            : <span style={{ ...btn('outline'), opacity: 0.5, cursor: 'not-allowed' }}>Need {HOLON_SYMBOL}{holonsConfig?.activityStakeAmount} — you have {HOLON_SYMBOL}{bal}</span>
        )}
        {d.nodeType === 'activity' && meta.urlName && (
          <Link href={`/${meta.urlName as string}`} style={{ ...btn('fill'), textDecoration: 'none' }}>Open {STR.map.toLowerCase()} →</Link>
        )}
        {d.nodeType === 'activity' && meta.slots === 0 && meta.topicId && (
          <Link href={`/create/activity?topicId=${meta.topicId}`} style={{ ...btn('outline'), textDecoration: 'none' }}>New {STR.map.toLowerCase()}</Link>
        )}
        {d.nodeType === 'frame' && meta.frameId && (
          canAffordStake
            ? <Link href={`/create/activity?frameId=${meta.frameId as string}`} style={{ ...btn('fill'), textDecoration: 'none' }}>Start a {STR.map.toLowerCase()} · {HOLON_SYMBOL}{holonsConfig?.activityStakeAmount ?? ''}</Link>
            : <span style={{ ...btn('fill'), opacity: 0.5, cursor: 'not-allowed' }}>Need {HOLON_SYMBOL}{holonsConfig?.activityStakeAmount} — you have {HOLON_SYMBOL}{bal}</span>
        )}
        {d.nodeType === 'sequence' && meta.urlName && (
          <Link href={`/sequence/${meta.urlName as string}`} style={{ ...btn('fill'), textDecoration: 'none' }}>Enter →</Link>
        )}
        {d.nodeType === 'pattern' && meta.id && (
          <Link href={`/patterns/${meta.id as string}`} style={{ ...btn('fill'), textDecoration: 'none' }}>View {STR.pattern.toLowerCase()} →</Link>
        )}
        {/* Moderation: admin-only removal; escrow refunds happen server-side */}
        {isAdmin && (d.nodeType === 'topic' || d.nodeType === 'activity') && (
          <button
            onClick={() => {
              if (!window.confirm(`Remove "${d.label}"? Escrowed ${STR.holons} are refunded.`)) return;
              const path = d.nodeType === 'topic' ? `/topics/${meta.topicId}` : `/activities/${node.id}`;
              act(() => apiFetch(path, { method: 'DELETE', userId: userId! }), 'Removed — escrow refunded');
            }}
            style={{ ...btn('outline'), color: 'var(--accent)', borderColor: 'rgba(200,59,80,0.4)' }}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Creation form ────────────────────────────────────────────────────────────

function CreationForm({ view, userId, onCreated, onClose, costs, existingTopics, onPickExisting }: {
  view: HubView; userId: string | null; onCreated: () => void; onClose: () => void;
  costs: { nominationCost?: number; quorumThreshold?: number; windowHours?: number };
  existingTopics?: any[];
  onPickExisting?: (id: string) => void;
}) {
  const [fields, setFields] = useState({ title: '', description: '', xLabel: '', xMin: '', xMax: '', yLabel: '', yMin: '', yMax: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (view === 'patterns') {
    return (
      <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '0.85rem 1rem', background: 'var(--bg-primary)', flexShrink: 0 }}>
        <Link href="/create/pattern" onClick={onClose} style={{ ...btn('fill'), textDecoration: 'none', display: 'block', textAlign: 'center' }}>
          Create {STR.pattern}
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
        toast(`Topic nominated — ${HOLON_SYMBOL}${costs.nominationCost ?? 10} staked, returned in full if it doesn't reach quorum`, 'success');
      } else {
        if (!fields.xLabel.trim() || !fields.yLabel.trim()) throw new Error('Both axis labels required');
        await FrameRefService.create(userId, { xLabel: fields.xLabel.trim(), xMin: fields.xMin.trim(), xMax: fields.xMax.trim(), yLabel: fields.yLabel.trim(), yMin: fields.yMin.trim(), yMax: fields.yMax.trim() });
        toast(`${STR.frame} created — you earn ${STR.holons} each time someone maps with it`, 'success');
      }
      onCreated(); onClose();
    } catch (e: any) { setError(e.message); setSubmitting(false); }
  }

  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '0.85rem 1rem', background: 'var(--bg-primary)', flexShrink: 0 }}>
      {view === 'topics' && (
        <>
          <label style={labelCss}>Title</label>
          <div style={{ position: 'relative' }}>
            <input value={fields.title} onChange={set('title')} placeholder="What should be explored?" style={{ ...inputCss, marginBottom: '0.5rem' }} />
            {(() => {
              const q = fields.title.trim().toLowerCase();
              const matches = q.length >= 2 && existingTopics
                ? existingTopics.filter(t => t.title?.toLowerCase().includes(q)).slice(0, 4)
                : [];
              if (matches.length === 0) return null;
              return (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, marginTop: '-0.3rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 8, boxShadow: '0 6px 20px rgba(15,13,11,0.12)', overflow: 'hidden' }}>
                  <div style={{ padding: '0.35rem 0.75rem', fontSize: 'var(--text-2xs)', fontFamily: mono, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
                    Already in play — support instead?
                  </div>
                  {matches.map((t: any) => (
                    <button key={t.id} type="button" onClick={() => { onPickExisting?.(t.id); onClose(); }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', background: 'none', border: 'none', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', fontSize: 'var(--text-xs)', fontFamily: mono, color: 'var(--text-primary)' }}>
                      {t.title}
                      <span style={{ color: t.status === 'confirmed' ? 'var(--accent-emerald)' : 'var(--text-muted)', marginLeft: '0.5rem' }}>
                        {t.status === 'confirmed' ? `open · ${t.activityCount ?? 0} ${STR.maps.toLowerCase()}` : `${t.supporterCount ?? 0}/${t.quorumThreshold ?? ''} supporters`}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>
          <label style={labelCss}>Description</label>
          <textarea value={fields.description} onChange={set('description')} placeholder="Why is this important?" rows={2}
            style={{ ...inputCss, resize: 'vertical' as const }} />
          <p style={{ fontSize: 'var(--text-2xs)', fontFamily: mono, color: 'var(--text-muted)', margin: '0.5rem 0 0', lineHeight: 1.5 }}>
            Costs {HOLON_SYMBOL}{costs.nominationCost ?? 10} — needs {costs.quorumThreshold ?? 5} supporters
            in {costs.windowHours ?? 24}h, or it&apos;s returned in full.
          </p>
        </>
      )}
      {view === 'frames' && (
        <>
          <p style={{ fontSize: 'var(--text-2xs)', fontFamily: mono, color: 'var(--text-muted)', margin: '0 0 0.6rem', lineHeight: 1.5 }}>
            A reusable pair of axes — earn {STR.holons} each time someone maps with it.
          </p>
          <label style={labelCss}>X-axis label</label>
          <input value={fields.xLabel} onChange={set('xLabel')} placeholder="e.g. Individual ↔ Collective" style={{ ...inputCss, marginBottom: '0.35rem' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem', marginBottom: '0.5rem' }}>
            <input value={fields.xMin} onChange={set('xMin')} placeholder="← left" style={{ ...inputCss, fontSize: 'var(--text-xs)' }} />
            <input value={fields.xMax} onChange={set('xMax')} placeholder="right →" style={{ ...inputCss, fontSize: 'var(--text-xs)' }} />
          </div>
          <label style={labelCss}>Y-axis label</label>
          <input value={fields.yLabel} onChange={set('yLabel')} placeholder="e.g. Past ↔ Future" style={{ ...inputCss, marginBottom: '0.35rem' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
            <input value={fields.yMin} onChange={set('yMin')} placeholder="↓ bottom" style={{ ...inputCss, fontSize: 'var(--text-xs)' }} />
            <input value={fields.yMax} onChange={set('yMax')} placeholder="top ↑" style={{ ...inputCss, fontSize: 'var(--text-xs)' }} />
          </div>
        </>
      )}
      {error && <p style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', margin: '0.4rem 0 0' }}>{error}</p>}
      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.65rem', justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ ...btn('outline'), border: '1px solid var(--border-default)' }}>Cancel</button>
        <button onClick={submit} disabled={submitting} style={{ ...btn('fill'), opacity: submitting ? 0.7 : 1 }}>
          {submitting ? '…' : view === 'topics' ? `Nominate · ${HOLON_SYMBOL}${costs.nominationCost ?? 10}` : 'Create'}
        </button>
      </div>
    </div>
  );
}

// ─── List item ────────────────────────────────────────────────────────────────

function ListItem({ item, view, isSelected, onClick }: {
  item: any; view: HubView; isSelected: boolean; onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const metaCss: React.CSSProperties = { display: 'flex', gap: '0.5rem', fontSize: 'var(--text-2xs)', fontFamily: mono, color: 'var(--text-muted)' };
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer',
        background: hovered && !isSelected ? 'var(--bg-elevated)' : isSelected ? 'rgba(200,59,80,0.06)' : 'transparent',
        border: 'none', borderLeft: `2px solid ${isSelected ? 'var(--accent)' : 'transparent'}`,
        padding: '0.55rem 1rem 0.55rem 0.85rem', transition: 'background 0.1s, border-color 0.1s',
      }}>
      {view === 'topics' && (
        <>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', lineHeight: 1.35, marginBottom: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, fontWeight: isSelected ? 600 : 400 }}>
            {item.title}
          </div>
          <div style={metaCss}>
            {item.status === 'confirmed' ? (
              <>
                <span style={{ textTransform: 'uppercase' as const, color: 'var(--accent-emerald)' }}>Open</span>
                <span>{item.activityCount ?? 0} {(item.activityCount ?? 0) === 1 ? STR.map.toLowerCase() : STR.maps.toLowerCase()}</span>
              </>
            ) : (
              <>
                <span>{item.supporterCount ?? 0}{item.quorumThreshold ? `/${item.quorumThreshold}` : ''} supporters</span>
                <span>{timeLeft(item.expiresAt)}</span>
              </>
            )}
          </div>
        </>
      )}
      {view === 'frames' && (
        <>
          <div style={{ fontSize: 'var(--text-sm)', fontFamily: mono, color: 'var(--text-primary)', marginBottom: '0.12rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
            {item.xLabel}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', fontFamily: mono, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
            {item.yLabel}
          </div>
        </>
      )}
      {view === 'patterns' && (
        <>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', lineHeight: 1.35, marginBottom: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, fontWeight: isSelected ? 600 : 400 }}>
            {item.title}
          </div>
          <div style={metaCss}>
            <span>by {item.authorName ?? 'unknown'}</span>
            {item.sequenceId && <span>session linked</span>}
          </div>
        </>
      )}
    </button>
  );
}

// ─── Hub inner (needs ReactFlow context) ─────────────────────────────────────

const BROWSE_MAX = 20;
const NAV_HEIGHT = 52;

function HubInner({ view }: { view: HubView }) {
  const { userId, holonBalance, isAuthenticated, refreshBalance, userRole } = useAuth();
  const { instance, config } = useInstance();
  const { fitView } = useReactFlow();

  const [sortOrder, setSortOrder] = useState(SORT_OPTIONS[view][0].value);
  const [items, setItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [graphMode, setGraphMode] = useState<GraphMode>('browse');
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [popupNode, setPopupNode] = useState<Node<NodeData> | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [page, setPage] = useState(0);
  const router = useRouter();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const lastFitKey = useRef('');

  // Responsive detection
  useEffect(() => {
    let prevMobile: boolean | null = null;
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // Only open/close the sidebar when we actually cross the breakpoint.
      // The mobile soft keyboard fires `resize`, so reacting to every resize
      // would snap the drawer shut as soon as the user starts typing.
      if (mobile !== prevMobile) {
        setSidebarOpen(!mobile);
        prevMobile = mobile;
      }
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Fetch list. Soft mode refreshes data in place without resetting the
  // player's view (used by polling / focus refresh).
  const fetchList = useCallback(async (opts?: { soft?: boolean }) => {
    if (!opts?.soft) {
      setLoadingItems(true);
      setSelectedId(null);
      setGraphMode('browse');
      setNodes([]);
      setEdges([]);
      setPopupNode(null);
    }
    try {
      if (view === 'topics') {
        // Both lifecycle states — confirmed topics must stay visible after quorum
        const topics = await TopicService.list('nominated,confirmed');
        setItems(topics);
      } else if (view === 'frames') {
        const { frames } = await FrameRefService.list(undefined, 100);
        setItems(frames);
      } else {
        // Published Patterns (instance-scoped) — NOT raw sequences, which are
        // global platform content and would leak other deployments' material.
        const patterns = await AlgorithmService.list();
        setItems(patterns);
      }
    } catch { setItems([]); }
    finally { if (!opts?.soft) setLoadingItems(false); }
  }, [view, setNodes, setEdges]);

  useEffect(() => { fetchList(); }, [fetchList]);

  // Keep the hub fresh during live play: refetch on window focus plus a 45s
  // poll, paused while the tab is hidden. Soft — never resets the view.
  useEffect(() => {
    const soft = () => {
      if (document.visibilityState === 'visible') fetchList({ soft: true });
    };
    const interval = setInterval(soft, 45_000);
    window.addEventListener('focus', soft);
    document.addEventListener('visibilitychange', soft);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', soft);
      document.removeEventListener('visibilitychange', soft);
    };
  }, [fetchList]);

  // Sort
  const sortedItems = [...items].sort((a, b) => {
    if (view === 'topics') {
      // Confirmed topics surface first — they're the joinable ones
      const conf = (b.status === 'confirmed' ? 1 : 0) - (a.status === 'confirmed' ? 1 : 0);
      if (conf !== 0) return conf;
      // Breadth + depth: maps attached and the participation inside them
      if (sortOrder === 'active') return (b.activityScore ?? 0) - (a.activityScore ?? 0);
      if (sortOrder === 'supporters') return (b.supporterCount ?? 0) - (a.supporterCount ?? 0);
      if (sortOrder === 'expiring') return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
      return new Date(b.nominatedAt ?? 0).getTime() - new Date(a.nominatedAt ?? 0).getTime();
    }
    if (view === 'patterns') return new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime();
    return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
  });

  // ── Browse graph (all items radial) ───────────────────────────────────────
  useEffect(() => {
    if (loadingItems || graphMode !== 'browse') return;
    const visible = sortedItems.slice(page * BROWSE_MAX, page * BROWSE_MAX + BROWSE_MAX);
    if (visible.length === 0) {
      setNodes([]); setEdges([]);
      return;
    }

    // Signal scale for node sizing: relative to the most active visible topic
    const maxSignal = view === 'topics'
      ? Math.max(1, ...visible.map((t: any) => t.activityScore ?? 0))
      : 1;

    const hubLabels: Record<HubView, string> = { topics: STR.topics, frames: STR.frames, patterns: STR.patterns };
    const hubNode: Node<NodeData> = {
      id: 'hub', type: 'hub', position: { x: -52, y: -52 },
      data: { label: hubLabels[view], nodeType: 'hub', meta: { isDrill: false } },
    };

    const radialNodes: Node<NodeData>[] = visible.map((item, i) => {
      const { x, y } = radialPos(i, visible.length, 290);
      let label = '';
      let nodeType: NodeData['nodeType'] = 'topic';
      let meta: Record<string, any> = {};

      if (view === 'topics') {
        label = item.title;
        nodeType = 'topic';
        meta = { topicId: item.id, description: item.description, supporterCount: item.supporterCount, quorumThreshold: item.quorumThreshold, holonPool: item.holonPool, status: item.status, expiresAt: item.expiresAt, activityCount: item.activityCount, scale: (item.activityScore ?? 0) / maxSignal, isNominator: item.nominatedBy === userId, isSupporter: item.supporters?.some((s: any) => s.userId === userId) };
      } else if (view === 'frames') {
        label = `${item.xLabel} / ${item.yLabel}`;
        nodeType = 'frame';
        meta = { frameId: item.id, xLabel: item.xLabel, yLabel: item.yLabel };
      } else {
        label = item.title;
        nodeType = 'pattern';
        meta = { id: item.id, description: item.thesis || item.description, authorName: item.authorName, sequenceId: item.sequenceId };
      }

      return {
        id: item.id, type: 'radial' as const,
        position: { x: x - 74, y: y - 26 },
        data: { label, nodeType, meta },
      };
    });

    const browseEdges: Edge[] = radialNodes.map(n => ({
      id: `e-${n.id}`, source: 'hub', target: n.id,
      sourceHandle: 'out-c', targetHandle: 'in-c',
      type: 'straight',
      style: { stroke: 'rgba(15,13,11,0.16)', strokeWidth: 1 },
      animated: false,
    }));

    // Satellite dots: one tiny textless dot per child (capped), fanned outward
    // beyond each parent — the full scale of the game at a glance.
    const MAX_DOTS = 8;
    const dotNodes: Node<NodeData>[] = [];
    const dotEdges: Edge[] = [];
    visible.forEach((item: any, i: number) => {
      const childCount = view === 'frames' ? (item.usageCount ?? 0) : (item.activityCount ?? 0);
      const shown = Math.min(childCount, MAX_DOTS);
      if (!shown) return;
      const parentType = radialNodes[i].data.nodeType;
      const baseAngle = visible.length === 1 ? -Math.PI / 2 : (2 * Math.PI * i / visible.length) - Math.PI / 2;
      for (let k = 0; k < shown; k++) {
        const angle = baseAngle + (k - (shown - 1) / 2) * 0.05;
        const dx = Math.round(Math.cos(angle) * 410);
        const dy = Math.round(Math.sin(angle) * 410);
        const dotId = `dot-${item.id}-${k}`;
        dotNodes.push({
          id: dotId, type: 'dot', position: { x: dx - 4, y: dy - 4 }, selectable: false,
          data: { label: '', nodeType: parentType, meta: { parentId: item.id } },
        });
        dotEdges.push({
          id: `e-${dotId}`, source: item.id, target: dotId,
          sourceHandle: 'out-c', targetHandle: 'in-c', type: 'straight',
          style: { stroke: 'rgba(15,13,11,0.09)', strokeWidth: 1 },
          animated: false,
        });
      }
    });

    setNodes([hubNode, ...radialNodes, ...dotNodes]);
    setEdges([...browseEdges, ...dotEdges]);
    // Refit the camera only when the composition changes (mode/page/sort),
    // not on every data refresh — don't yank the view away from the player.
    const fitKey = `browse:${view}:${page}:${sortOrder}`;
    if (lastFitKey.current !== fitKey) {
      lastFitKey.current = fitKey;
      setTimeout(() => fitView({ padding: 0.18, duration: 450 }), 80);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingItems, graphMode, view, items, userId, page, sortOrder]);

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

        if (view === 'topics') {
          centerNode = {
            id: 'center', type: 'center', position: { x: -48, y: -48 },
            data: {
              label: item.title, nodeType: 'topic',
              meta: { topicId: item.id, description: item.description, supporterCount: item.supporterCount, quorumThreshold: item.quorumThreshold, holonPool: item.holonPool, status: item.status, expiresAt: item.expiresAt, isNominator: item.nominatedBy === userId, isSupporter: item.supporters?.some((s: any) => s.userId === userId) },
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
              const { x, y } = radialPos(i, total || 1, 270);
              const joined = a.participants?.length ?? 0;
              const closing = a.status === 'active' && a.closesAt ? ` · ${timeLeft(a.closesAt)}` : a.status === 'completed' ? ' · settled' : '';
              return { id: a.id, type: 'radial' as const, position: { x: x - 74, y: y - 26 }, data: { label: a.title, nodeType: 'activity' as const, meta: { urlName: a.urlName, activityType: a.activityType, question: a.mapQuestion, slots: a.maxEntries ? Math.max(0, a.maxEntries - joined) : null, subtitle: a.maxEntries ? `${joined}/${a.maxEntries} joined${closing}` : undefined, topicId: item.id } } };
            }),
            ...seqs.map((s: any, i: number) => {
              const { x, y } = radialPos(acts.length + i, total || 1, 270);
              return { id: s.id, type: 'radial' as const, position: { x: x - 74, y: y - 26 }, data: { label: s.title, nodeType: 'sequence' as const, meta: { urlName: s.urlName, memberCount: s.members?.length ?? 0, status: s.status, description: s.description } } };
            }),
          ];

        } else if (view === 'frames') {
          centerNode = {
            id: 'center', type: 'center', position: { x: -75, y: -75 },
            data: { label: `${item.xLabel} / ${item.yLabel}`, nodeType: 'frame', meta: { frameId: item.id, xLabel: item.xLabel, yLabel: item.yLabel, xMin: item.xMin, xMax: item.xMax, yMin: item.yMin, yMax: item.yMax } },
          };
          const usage = await FrameRefService.getUsage(selectedId).catch(() => ({ frame: null, activities: [], topics: [] }));
          const all = [...(usage.topics ?? []), ...(usage.activities ?? [])];
          centerNode.data.meta.usageCount = (usage.activities ?? []).length;
          radialNodes = all.map((n: any, i: number) => {
            const { x, y } = radialPos(i, all.length || 1, 270);
            const isAct = !!n.activityType;
            return { id: n.id, type: 'radial' as const, position: { x: x - 74, y: y - 26 }, data: { label: n.title, nodeType: (isAct ? 'activity' : 'topic') as NodeData['nodeType'], meta: isAct ? { urlName: n.urlName, activityType: n.activityType } : { topicId: n.id, status: n.status } } };
          });

        } else {
          // Patterns are sequential — lay the activities out as an ordered
          // left-to-right chain so participants see exactly what will happen.
          centerNode = {
            id: 'center', type: 'center', position: { x: -48, y: -48 },
            data: { label: item.title, nodeType: 'pattern', meta: { id: item.id, description: item.thesis || item.description, authorName: item.authorName, sequenceId: item.sequenceId } },
          };
          const seqData = item.sequenceId ? await SequenceService.getSequence(item.sequenceId).catch(() => null) : null;
          const seqActs = seqData?.activities ?? [];
          radialNodes = seqActs.map((sa: any, i: number) => ({
            id: sa.activityId || `act-${i}`, type: 'radial' as const,
            position: { x: 190 + i * 215, y: -27 },
            data: { label: sa.activity?.title ?? sa.activityId, nodeType: 'activity' as const, meta: { urlName: sa.activity?.urlName, activityType: sa.activity?.activityType, subtitle: `Step ${i + 1} of ${seqActs.length}` } },
          }));
        }

        // Empty drill → ghost CTA node instead of a lonely center dot
        if (radialNodes.length === 0 && view !== 'patterns') {
          const stake = `${HOLON_SYMBOL}${config?.holons?.activityStakeAmount ?? 5}`;
          const href = view === 'topics'
            ? (item.status === 'confirmed' ? `/create/activity?topicId=${item.id}` : null)
            : `/create/activity?frameId=${item.id}`;
          if (href && userId) {
            radialNodes = [{
              id: 'ghost-create', type: 'radial' as const, position: { x: 190, y: -20 },
              data: { label: `＋ Start the first ${STR.map.toLowerCase()} (${stake} stake)`, nodeType: 'activity' as const, meta: { ghost: true, href } },
            }];
          }
        }

        const newEdges: Edge[] = view === 'patterns'
          ? radialNodes.map((n, i) => ({
              id: `e-${n.id}`,
              source: i === 0 ? 'center' : radialNodes[i - 1].id,
              target: n.id,
              sourceHandle: 'out-r', targetHandle: 'in-l',
              type: 'straight',
              style: { stroke: 'rgba(15,13,11,0.3)', strokeWidth: 1.25 },
              markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(15,13,11,0.45)', width: 15, height: 15 },
              animated: false,
            }))
          : radialNodes.map(n => ({
              id: `e-${n.id}`, source: 'center', target: n.id,
              sourceHandle: 'out-c', targetHandle: 'in-c',
              type: 'straight',
              style: { stroke: 'rgba(15,13,11,0.24)', strokeWidth: 1 },
              animated: false,
            }));

        setNodes([centerNode, ...radialNodes]);
        setEdges(newEdges);
        const fitKey = `drill:${view}:${selectedId}`;
        if (lastFitKey.current !== fitKey) {
          lastFitKey.current = fitKey;
          setTimeout(() => fitView({ padding: 0.18, duration: 450 }), 80);
        }
      } finally { setLoadingGraph(false); }
    })();
  }, [selectedId, graphMode, view, items, userId, setNodes, setEdges, fitView]);

  // One click = info. Every node opens its popup immediately; drilling is an
  // explicit "Explore →" action inside the popup, never a surprise teardown.
  const handleNodeClick = useCallback((_: any, node: Node) => {
    const n = node as Node<NodeData>;
    if (n.id === 'hub') return;
    if (n.data.meta?.ghost && n.data.meta.href) {
      router.push(n.data.meta.href as string);
      return;
    }
    // Satellite dot → drill into its parent (the children it represents)
    if (n.type === 'dot' && n.data.meta?.parentId) {
      setSelectedId(n.data.meta.parentId as string);
      setGraphMode('drill');
      setPopupNode(null);
      return;
    }
    setPopupNode(n);
  }, [router]);

  const handleListItemClick = (id: string) => {
    setSelectedId(id);
    setGraphMode('drill');
    setShowCreate(false);
    if (isMobile) setSidebarOpen(false);
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

  const selectedItem = selectedId ? items.find(i => i.id === selectedId) : null;
  const selectedLabel = selectedItem
    ? (view === 'frames' ? `${selectedItem.xLabel} / ${selectedItem.yLabel}` : selectedItem.title)
    : '';
  const totalPages = Math.ceil(sortedItems.length / BROWSE_MAX);
  const sortLabel = SORT_OPTIONS[view].find(o => o.value === sortOrder)?.label.toLowerCase() ?? '';

  const chipCss: React.CSSProperties = {
    fontSize: 'var(--text-2xs)', fontFamily: mono, letterSpacing: '0.06em',
    background: 'var(--bg-secondary)', border: '1px solid var(--border-default)',
    borderRadius: 999, padding: '0.3rem 0.75rem', color: 'var(--text-muted)',
    boxShadow: '0 1px 4px rgba(15,13,11,0.06)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', background: 'var(--bg-primary)' }}>
      <GameNav active={view} />

      <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>

        {/* Mobile overlay backdrop */}
        {isMobile && sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            style={{ position: 'fixed', inset: `${NAV_HEIGHT}px 0 0 0`, zIndex: 90, background: 'rgba(15,13,11,0.25)' }}
          />
        )}

        {/* SIDEBAR — the index */}
        <aside style={{
          width: 276, flexShrink: 0,
          borderRight: '1px solid var(--border-subtle)',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-primary)',
          ...(isMobile ? {
            position: 'fixed', top: NAV_HEIGHT, left: 0, bottom: 0, zIndex: 100,
            transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.22s cubic-bezier(0.4,0,0.2,1)',
            boxShadow: sidebarOpen ? '4px 0 24px rgba(15,13,11,0.08)' : 'none',
          } : {}),
        }}>

          {/* Sort */}
          <div style={{ padding: '0.6rem 1rem 0', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: 'var(--text-2xs)', fontFamily: mono, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' as const, flexShrink: 0 }}>Sort</span>
              <select value={sortOrder} onChange={e => { setSortOrder(e.target.value); setPage(0); }} style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', fontFamily: mono, cursor: 'pointer', outline: 'none' }}>
                {SORT_OPTIONS[view].map(o => (
                  <option key={o.value} value={o.value} style={{ background: 'var(--bg-secondary)' }}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* List header + add */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.45rem 1rem 0.25rem 1rem', flexShrink: 0 }}>
            <span style={{ fontSize: 'var(--text-2xs)', fontFamily: mono, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--text-muted)' }}>
              {loadingItems ? '…' : `${sortedItems.length} ${view}`}
            </span>
            {isAuthenticated && (
              <button onClick={() => setShowCreate(v => !v)} title={`Add ${view.slice(0, -1)}`} aria-label={`Add ${view.slice(0, -1)}`} style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, fontSize: 'var(--text-sm)', lineHeight: 1, transition: 'all 0.12s',
                border: `1px solid ${showCreate ? 'var(--accent)' : 'var(--border-default)'}`,
                background: showCreate ? 'var(--accent)' : 'transparent',
                color: showCreate ? '#FFFFFF' : 'var(--text-muted)',
              }}>{showCreate ? '−' : '+'}</button>
            )}
          </div>

          {/* Creation form */}
          {showCreate && isAuthenticated && (
            <CreationForm view={view} userId={userId} onCreated={handleCreated} onClose={() => setShowCreate(false)}
              costs={{
                nominationCost: config?.holons?.nominationCost,
                quorumThreshold: config?.quorum?.topicSupportThreshold,
                windowHours: config?.quorum?.topicWindowHours,
              }}
              existingTopics={view === 'topics' ? items : undefined}
              onPickExisting={handleListItemClick} />
          )}

          {/* Items */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loadingItems && (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', fontSize: 'var(--text-xs)', fontFamily: mono, color: 'var(--text-muted)' }}>loading…</div>
            )}
            {!loadingItems && sortedItems.length === 0 && (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>No {view} yet</div>
            )}
            {sortedItems.map(item => (
              <ListItem key={item.id} item={item} view={view} isSelected={selectedId === item.id} onClick={() => handleListItemClick(item.id)} />
            ))}
          </div>

          {/* Footer: edition info + signed-out CTA */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '0.55rem 1rem', flexShrink: 0 }}>
            {!isAuthenticated && (
              <Link href={`/login?callbackUrl=${encodeURIComponent(`/interview/g${instance?.gameNumber ?? 1}/${view}`)}`} style={{ ...btn('fill'), textDecoration: 'none', display: 'block', textAlign: 'center', marginBottom: '0.45rem' }}>
                Sign in to play
              </Link>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--text-2xs)', fontFamily: mono, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--text-muted)' }}>
                Edition #{instance?.gameNumber ?? 1}
              </span>
              {instance?.gameVersion && (
                <span style={{ fontSize: 'var(--text-2xs)', fontFamily: mono, color: 'var(--text-muted)' }}>
                  v{instance.gameVersion}
                </span>
              )}
            </div>
          </div>
        </aside>

        {/* GRAPH CANVAS — the territory */}
        <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {/* Mobile sidebar toggle */}
          {isMobile && (
            <button
              onClick={() => setSidebarOpen(v => !v)}
              style={{
                position: 'absolute', top: '0.75rem', left: '0.75rem', zIndex: 50,
                height: 34, padding: '0 0.7rem', borderRadius: 8,
                background: 'var(--bg-secondary)', border: '1px solid var(--border-default)',
                color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem',
                fontSize: 'var(--text-2xs)', fontFamily: mono, letterSpacing: '0.08em', textTransform: 'uppercase' as const,
              }}
              aria-label="Toggle index"
            >
              ☰ Index
            </button>
          )}

          {/* Loading overlay */}
          {loadingGraph && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <span style={{ fontSize: 'var(--text-xs)', fontFamily: mono, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>mapping…</span>
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
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="rgba(15,13,11,0.13)" />
          </ReactFlow>

          {/* Popup */}
          {popupNode && (
            <PopupCard
              node={popupNode}
              onClose={() => setPopupNode(null)}
              userId={userId}
              onAction={handleAction}
              holonBalance={holonBalance}
              holonsConfig={config?.holons
                ? { supportCost: config.holons.supportCost, activityStakeAmount: config.holons.activityStakeAmount }
                : null}
              onExplore={graphMode === 'browse' && items.some(i => i.id === popupNode.id)
                ? () => { setSelectedId(popupNode.id); setGraphMode('drill'); setPopupNode(null); }
                : undefined}
              isAdmin={userRole === 'admin'}
            />
          )}

          {/* Breadcrumb (drill mode) */}
          {graphMode === 'drill' && selectedId && (
            <div style={{
              position: 'absolute', top: '0.75rem', left: isMobile ? '7rem' : '0.75rem', zIndex: 50,
              display: 'flex', alignItems: 'center', gap: '0.4rem', maxWidth: 'calc(100% - 8rem)',
              ...chipCss, padding: '0.35rem 0.8rem',
            }}>
              <button
                onClick={() => { setSelectedId(null); setGraphMode('browse'); setPopupNode(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--text-2xs)', fontFamily: mono, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--accent)', padding: 0 }}
              >
                {view}
              </button>
              <span style={{ color: 'var(--text-muted)' }}>▸</span>
              <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{selectedLabel}</span>
            </div>
          )}

          {/* Caption chip + paging (browse mode) — the layout rule, stated */}
          {graphMode === 'browse' && sortedItems.length > 0 && (
            <div style={{ position: 'absolute', bottom: '1.25rem', left: '0.75rem', zIndex: 50, display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' as const }}>
              <span style={chipCss}>
                {page * BROWSE_MAX + 1}–{Math.min((page + 1) * BROWSE_MAX, sortedItems.length)} of {sortedItems.length} {view} · {sortLabel}, clockwise from top{view === 'topics' ? ' · sized by activity' : ''}
              </span>
              {totalPages > 1 && (
                <>
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                    style={{ ...chipCss, cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.4 : 1 }}>‹</button>
                  <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                    style={{ ...chipCss, cursor: page >= totalPages - 1 ? 'default' : 'pointer', opacity: page >= totalPages - 1 ? 0.4 : 1 }}>
                    +{Math.max(0, sortedItems.length - (page + 1) * BROWSE_MAX)} more ›
                  </button>
                </>
              )}
            </div>
          )}

          {/* Legend */}
          <div style={{ position: 'absolute', bottom: '1.25rem', right: '0.75rem', zIndex: 50, display: 'flex', gap: '0.35rem' }}>
            {[
              { c: 'var(--node-topic)', label: `${STR.topic} / ${STR.map}` },
              { c: 'var(--node-frame)', label: STR.frame },
              { c: 'var(--node-pattern)', label: STR.pattern },
            ].map(l => (
              <span key={l.label} style={{ ...chipCss, display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.6rem' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: l.c, display: 'inline-block' }} />
                {l.label}
              </span>
            ))}
          </div>
        </main>
      </div>

      <Toasts />
      <FirstVisitOverlay />
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function InterViewHub({ view }: { view: HubView }) {
  return (
    <ReactFlowProvider>
      <HubInner view={view} />
    </ReactFlowProvider>
  );
}
