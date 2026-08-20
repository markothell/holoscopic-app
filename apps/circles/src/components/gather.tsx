'use client';

// The gather activity's shared pieces (PRIMITIVES.md §9, S6–S17): the reveal
// ring every shape's artifact hangs on, the two placement charts, the word
// portrait, and the response card. All SVG is hand-written and colored by
// var(--…) like CircleMap — sky marks what is yours or what is picked, ink
// carries everyone else, and the crown ring stays the signature.

import type { GatherResponse, GatherAxis, Member } from '@/lib/types';

function initials(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---------------------------------------------------------------------------
// The reveal ring (R1) — members on the ring, each response tucked inside at
// its teller's seat, the shape's own visual in the center (S6/S7/S8/S11).
// ---------------------------------------------------------------------------

const SIZE = 300;
const C = SIZE / 2;
const MEMBER_R = 118;
const MARK_R = 88;

export function ResponseRing({ members, responses, center, selectedUserId, dimmedUserIds, onPickUser }: {
  members: Member[];
  responses: GatherResponse[];
  /** The shape's middle: prompt + count, a mini chart, or the portrait. */
  center?: React.ReactNode;
  selectedUserId?: string | null;
  /** Word-filter dimming (S11): marks NOT in the lit set fade. Null = no filter. */
  dimmedUserIds?: Set<string> | null;
  onPickUser?: (userId: string) => void;
}) {
  const byUser = new Map(responses.map(r => [r.userId, r]));
  const angleOf = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, members.length);

  return (
    <figure className="relative mx-auto my-2 w-full max-w-[24rem]">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`${responses.length} responses from ${members.length} members`}>
        <circle cx={C} cy={C} r={MEMBER_R} fill="none" stroke="var(--rule)" strokeWidth="1" />
        {members.map((m, i) => {
          const a = angleOf(i);
          const x = C + MEMBER_R * Math.cos(a);
          const y = C + MEMBER_R * Math.sin(a);
          const r = byUser.get(m.userId);
          const dimmed = Boolean(dimmedUserIds && r && dimmedUserIds.has(m.userId));
          const selected = selectedUserId === m.userId;
          return (
            <g
              key={m.userId}
              onClick={r && onPickUser ? () => onPickUser(m.userId) : undefined}
              style={r && onPickUser ? { cursor: 'pointer' } : undefined}
              opacity={dimmed ? 0.3 : 1}
            >
              <title>{m.username}{r ? '' : ' — nothing yet'}</title>
              <circle
                cx={x} cy={y} r={13}
                fill="var(--card)"
                stroke={selected ? 'var(--ink)' : 'var(--rope)'}
                strokeWidth={selected ? 1.8 : 1.2}
              />
              <text
                x={x} y={y + 3.5} textAnchor="middle"
                fontSize="9" fill="var(--ink-soft)"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                {initials(m.username)}
              </text>
              {r && (
                <circle
                  cx={C + MARK_R * Math.cos(a)}
                  cy={C + MARK_R * Math.sin(a)}
                  r={selected ? 7 : 6}
                  fill={r.isMine ? 'var(--sky)' : 'var(--ink-soft)'}
                  stroke={selected ? 'var(--ink)' : 'var(--card)'}
                  strokeWidth={selected ? 1.5 : 1}
                />
              )}
            </g>
          );
        })}
      </svg>
      {center && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="pointer-events-auto max-w-[46%] text-center">{center}</div>
        </div>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// R2 — the one-axis stack: one response, one dot; five columns because the
// input was five stops (S2); spread is visible mass, not a statistic.
// ---------------------------------------------------------------------------

export const STOP_COUNT = 5;
export const stopOf = (x: number) => Math.max(0, Math.min(STOP_COUNT - 1, Math.round(x * (STOP_COUNT - 1))));
export const stopX = (stop: number) => stop / (STOP_COUNT - 1);

export function StackChart({ responses, axis, selectedUserId, onPickUser, compact = false }: {
  responses: GatherResponse[];
  axis: GatherAxis;
  selectedUserId?: string | null;
  onPickUser?: (userId: string) => void;
  compact?: boolean;
}) {
  const placed = responses.filter(r => r.position);
  const bins: GatherResponse[][] = Array.from({ length: STOP_COUNT }, () => []);
  for (const r of placed) bins[stopOf(r.position!.x)].push(r);
  const tallest = Math.max(1, ...bins.map(b => b.length));

  const W = 300;
  const H = compact ? 70 : Math.min(160, 46 + tallest * 14);
  const PAD = compact ? 14 : 24;
  const lineY = H - (compact ? 12 : 22);
  const dotR = compact ? 3.5 : 5;
  const step = dotR * 2 + 3;
  const colX = (i: number) => PAD + (i * (W - 2 * PAD)) / (STOP_COUNT - 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img"
      aria-label={`${placed.length} marks between ${axis.poleA} and ${axis.poleB}`}>
      <line x1={PAD - 6} y1={lineY} x2={W - PAD + 6} y2={lineY} stroke="var(--rule-strong)" strokeWidth="1.5" />
      {bins.map((bin, i) => (
        <g key={i}>
          {!compact && <line x1={colX(i)} y1={lineY - 3} x2={colX(i)} y2={lineY + 3} stroke="var(--rule-strong)" />}
          {bin.map((r, j) => (
            <circle
              key={r.id}
              cx={colX(i)}
              cy={lineY - dotR - 2 - j * step}
              r={selectedUserId === r.userId ? dotR + 1.5 : dotR}
              fill={r.isMine ? 'var(--sky)' : 'var(--ink-soft)'}
              stroke={selectedUserId === r.userId ? 'var(--ink)' : 'none'}
              onClick={onPickUser ? () => onPickUser(r.userId) : undefined}
              style={onPickUser ? { cursor: 'pointer' } : undefined}
            >
              <title>{r.username}</title>
            </circle>
          ))}
        </g>
      ))}
      {!compact && (
        <>
          <text x={PAD - 6} y={H - 4} fontSize="11" fill="var(--pole-a)" style={{ fontFamily: 'var(--font-body)' }}>{axis.poleA}</text>
          <text x={W - PAD + 6} y={H - 4} fontSize="11" fill="var(--pole-b)" textAnchor="end" style={{ fontFamily: 'var(--font-body)' }}>{axis.poleB}</text>
        </>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// R3 — the two-axis dot map. Cluster size carries the group's take (S8): near
// marks merge into one node sized by count — the circle map's participation
// move — and there is deliberately no spread ellipse.
// ---------------------------------------------------------------------------

const GRID_BINS = 6;

export function DotMap({ responses, axes, selectedUserId, onPickUser, compact = false }: {
  responses: GatherResponse[];
  axes: GatherAxis[];
  selectedUserId?: string | null;
  onPickUser?: (userIds: string[]) => void;
  compact?: boolean;
}) {
  const placed = responses.filter(r => r.position);
  const clusters = new Map<string, GatherResponse[]>();
  for (const r of placed) {
    const bx = Math.min(GRID_BINS - 1, Math.floor(r.position!.x * GRID_BINS));
    const by = Math.min(GRID_BINS - 1, Math.floor(r.position!.y * GRID_BINS));
    const key = `${bx}:${by}`;
    clusters.set(key, [...(clusters.get(key) ?? []), r]);
  }

  const W = 300;
  const PAD = compact ? 8 : 30;
  const span = W - 2 * PAD;
  // y is stored bottom-up ([0,1] with poleA at x=0); screen y flips.
  const sx = (x: number) => PAD + x * span;
  const sy = (y: number) => PAD + (1 - y) * span;

  const [xAxis, yAxis] = axes;

  return (
    <svg viewBox={`0 0 ${W} ${W}`} className="block w-full" role="img"
      aria-label={`${placed.length} marks on the grid`}>
      <rect x={PAD} y={PAD} width={span} height={span} rx="10" fill="var(--ground)" stroke="var(--rule)" />
      <line x1={C} y1={PAD} x2={C} y2={W - PAD} stroke="var(--rule-strong)" strokeDasharray="3 4" />
      <line x1={PAD} y1={C} x2={W - PAD} y2={C} stroke="var(--rule-strong)" strokeDasharray="3 4" />
      {[...clusters.values()].map(group => {
        const cx = sx(group.reduce((s, r) => s + r.position!.x, 0) / group.length);
        const cy = sy(group.reduce((s, r) => s + r.position!.y, 0) / group.length);
        const mine = group.some(r => r.isMine);
        const selected = Boolean(selectedUserId && group.some(r => r.userId === selectedUserId));
        const r0 = (compact ? 4 : 6) + (compact ? 2 : 3.2) * Math.sqrt(group.length - 1);
        return (
          <g
            key={group[0].id}
            onClick={onPickUser ? () => onPickUser(group.map(g => g.userId)) : undefined}
            style={onPickUser ? { cursor: 'pointer' } : undefined}
          >
            <title>{group.map(g => g.username).join(', ')}</title>
            <circle
              cx={cx} cy={cy} r={r0}
              fill={mine ? 'var(--sky)' : 'var(--ink-soft)'}
              stroke={selected ? 'var(--ink)' : 'var(--card)'}
              strokeWidth={selected ? 1.8 : 1}
            />
            {group.length > 1 && !compact && (
              <text x={cx} y={cy + 3} textAnchor="middle" fontSize="9" fill="var(--card)"
                style={{ fontFamily: 'var(--font-body)' }}>{group.length}</text>
            )}
          </g>
        );
      })}
      {!compact && xAxis && (
        <>
          <text x={PAD} y={W - 8} fontSize="11" fill="var(--pole-a)" style={{ fontFamily: 'var(--font-body)' }}>{xAxis.poleA}</text>
          <text x={W - PAD} y={W - 8} fontSize="11" fill="var(--pole-b)" textAnchor="end" style={{ fontFamily: 'var(--font-body)' }}>{xAxis.poleB}</text>
          {yAxis && (
            <>
              <text x={W / 2} y={PAD - 10} fontSize="11" fill="var(--pole-b)" textAnchor="middle" style={{ fontFamily: 'var(--font-body)' }}>{yAxis.poleB}</text>
              <text x={W / 2} y={W - 8} fontSize="11" fill="var(--pole-a)" textAnchor="middle" style={{ fontFamily: 'var(--font-body)' }}>{yAxis.poleA}</text>
            </>
          )}
        </>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// R5 — the portrait: words sized by count. Lives in the ring's center (S11);
// tapping a word lights its pickers on the ring.
// ---------------------------------------------------------------------------

export function Portrait({ words, activeWordId, onPickWord, compact = false }: {
  words: { id: string; label: string; count: number }[];
  activeWordId?: string | null;
  onPickWord?: (id: string) => void;
  compact?: boolean;
}) {
  if (words.length === 0) return null;
  const top = Math.max(...words.map(w => w.count));
  const size = (count: number) => {
    const t = top <= 1 ? 1 : (count - 1) / (top - 1);
    return (compact ? 12 : 15) + t * (compact ? 10 : 15);
  };
  return (
    <p className="text-center leading-snug" style={{ fontFamily: 'var(--font-display)' }}>
      {words.map(w => (
        <button
          key={w.id}
          type="button"
          onClick={onPickWord ? () => onPickWord(w.id) : undefined}
          aria-pressed={activeWordId === w.id}
          className="mx-1 inline-block align-baseline"
          style={{
            fontSize: `${size(w.count)}px`,
            fontFamily: 'inherit',
            color: activeWordId === w.id ? 'var(--sky)' : w.count === 1 ? 'var(--ink-faint)' : 'var(--ink)',
            cursor: onPickWord ? 'pointer' : 'default',
          }}
          title={`${w.count} ${w.count === 1 ? 'member' : 'members'}`}
        >
          {w.label}
        </button>
      ))}
    </p>
  );
}

// ---------------------------------------------------------------------------
// One response, readable — and therefore reactable (S14). The reaction mark
// is a small ring that fills once yours is given (S17).
// ---------------------------------------------------------------------------

export function ResponseCard({ response, canReact, onReact, highlight = false }: {
  response: GatherResponse;
  /** False hides the control entirely — off asks, sealed-before-reveal, dots
   *  with nothing readable (S15), words (S16). */
  canReact: boolean;
  onReact?: (shareId: string) => void;
  highlight?: boolean;
}) {
  const r = response;
  return (
    <div
      className="rounded-lg p-3"
      style={{ background: highlight ? 'var(--shared)' : 'transparent' }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold">{r.isMine ? 'You' : r.username}</span>
        {canReact && (
          <button
            type="button"
            onClick={onReact && !r.isMine ? () => onReact(r.id) : undefined}
            disabled={r.isMine}
            aria-pressed={r.iReacted}
            aria-label={r.isMine ? 'Your own — reactions are for the others' : r.iReacted ? 'Take your reaction back' : 'React'}
            title={r.isMine ? 'Your own story does not need your reaction' : undefined}
            className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-soft disabled:cursor-default"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <circle cx="7" cy="7" r="5.5" fill={r.iReacted ? 'var(--sky)' : 'none'}
                stroke={r.iReacted ? 'var(--sky)' : 'var(--rope)'} strokeWidth="1.5" />
            </svg>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.reactionCount > 0 ? r.reactionCount : ''}</span>
          </button>
        )}
      </div>
      {r.title && <p className="mt-1 text-[15px] font-semibold">{r.title}</p>}
      {r.text && <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed">{r.text}</p>}
      {r.audio && <audio controls preload="none" src={r.audio.url} className="mt-2 w-full" />}
      {!r.text && r.transcript?.status === 'ready' && r.transcript.text && (
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{r.transcript.text}</p>
      )}
      {r.words.length > 0 && (
        <p className="mt-1.5 flex flex-wrap gap-1.5">
          {r.words.map(w => (
            <span key={w.id} className="rounded-full border border-[var(--rule-strong)] px-2.5 py-0.5 text-sm"
              style={{ fontFamily: 'var(--font-display)' }}>{w.label}</span>
          ))}
        </p>
      )}
    </div>
  );
}
