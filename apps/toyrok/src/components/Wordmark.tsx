// The wordmark: Toyrok with the first o drawn as a toono — the crown ring,
// two roof-poles crossing it. The board sketch, componentized; DESIGN.md lists
// the real drawing pass as open work. The ring stays ink by default and takes
// the sky only where the surface itself is about what is live.
export function Wordmark({ size = 28 }: { size?: number }) {
  const h = size;
  const w = size * 4.4;
  return (
    <svg
      viewBox="0 0 236 54"
      role="img"
      aria-label="Toyrok"
      style={{ height: h, width: w }}
    >
      <text x="0" y="40" style={{ font: '600 44px "Iowan Old Style", Palatino, Georgia, serif', fill: 'var(--ink)' }}>T</text>
      <g>
        <circle cx="52" cy="26" r="16" fill="none" stroke="var(--ink)" strokeWidth="3.2" />
        <line x1="52" y1="13.5" x2="52" y2="38.5" stroke="var(--ink)" strokeWidth="1.1" />
        <line x1="39.5" y1="26" x2="64.5" y2="26" stroke="var(--ink)" strokeWidth="1.1" />
      </g>
      <text x="74" y="40" style={{ font: '600 44px "Iowan Old Style", Palatino, Georgia, serif', fill: 'var(--ink)' }}>yrok</text>
    </svg>
  );
}
