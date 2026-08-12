/**
 * The circle of circles — the platform's one structural mark.
 *
 * Three layers, and nothing else in the drawing:
 *   1. A base circle is ten people seated around a perimeter, all equal, all
 *      facing a common centre.
 *   2. Ten base circles are arrayed around the circumference of a larger one.
 *   3. That larger circle has neighbours of its own, cropped by the frame — the
 *      cue that the figure keeps going. Without them the drawing stops at two
 *      layers and reads as a diagram of one group; with them it reads as a
 *      pattern.
 *
 * Only one base circle shows its people. The other nine are outlines, and they
 * inherit the reading — which is the point of the claim and the reason the
 * figure stays legible at the size of a card motif.
 *
 * Everything is generated from the geometry rather than typed as coordinates,
 * so the counts are literally the ten and the ten. Two relations hold the
 * drawing together and both break silently if one radius moves alone:
 *   · `R_OUTER = R_RING + R_BASE` seats the base circles tangent inside the
 *     circle that contains them.
 *   · `2·R_BASE < 2·R_RING·sin(π/10)` is what keeps those ten from touching.
 * The neighbours sit at `2·R_OUTER + GAP`, so they clear the outer circle by
 * the same hair the base circles clear each other.
 */

const CX = 210;
const CY = 210;
const R_OUTER = 150;   // the circle they are all in
const R_RING = 116;    // the circumference the base circles are arrayed on
const R_BASE = 34;     // one base circle
const R_SEATS = 21;    // where the people sit inside it
const COUNT = 10;
const GAP = 12;        // between neighbouring circles, at every layer

/** `count` points evenly around a circle, starting at twelve o'clock.
 *
 * Coordinates are quantized to 1/100 SVG unit. This is a hydration
 * requirement, not tidiness: the server's V8 and the browser's disagree about
 * the last bits of `Math.sin`/`Math.cos` (libm differs per build), so raw
 * results serialize to different strings and React reports every dot as a
 * mismatched attribute. */
function around(cx: number, cy: number, r: number, count: number, from = -Math.PI / 2) {
  const q = (v: number) => Math.round(v * 100) / 100;
  return Array.from({ length: count }, (_, i) => {
    const a = from + (i * 2 * Math.PI) / count;
    return [q(cx + r * Math.cos(a)), q(cy + r * Math.sin(a))] as const;
  });
}

export default function CircleOfCirclesArt({
  className,
  preserveAspectRatio = 'xMaxYMid meet',
  ink = '#0F0D0B',
  seat = '#C83B50',
}: {
  className?: string;
  /** `xMidYMid slice` turns the drawing into a crop that fills its box —
   *  the lander's centre strip. The default letter-boxes for the card. */
  preserveAspectRatio?: string;
  ink?: string;
  seat?: string;
}) {
  // The peopled circle sits at the LEFT middle — nine o'clock — where the
  // card's type is, so the one circle with people in it is the one beside
  // the words.
  const bases = around(CX, CY, R_RING, COUNT, Math.PI);
  const [peopled, ...rest] = bases;
  // Hex-packed neighbours, MINUS the one at nine o'clock: five show, and the
  // empty left flank is where the peopled circle faces out of the figure.
  const neighbours = around(CX, CY, 2 * R_OUTER + GAP, 6, 0).filter(
    (_, i) => i !== 3,
  );

  return (
    // The viewBox reaches to x = -100 — past the left extent of the upper- and
    // lower-left neighbours (x ≥ -96) — so no arc is ever cut by the SVG's own
    // frame on the left. Every other cut lands on a viewBox edge that the card
    // positions OFF the card (the art bleeds, like every other card motif), so
    // the frame doing the cutting is the card's, which is the reading: full
    // circles were drawn, and the card ends before they do.
    <svg
      className={className}
      viewBox="-100 0 520 420"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio={preserveAspectRatio}
      role="img"
      aria-label="Ten people seated around a circle; ten such circles arrayed around a larger one; and that larger circle among neighbours of its own, cut off by the frame"
    >
      {/* Layer three: whole circles the size of the middle one, drawn with its
          exact line and fill, cut off by the frame — the frame is what says
          the pattern continues, so the circles themselves must look fully
          drawn rather than lighter or sketched. */}
      {neighbours.map(([x, y], i) => (
        <circle
          key={`n${i}`}
          cx={x}
          cy={y}
          r={R_OUTER}
          fill={ink}
          fillOpacity="0.03"
          stroke={ink}
          strokeOpacity="0.3"
          strokeWidth="2"
        />
      ))}

      <circle
        cx={CX}
        cy={CY}
        r={R_OUTER}
        fill={ink}
        fillOpacity="0.03"
        stroke={ink}
        strokeOpacity="0.3"
        strokeWidth="2"
      />

      {rest.map(([x, y], i) => (
        <circle
          key={`b${i}`}
          cx={x}
          cy={y}
          r={R_BASE}
          fill={ink}
          fillOpacity="0.05"
          stroke={ink}
          strokeOpacity="0.34"
          strokeWidth="1.75"
        />
      ))}

      {/* The one you are in: the only fill in the drawing that carries colour,
          and the only stroke heavy enough to be found at card size. */}
      <circle
        cx={peopled[0]}
        cy={peopled[1]}
        r={R_BASE}
        fill={seat}
        fillOpacity="0.07"
        stroke={ink}
        strokeOpacity="0.62"
        strokeWidth="2.25"
      />
      {around(peopled[0], peopled[1], R_SEATS, COUNT).map(([x, y], i) => (
        <circle key={`s${i}`} cx={x} cy={y} r="3.4" fill={seat} fillOpacity="0.9" />
      ))}
    </svg>
  );
}
