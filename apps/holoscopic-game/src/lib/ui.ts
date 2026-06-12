/**
 * Shared inline-style primitives for game surfaces.
 * One definition of buttons, inputs, and labels — pages stop re-declaring
 * these with drift. Colors and sizes come from the tokens in globals.css.
 */

export const mono = 'var(--font-dm-mono), monospace';

export function btn(variant: 'fill' | 'outline'): React.CSSProperties {
  const base: React.CSSProperties = {
    fontSize: 'var(--text-2xs)', fontFamily: mono, letterSpacing: '0.08em',
    textTransform: 'uppercase', padding: '0.4rem 1rem', borderRadius: 999,
    cursor: 'pointer', display: 'inline-block', lineHeight: 1.5,
  };
  return variant === 'fill'
    ? { ...base, background: 'var(--accent)', border: 'none', color: '#FFFFFF' }
    : { ...base, background: 'transparent', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)' };
}

export const inputCss: React.CSSProperties = {
  width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)',
  borderRadius: 6, padding: '0.45rem 0.65rem', fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)', boxSizing: 'border-box', outline: 'none',
};

export const labelCss: React.CSSProperties = {
  display: 'block', fontSize: 'var(--text-2xs)', fontFamily: mono,
  letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.3rem',
};

export const eyebrowCss: React.CSSProperties = {
  fontSize: 'var(--text-2xs)', fontFamily: mono, letterSpacing: '0.14em',
  textTransform: 'uppercase', color: 'var(--text-muted)',
};

export const cardCss: React.CSSProperties = {
  background: 'var(--bg-secondary)', border: '1px solid var(--border-default)',
  borderRadius: 12, boxShadow: '0 1px 3px rgba(15,13,11,0.05)',
};
