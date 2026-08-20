'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import type { Circle, Member, Seed, SeedParticipation } from '@/lib/types';
import { SYNTHESIS_URL } from '@/services/api';

// The circle home map: the circle drawn as a circle — the product's hero surface,
// in the Toono skin. Members sit on a ring, all equal, all facing a common
// centre. What the group explored TOGETHER gathers in the middle, one node per
// finished topic, sized by how much of the circle took part and positioned
// toward the members who did. What a member explored ALONE is a short ochre
// spur pointing outward from them — an edge with no circle at its end. The
// faint ring behind the middle is the toono itself: the crown everything
// converges on.
//
// Color rules (DESIGN.md): sky marks the live topic and nothing else; ochre is
// the solo mark; everything finished wears felt and rope.
//
// Everything here is render-time geometry over the snapshot plus
// `participation` (server-redacted) — the map can never leak an identity
// because it never receives one it may not show. The live topic appears at
// most as a count; the only edge it can carry is your own.
//
// The layout is deterministic: same snapshot, same picture. No force
// simulation — a centroid pull plus a few relaxation passes is enough at
// circle scale, and a map that jiggles between visits would read as the group
// having moved when nobody has.

const SIZE = 440;
const C = SIZE / 2;
const RING_R = 150;

interface CenterNode {
  seed: Seed;
  x: number;
  y: number;
  r: number;
  live: boolean;
  /** Member ids to draw edges to (attributed tellers, or just me on the live one). */
  edges: string[];
  count: number | null;
}

interface Spur {
  seed: Seed;
  memberId: string;
  x1: number; y1: number;
  x2: number; y2: number;
  /** Accepted into the queue and waiting its turn — drawn as a small ochre
   *  circle at the open end. A bare edge is one person's, still unanswered;
   *  the dot is the group having said yes to it. */
  queued: boolean;
}

function memberAngle(i: number, n: number): number {
  return -Math.PI / 2 + (2 * Math.PI * i) / Math.max(n, 1);
}

