'use client';

import { TypePositioningStepsProps } from '@/components/activities/registry-types';
import QuadrantSelector from './QuadrantSelector';

export default function ResolvePositioningSteps({
  activity,
  onXChange,
  onYChange,
  existingRating,
  objectName,
}: TypePositioningStepsProps) {
  return (
    <div className="space-y-4">
      <div className="mb-2">
        <span className="text-sm text-[#7A7068]" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Your perspective:
        </span>
        <p className="text-lg font-semibold text-[#C83B50]" style={{ fontFamily: 'var(--font-cormorant), Georgia, serif' }}>
          {objectName}
        </p>
      </div>
      <QuadrantSelector
        activity={activity}
        onQuadrantSelect={({ x, y }) => {
          onXChange(x);
          onYChange(y);
        }}
        userRating={existingRating}
      />
    </div>
  );
}
