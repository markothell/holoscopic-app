// The Holoscopic wordmark: lowercase Seravek Medium, ink. MO settled the face
// (Seravek over the rounded serif, 2026-08-14); his current lean adds an
// ochre full stop, which WAITS for his final pick — hold this at plain ink
// until the branding session relays the wordmark + circle-mark pair. The ring
// lives beside the letters as a separate mark, never inside them (DESIGN.md
// rule 4).
export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span
      style={{
        font: `500 ${size}px Seravek, "Gill Sans", "Trebuchet MS", system-ui, sans-serif`,
        color: 'var(--ink)',
        letterSpacing: '0.005em',
      }}
    >
      holoscopic
    </span>
  );
}