function layout(members: Member[], seeds: Seed[], participation: SeedParticipation[], liveSeedId: string | null, myUserId: string | null) {
  const n = members.length;
  const memberR = n <= 1 ? 24 : Math.min(24, Math.max(14, RING_R * Math.sin(Math.PI / n) * 0.62));
  const pos = new Map(members.map((m, i) => {
    const a = memberAngle(i, n);
    return [m.userId, { x: C + RING_R * Math.cos(a), y: C + RING_R * Math.sin(a), a }] as const;
  }));
  const partBySeed = new Map(participation.map(p => [p.seedId, p]));

  const nodes: CenterNode[] = [];
  const spurs: Spur[] = [];
  const spursByMember = new Map<string, number>();

  for (const seed of seeds) {
    const part = partBySeed.get(seed.id);
    const done = seed.phase === 'revealed' || seed.phase === 'skipped';
    const live = seed.id === liveSeedId;
    // Anything not yet started is on the map (2026-08-20), where it used to be
    // hidden until it ran. A nominated document is readable and contributable
    // the moment it is shared, so leaving it off would hide the thing people
    // are meant to act on — and once that is true for a nomination, a queued
    // topic sitting in the same list has the same claim. Together they read as
    // what the group has been offered.
    //
    // PROVISIONAL. A large queue draws a lot of spurs, and how many to show is
    // the ring grammar's question, not this line's.
    const waiting = seed.phase === 'nominated' || seed.phase === 'pending';
    if (!done && !live && !waiting) continue;
    if (!part && !waiting) continue;

    // One person's, so far: their solo exploration, a short edge with no
    // circle at its end, pointing away from the centre. A finished topic only
    // one member told reads this way, and so does a freshly shared document —
    // in both cases nobody has joined you yet, which is one fact and gets one
    // mark. A shared document nobody has touched at all hangs off its author.
    const tellers0 = part && part.tellerIds ? part.tellerIds : [];
    const soloId = waiting && tellers0.length === 0
      ? seed.authorId
      : (tellers0.length === 1 ? tellers0[0] : null);
    if ((done || waiting) && soloId) {
      const p = pos.get(soloId);
      if (!p) continue;
      const k = spursByMember.get(soloId) ?? 0;
      spursByMember.set(soloId, k + 1);
      // Fan multiple solos around the outward direction: 0, +0.42, −0.42, …
      const fan = (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * 0.42;
      const dir = p.a + fan;
      spurs.push({
        seed,
        memberId: soloId,
        x1: p.x + (memberR + 3) * Math.cos(dir),
        y1: p.y + (memberR + 3) * Math.sin(dir),
        x2: p.x + (memberR + 21) * Math.cos(dir),
        y2: p.y + (memberR + 21) * Math.sin(dir),
        queued: seed.phase === 'pending',
      });
      continue;
    }

    if (done && tellers0.length === 0) continue; // nothing was told
    if (!part) continue;

    const count = part.tellerCount;
    const share = count == null ? 0 : Math.min(1, count / Math.max(n, 1));
    const r = 8 + 15 * share;
    const tellers = (done && part.tellerIds ? part.tellerIds : []).filter(id => pos.has(id));

    // Toward the members who told it: centroid of their seats, pulled toward
    // the middle. Unknown tellers (a live round) sit at the centre.
    let x = C, y = C;
    if (tellers.length > 0) {
      const cx = tellers.reduce((s, id) => s + pos.get(id)!.x, 0) / tellers.length;
      const cy = tellers.reduce((s, id) => s + pos.get(id)!.y, 0) / tellers.length;
      x = C + (cx - C) * 0.5;
      y = C + (cy - C) * 0.5;
    }
    nodes.push({
      seed, x, y, r, live, count,
      edges: live
        ? (part.iTold && myUserId && pos.has(myUserId) ? [myUserId] : [])
        : tellers,
    });
  }

  // Separate overlapping centre nodes. Deterministic: seeded by index, no
  // randomness, and the same input always relaxes to the same picture.
  nodes.forEach((node, i) => {
    node.x += ((i % 3) - 1) * 1.3;
    node.y += ((Math.floor(i / 3) % 3) - 1) * 1.3;
  });
  const maxDist = RING_R - memberR - 12;
  for (let pass = 0; pass < 40; pass++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const min = a.r + b.r + 10;
        if (d < min) {
          const push = (min - d) / 2;
          const ux = dx / d, uy = dy / d;
          a.x -= ux * push; a.y -= uy * push;
          b.x += ux * push; b.y += uy * push;
        }
      }
    }
    for (const node of nodes) {
      const dx = node.x - C, dy = node.y - C;
      const d = Math.hypot(dx, dy);
      const limit = maxDist - node.r;
      if (d > limit) {
        node.x = C + (dx / d) * limit;
        node.y = C + (dy / d) * limit;
      }
    }
  }

  // Tight vertical extents: a three-person ring fills the top of the square
  // and nothing the bottom, and a figure box sized to the square leaves a
  // dead band before whatever follows. Width stays full so the ring stays
  // centred.
  let minY = SIZE, maxY = 0;
  for (const m of members) {
    const p = pos.get(m.userId)!;
    minY = Math.min(minY, p.y - memberR - (Math.sin(p.a) < -0.5 ? 18 : 0));
    maxY = Math.max(maxY, p.y + memberR + 18); // room for the name label
  }
  for (const node of nodes) {
    minY = Math.min(minY, node.y - node.r - 8); // room for the pulse ring
    maxY = Math.max(maxY, node.y + node.r + 8);
  }
  for (const s of spurs) {
    minY = Math.min(minY, s.y1, s.y2);
    maxY = Math.max(maxY, s.y1, s.y2);
  }
  const viewY = Math.max(0, minY - 8);
  const viewH = Math.min(SIZE, maxY + 8) - viewY;

  return { memberR, pos, nodes, spurs, viewY, viewH };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function CircleMap({ circle, userId }: {
  circle: Circle;
  userId: string | null;
}) {
  const { members, seeds, participation, liveSeedId } = circle;
  const base = `/c/${circle.urlName}`;

  const geo = useMemo(
    () => layout(members, seeds, participation ?? [], liveSeedId, userId),
    [members, seeds, participation, liveSeedId, userId],
  );

  // A shared synthesis document is an ordinary seed now (2026-08-20), so this
  // asks the honest question instead of sniffing a 'syn-' id prefix off a seed
  // the map used to invent for itself.
  const isSession = (seed: Seed) => seed.activity === 'synthesis';
  // A document opens in Synthesis, named by its code so the link lands on the
  // document rather than on whichever map the reader had open last. A gather
  // ask has its own surface; everything else is a Threshold topic.
  const hrefFor = (seed: Seed) => (isSession(seed)
    ? (seed.payload.ideaCode ? `${SYNTHESIS_URL}/?idea=${seed.payload.ideaCode}` : SYNTHESIS_URL)
    : seed.activity === 'gather'
      ? `${base}/activity/${seed.id}`
      : `${base}/topic/${seed.id}`);

  // Drilling into a topic is an in-app move, so it goes through the router like
  // every other link in circles. A bare <a> here would be a full document load,
  // and then the browser Back off it is a cold page load rather than a router
  // transition — you land on a half-drawn circle home. Synthesis lives on
  // another origin, so that one stays a real anchor.
  const SeedLink = ({ seed, label, children }: {
    seed: Seed; label: string; children: React.ReactNode;
  }) =>
    isSession(seed)
      ? <a href={hrefFor(seed)} aria-label={label}>{children}</a>
      : <Link href={hrefFor(seed)} aria-label={label}>{children}</Link>;

  if (members.length === 0) return null;

  return (
    <figure className="mx-auto my-2 w-full max-w-[26rem]">
      <svg
        viewBox={`0 ${geo.viewY} ${SIZE} ${geo.viewH}`}
        role="img"
        aria-label={`${circle.title}: ${members.length} members, ${geo.nodes.length + geo.spurs.length} explorations`}
        className="cm block h-auto w-full"
      >
        <style>{`
          .cm .cm-fade { opacity: 0; animation: cm-fade .5s ease forwards; }
          .cm .cm-edge { stroke-dasharray: 1; stroke-dashoffset: 1; animation: cm-draw .7s ease .25s forwards; }
          @keyframes cm-fade { to { opacity: 1; } }
          @keyframes cm-draw { to { stroke-dashoffset: 0; } }
          .cm .cm-pulse {
            transform-box: fill-box; transform-origin: center;
            animation: cm-pulse 2.6s ease-out infinite;
          }
          @keyframes cm-pulse {
            0% { transform: scale(1); opacity: .45; }
            70%, 100% { transform: scale(1.6); opacity: 0; }
          }
          @media (prefers-reduced-motion: reduce) {
            .cm .cm-fade { animation: none; opacity: 1; }
            .cm .cm-edge { animation: none; stroke-dashoffset: 0; }
            .cm .cm-pulse { animation: none; opacity: 0; }
          }
          .cm a:focus-visible .cm-hit, .cm a:hover .cm-hit { stroke: var(--ink); }
          .cm a:focus-visible { outline: none; }
        `}</style>

        {/* The toono: the faint crown ring the group's work converges on. */}
        <circle
          className="cm-fade"
          cx={C} cy={C} r={54}
          fill="none" stroke="var(--rule)" strokeWidth="1"
        />

        {/* Edges first, under everything. */}
        <g stroke="var(--rule-strong)" strokeWidth="1">
          {geo.nodes.flatMap(node =>
            node.edges.map(memberId => {
              const p = geo.pos.get(memberId)!;
              return (
                <line
                  key={`${node.seed.id}-${memberId}`}
                  className="cm-edge"
                  pathLength={1}
                  x1={p.x} y1={p.y} x2={node.x} y2={node.y}
                />
              );
            }),
          )}
        </g>

        {/* Solo explorations: a short ochre edge with no circle at its end. */}
        {geo.spurs.map(spur => (
          <SeedLink
            key={spur.seed.id}
            seed={spur.seed}
            label={`${spur.seed.payload.topic} — explored alone`}
          >
            <title>{spur.seed.payload.topic}{isSession(spur.seed) ? ' · synthesis' : ''}</title>
            <line
              className="cm-fade cm-hit"
              x1={spur.x1} y1={spur.y1} x2={spur.x2} y2={spur.y2}
              stroke="var(--ochre)" strokeWidth="2.5" strokeLinecap="round"
            />
            {/* Queued: the group said yes and it is waiting its turn. */}
            {spur.queued && (
              <circle cx={spur.x2} cy={spur.y2} r={3.5} fill="var(--ochre)" />
            )}
            <line
              x1={spur.x1} y1={spur.y1} x2={spur.x2} y2={spur.y2}
              stroke="transparent" strokeWidth="14"
            />
          </SeedLink>
        ))}

        {/* Shared explorations: sized by how much of the circle took part.
            The live one wears the sky — the only sky on the page. */}
        {geo.nodes.map(node => (
          <SeedLink
            key={node.seed.id}
            seed={node.seed}
            label={
              node.live
                ? `${node.seed.payload.topic} — running now`
                : `${node.seed.payload.topic} — ${node.count} of ${members.length} took part`
            }
          >
            <title>
              {node.seed.payload.topic}
              {isSession(node.seed) ? ' · synthesis' : ''}
              {node.live ? ' · running now' : node.count != null ? ` · ${node.count} of ${members.length}` : ''}
            </title>
            {node.live && (
              <circle className="cm-pulse" cx={node.x} cy={node.y} r={node.r + 3}
                fill="none" stroke="var(--sky)" strokeWidth="1.5" />
            )}
            <circle
              className="cm-fade cm-hit"
              cx={node.x} cy={node.y} r={node.r}
              fill={node.live ? 'var(--card)' : 'var(--shared)'}
              stroke={node.live ? 'var(--sky)' : 'var(--rope)'}
              strokeWidth={node.live ? 1.8 : 1.2}
            />
          </SeedLink>
        ))}

        {/* The members, on the ring. */}
        {members.map(m => {
          const p = geo.pos.get(m.userId)!;
          const me = m.userId === userId;
          return (
            <g key={m.userId} className="cm-fade">
              <title>{m.username}</title>
              <circle cx={p.x} cy={p.y} r={geo.memberR} fill="var(--card)" />
              {m.pictureUrl ? (
                <>
                  <clipPath id={`cm-clip-${m.userId}`}>
                    <circle cx={p.x} cy={p.y} r={geo.memberR - 1} />
                  </clipPath>
                  <image
                    href={m.pictureUrl}
                    x={p.x - geo.memberR} y={p.y - geo.memberR}
                    width={geo.memberR * 2} height={geo.memberR * 2}
                    preserveAspectRatio="xMidYMid slice"
                    clipPath={`url(#cm-clip-${m.userId})`}
                  />
                </>
              ) : (
                <text
                  x={p.x} y={p.y + geo.memberR * 0.28}
                  textAnchor="middle"
                  fill="var(--ink-soft)"
                  style={{ font: `${Math.round(geo.memberR * 0.78)}px var(--font-display)` }}
                >
                  {initials(m.username)}
                </text>
              )}
              <circle
                cx={p.x} cy={p.y} r={geo.memberR}
                fill="none"
                stroke={me ? 'var(--ink)' : 'var(--rule-strong)'}
                strokeWidth={me ? 1.8 : 1.2}
              />
              {/* Above the node for members near the top of the ring — a
                  label below them sits in the path of their own edges. */}
              <text
                x={p.x}
                y={Math.sin(p.a) < -0.5 ? p.y - geo.memberR - 8 : p.y + geo.memberR + 13}
                textAnchor="middle"
                fill="var(--ink-faint)"
                style={{ font: '10px var(--font-body)' }}
              >
                {me ? 'you' : m.username.length > 12 ? `${m.username.slice(0, 11)}…` : m.username}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 text-center text-xs text-ink-faint">
        The circle, seen whole — what each has explored, alone and together.
      </figcaption>
    </figure>
  );
}
