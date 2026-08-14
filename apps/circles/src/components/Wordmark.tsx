// The Holoscopic wordmark: plain lettering in the display face. MO saw a
// ring-in-the-O treatment and rejected it (2026-08-14) — the ring stays the
// signature motif of the SURFACES (the map, empty states, the loading moment)
// and the wordmark stays type. A typographic refinement pass is being mocked
// in the branding session; this is the placeholder until his pick lands.
export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span
      style={{
        font: `600 ${size}px "Iowan Old Style", Palatino, Georgia, serif`,
        color: 'var(--ink)',
        letterSpacing: '0.01em',
      }}
    >
      Holoscopic
    </span>
  );
}
