'use client';

import { mono } from '@/lib/ui';

/**
 * Mini labeled 2D grid — a frame IS its geometry. Used as a live preview in
 * the create flow (and matches the frame-focus node in the hub graph).
 */
export default function AxisPreview({ xLabel, xMin, xMax, yLabel, yMin, yMax, size = 170 }: {
  xLabel?: string; xMin?: string; xMax?: string;
  yLabel?: string; yMin?: string; yMax?: string;
  size?: number;
}) {
  const pole: React.CSSProperties = {
    position: 'absolute', fontSize: '0.58rem', fontFamily: mono,
    color: 'var(--text-muted)', whiteSpace: 'nowrap', maxWidth: size * 0.6,
    overflow: 'hidden', textOverflow: 'ellipsis',
  };
  return (
    <div style={{
      width: size, height: size, position: 'relative', flexShrink: 0,
      background: 'var(--bg-secondary)', border: '1px solid var(--border-default)',
      borderRadius: 12, boxShadow: '0 1px 3px rgba(15,13,11,0.05)',
    }}>
      <div style={{ position: 'absolute', left: '50%', top: 12, bottom: 12, width: 1, background: 'var(--border-strong)' }} />
      <div style={{ position: 'absolute', top: '50%', left: 12, right: 12, height: 1, background: 'var(--border-strong)' }} />
      <span style={{ ...pole, top: 6, left: '50%', transform: 'translateX(-50%)' }}>{yMax || yLabel || 'y ↑'}</span>
      <span style={{ ...pole, bottom: 6, left: '50%', transform: 'translateX(-50%)' }}>{yMin || ''}</span>
      <span style={{ ...pole, left: 6, top: '50%', transform: 'translateY(-50%)', maxWidth: size * 0.38 }}>{xMin || ''}</span>
      <span style={{ ...pole, right: 6, top: '50%', transform: 'translateY(-50%)', maxWidth: size * 0.38, textAlign: 'right' }}>{xMax || xLabel || 'x →'}</span>
    </div>
  );
}
