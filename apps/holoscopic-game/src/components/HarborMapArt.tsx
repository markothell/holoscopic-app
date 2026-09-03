/**
 * The circle home map, as a still — a preview of the real interface on the
 * /circles lander, the way the interView lander previews its graph.
 *
 * NOT A DIAGRAM ABOUT THE PRODUCT. Every mark here is the mark
 * apps/circles/src/components/CircleMap.tsx makes, and the geometry is that
 * component's own `layout()` run over the `harbor` sample circle from
 * apps/backend/scripts/seed-circles-dev.js — nine members, three finished
 * explorations at 9/9, 5/9 and 2/9, one live topic mid-sort, two solo
 * explorations and two open nominations. Harbor exists to be the map demo;
 * this is that demo, frozen.
 *
 * Coordinates are precomputed rather than derived at render time. The layout
 * is a centroid pull plus forty relaxation passes, which is not something to
 * re-run in a marketing page, and hard numbers cannot drift from the sample
 * data by accident — if harbor changes, this is regenerated, not patched.
 *
 * The grammar, so a change here stays honest to the app:
 *   · No ring is stroked. Seats sit on an implicit ring and imply it.
 *   · The faint circle in the middle is the toono, at r54 of a 150 ring.
 *   · A seat is a `card` disc carrying initials, edged `rule-strong`, with
 *     its name under it — above it near the top, where a label below would
 *     sit in the path of that member's own edges.
 *   · What the group made together is a `shared` disc inside `rope`, sized
 *     by how much of the circle took part, sitting toward the members who
 *     did, with a `rule-strong` edge back to each of them.
 *   · A solo or open exploration is a short `ochre` spur pointing outward
 *     from its member, with nothing at its end.
 *   · `sky` marks what is live and nothing else. There is exactly one live
 *     node, and it carries no edges — a visitor is not a member of harbor,
 *     and the map never shows who has spoken in a round still running.
 */

const CARD = '#FDFAF4';
const INK_SOFT = '#6D5E4A';
const INK_FAINT = '#9C8D75';
const SHARED = '#EDE3D0';
const ROPE = '#B49A6E';
const OCHRE = '#C08A3E';
const SKY = '#3D7FB5';
const RULE = 'rgba(58, 46, 32, 0.14)';
const RULE_STRONG = 'rgba(58, 46, 32, 0.30)';

const DISPLAY = '"Iowan Old Style", Palatino, Georgia, serif';
const BODY = 'Seravek, "Gill Sans", "Trebuchet MS", system-ui, sans-serif';

const MEMBER_R = 24;
const TOONO_R = 54;
const C = 220;

// [name, initials, x, y, labelY]
const SEATS: [string, string, number, number, number][] = [
  ['Mara', 'Ma', 220, 70, 38],
  ['Ivo', 'Iv', 316.42, 105.09, 73.09],
  ['Nell', 'Ne', 367.72, 193.95, 230.95],
  ['Tomas', 'To', 349.9, 295, 332],
  ['June', 'Ju', 271.3, 360.95, 397.95],
  ['Priya', 'Pr', 168.7, 360.95, 397.95],
  ['Owen', 'Ow', 90.1, 295, 332],
  ['Sana', 'Sa', 72.28, 193.95, 230.95],
  ['Felix', 'Fe', 123.58, 105.09, 73.09],
];

// [topic, x, y, r, live, seat indexes that took part]
const NODES: [string, number, number, number, boolean, number[]][] = [
  ['Being needed', 191.93, 209.79, 23, false, [0, 1, 2, 3, 4, 5, 6, 7, 8]],
  ['Arriving late', 271.2, 206.07, 16.33, false, [0, 1, 2, 3, 4]],
  ['Lending money', 176, 272.69, 11.33, false, [5, 6]],
  ['Being watched at work', 236.8, 234.04, 18, true, []],
];

// [topic, x1, y1, x2, y2]
const SPURS: [string, number, number, number, number][] = [
  ['Walking out of a job', 394.31, 189.26, 412.04, 186.14],
  ['Keeping a secret', 45.69, 189.26, 27.96, 186.14],
  ['Family dinners', 66.71, 308.5, 51.13, 317.5],
  ['Old friendships', 106.23, 84.41, 94.66, 70.62],
];

export default function HarborMapArt({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 20 440 390.95"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="A circle of nine seen whole: three explorations the group finished together, one running now, and four one member has opened alone"
    >
      <style>{`
        .hm-live { transform-box: fill-box; transform-origin: center;
                   animation: hm-pulse 2.6s ease-out infinite; }
        @keyframes hm-pulse {
          0%   { transform: scale(1);   opacity: .45; }
          70%, 100% { transform: scale(1.6); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .hm-live { animation: none; opacity: 0; }
        }
      `}</style>

      {/* the toono: the crown the group's work converges on */}
      <circle cx={C} cy={C} r={TOONO_R} fill="none" stroke={RULE} strokeWidth="1" />

      {/* edges first, under everything */}
      <g stroke={RULE_STRONG} strokeWidth="1">
        {NODES.flatMap(([topic, x, y, , , edges]) =>
          edges.map(i => (
            <line key={`${topic}-${i}`} x1={SEATS[i][2]} y1={SEATS[i][3]} x2={x} y2={y} />
          )),
        )}
      </g>

      {/* solo and open explorations: an edge with nothing at its end */}
      {SPURS.map(([topic, x1, y1, x2, y2]) => (
        <line
          key={topic}
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={OCHRE} strokeWidth="2.5" strokeLinecap="round"
        />
      ))}

      {/* what the circle explored together — and the one running now */}
      {NODES.map(([topic, x, y, r, live]) => (
        <g key={topic}>
          {live && (
            <circle className="hm-live" cx={x} cy={y} r={r + 3}
              fill="none" stroke={SKY} strokeWidth="1.5" />
          )}
          <circle
            cx={x} cy={y} r={r}
            fill={live ? CARD : SHARED}
            stroke={live ? SKY : ROPE}
            strokeWidth={live ? 1.8 : 1.2}
          />
        </g>
      ))}

      {/* the members, on the ring */}
      {SEATS.map(([name, initials, x, y, labelY]) => (
        <g key={name}>
          <circle cx={x} cy={y} r={MEMBER_R} fill={CARD} />
          <text
            x={x} y={y + MEMBER_R * 0.28}
            textAnchor="middle"
            fill={INK_SOFT}
            style={{ font: `${Math.round(MEMBER_R * 0.78)}px ${DISPLAY}` }}
          >
            {initials}
          </text>
          <circle cx={x} cy={y} r={MEMBER_R} fill="none" stroke={RULE_STRONG} strokeWidth="1.2" />
          <text
            x={x} y={labelY}
            textAnchor="middle"
            fill={INK_FAINT}
            style={{ font: `10px ${BODY}` }}
          >
            {name}
          </text>
        </g>
      ))}
    </svg>
  );
}
