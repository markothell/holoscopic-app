/**
 * The model as a journey, in the theme-web idiom: three beats left to right —
 * YOU (one crimson dot) → A CIRCLE (ten seats, yours lit) → A COLLECTIVE
 * (circles gathered around a greater one, yours lit). Quiet grey feeders show
 * the same thing happening to everyone else: dots arriving at the circle,
 * circles arriving at the collective. The crimson is one thread — your seat,
 * carried through all three scales.
 *
 * Pure SVG, no hooks, so it renders from Server Components (the /circles
 * lander) and client pages (the homepage) alike. Two surfaces carry it; a
 * change here changes both.
 */

const ACCENT = '#C83B50';
const INK = '#0F0D0B';

// Quantized like CircleOfCirclesArt, and for the same reason: server and
// browser libm disagree in the last bits of sin/cos, and the difference
// serializes into a hydration mismatch.
const q = (v: number) => Math.round(v * 100) / 100;
const around = (cx: number, cy: number, r: number, count: number, from = -Math.PI / 2) =>
  Array.from({ length: count }, (_, i) => {
    const a = from + (i * 2 * Math.PI) / count;
    return [q(cx + r * Math.cos(a)), q(cy + r * Math.sin(a))] as const;
  });

export default function GatheringArt({ className }: { className?: string }) {
  // Beat 2 — a circle: ten seats, the one facing beat 1 is yours.
  const C2: [number, number] = [240, 150];
  const [yourSeat, ...seats] = around(C2[0], C2[1], 44, 10, Math.PI);

  // Beat 3 — the collective: ten circles around a larger one, the one facing
  // beat 2 is your circle's.
  const C3: [number, number] = [582, 150];
  const [yourCircle, ...memberCircles] = around(C3[0], C3[1], 66, 10, Math.PI);

  const label = {
    fill: ACCENT,
    fontSize: 11,
    fontFamily: 'var(--font-dm-mono), monospace',
    letterSpacing: '1.6',
  } as const;

  return (
    <svg
      className={className}
      viewBox="0 0 720 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="One person joins a circle of ten; circles gather into a collective"
    >
      <defs>
        <marker id="modelArrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill={ACCENT} />
        </marker>
      </defs>

      {/* ── beat 1: you, and the others arriving alongside you ── */}
      <circle cx="46" cy="150" r="5.5" fill={ACCENT} />
      <circle cx="30" cy="112" r="3.5" fill={INK} opacity="0.28" />
      <circle cx="26" cy="188" r="3.5" fill={INK} opacity="0.28" />

      {/* your path in — lit */}
      <path d="M58,150 C100,141 134,141 172,148" stroke={ACCENT} strokeWidth="1.6" fill="none" markerEnd="url(#modelArrow)" />
      {/* others' paths in — quiet */}
      <path d="M148,64 C176,76 194,94 206,110" stroke={INK} strokeOpacity="0.22" strokeWidth="1" fill="none" />
      <path d="M140,232 C170,222 190,206 202,192" stroke={INK} strokeOpacity="0.22" strokeWidth="1" fill="none" />
      <circle cx="142" cy="58" r="3.5" fill={INK} opacity="0.28" />
      <circle cx="134" cy="238" r="3.5" fill={INK} opacity="0.28" />

      {/* ── beat 2: a circle — ten seats, yours lit ── */}
      <circle cx={C2[0]} cy={C2[1]} r="62" fill={INK} fillOpacity="0.03" stroke={INK} strokeOpacity="0.34" strokeWidth="1.75" />
      {seats.map(([x, y], i) => (
        <circle key={`s${i}`} cx={x} cy={y} r="4.5" fill={INK} opacity="0.32" />
      ))}
      <circle cx={yourSeat[0]} cy={yourSeat[1]} r="5.5" fill={ACCENT} />

      {/* your circle's path on — lit */}
      <path d="M312,150 C368,140 428,140 486,148" stroke={ACCENT} strokeWidth="1.6" fill="none" markerEnd="url(#modelArrow)" />

      {/* other circles' paths in — quiet */}
      <path d="M442,66 C470,74 492,82 508,90" stroke={INK} strokeOpacity="0.22" strokeWidth="1" fill="none" />
      <path d="M448,238 C476,230 496,222 512,212" stroke={INK} strokeOpacity="0.22" strokeWidth="1" fill="none" />
      {/* the other circles arriving, seats and all */}
      <circle cx="416" cy="52" r="21" fill={INK} fillOpacity="0.03" stroke={INK} strokeOpacity="0.3" strokeWidth="1.5" />
      {around(416, 52, 13.5, 6).map(([x, y], i) => (
        <circle key={`fa${i}`} cx={x} cy={y} r="2" fill={INK} opacity="0.26" />
      ))}
      <circle cx="420" cy="252" r="21" fill={INK} fillOpacity="0.03" stroke={INK} strokeOpacity="0.3" strokeWidth="1.5" />
      {around(420, 252, 13.5, 6).map(([x, y], i) => (
        <circle key={`fb${i}`} cx={x} cy={y} r="2" fill={INK} opacity="0.26" />
      ))}

      {/* ── beat 3: the collective — circles gathered, yours lit ── */}
      <circle cx={C3[0]} cy={C3[1]} r="88" fill={INK} fillOpacity="0.03" stroke={INK} strokeOpacity="0.34" strokeWidth="1.75" />
      {memberCircles.map(([x, y], i) => (
        <circle key={`m${i}`} cx={x} cy={y} r="18" fill={INK} fillOpacity="0.04" stroke={INK} strokeOpacity="0.3" strokeWidth="1.5" />
      ))}
      <circle cx={yourCircle[0]} cy={yourCircle[1]} r="18" fill={ACCENT} fillOpacity="0.08" stroke={ACCENT} strokeWidth="1.75" />
      {around(yourCircle[0], yourCircle[1], 11.5, 10).map(([x, y], i) => (
        <circle key={`y${i}`} cx={x} cy={y} r="1.8" fill={ACCENT} opacity="0.9" />
      ))}

      {/* ── the three beats, named ── */}
      <text x="46" y="180" textAnchor="middle" {...label}>YOU</text>
      <text x={C2[0]} y="242" textAnchor="middle" {...label}>A CIRCLE</text>
      <text x={C3[0]} y="268" textAnchor="middle" {...label}>A COLLECTIVE</text>
    </svg>
  );
}
