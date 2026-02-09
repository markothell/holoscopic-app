import type { ActivityType } from '@/models/Activity';

interface ActivityTypeIconProps {
  type: ActivityType;
  size?: number;
  className?: string;
}

function DissolveIcon({ size, className }: { size: number; className?: string }) {
  const half = size / 2;
  const arrowLen = size * 0.32;
  const headLen = size * 0.12;
  const gap = size * 0.08;

  // 4 arrows pointing outward from center (diagonal directions)
  const dirs = [
    { dx: 1, dy: -1 },  // top-right
    { dx: -1, dy: -1 }, // top-left
    { dx: -1, dy: 1 },  // bottom-left
    { dx: 1, dy: 1 },   // bottom-right
  ];

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={className} fill="none" stroke="currentColor" strokeWidth={size * 0.06} strokeLinecap="round" strokeLinejoin="round">
      {dirs.map(({ dx, dy }, i) => {
        const norm = Math.SQRT1_2;
        const startX = half + dx * norm * gap;
        const startY = half + dy * norm * gap;
        const endX = half + dx * norm * arrowLen;
        const endY = half + dy * norm * arrowLen;
        // Arrowhead lines
        const h1x = endX - norm * headLen * (dx + dy) * 0.5;
        const h1y = endY - norm * headLen * (-dx + dy) * 0.5;
        const h2x = endX - norm * headLen * (dx - dy) * 0.5;
        const h2y = endY - norm * headLen * (dx + dy) * 0.5;
        return (
          <g key={i}>
            <line x1={startX} y1={startY} x2={endX} y2={endY} />
            <line x1={endX} y1={endY} x2={h1x} y2={h1y} />
            <line x1={endX} y1={endY} x2={h2x} y2={h2y} />
          </g>
        );
      })}
    </svg>
  );
}

function ResolveIcon({ size, className }: { size: number; className?: string }) {
  const half = size / 2;
  const arrowLen = size * 0.32;
  const headLen = size * 0.12;
  const gap = size * 0.08;

  // 4 arrows pointing inward from corners toward center
  const dirs = [
    { dx: 1, dy: -1 },  // from top-right
    { dx: -1, dy: -1 }, // from top-left
    { dx: -1, dy: 1 },  // from bottom-left
    { dx: 1, dy: 1 },   // from bottom-right
  ];

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={className} fill="none" stroke="currentColor" strokeWidth={size * 0.06} strokeLinecap="round" strokeLinejoin="round">
      {dirs.map(({ dx, dy }, i) => {
        const norm = Math.SQRT1_2;
        const startX = half + dx * norm * arrowLen;
        const startY = half + dy * norm * arrowLen;
        const endX = half + dx * norm * gap;
        const endY = half + dy * norm * gap;
        // Arrowhead lines (pointing inward, toward center)
        const h1x = endX + norm * headLen * (dx + dy) * 0.5;
        const h1y = endY + norm * headLen * (-dx + dy) * 0.5;
        const h2x = endX + norm * headLen * (dx - dy) * 0.5;
        const h2y = endY + norm * headLen * (dx + dy) * 0.5;
        return (
          <g key={i}>
            <line x1={startX} y1={startY} x2={endX} y2={endY} />
            <line x1={endX} y1={endY} x2={h1x} y2={h1y} />
            <line x1={endX} y1={endY} x2={h2x} y2={h2y} />
          </g>
        );
      })}
    </svg>
  );
}

export default function ActivityTypeIcon({ type, size = 20, className }: ActivityTypeIconProps) {
  if (type === 'resolve' || type === 'findthecenter') {
    return <ResolveIcon size={size} className={className} />;
  }
  return <DissolveIcon size={size} className={className} />;
}
