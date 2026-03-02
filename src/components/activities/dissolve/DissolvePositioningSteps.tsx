'use client';

import { TypePositioningStepsProps } from '@/components/activities/registry';

export default function DissolvePositioningSteps({
  activity,
  step,
  xValue,
  yValue,
  onXChange,
  onYChange,
  objectName,
}: TypePositioningStepsProps) {
  const isXStep = step === 2;
  const question = isXStep ? activity.mapQuestion : (activity.mapQuestion2 || activity.mapQuestion);
  const value = isXStep ? xValue : yValue;
  const onChange = isXStep ? onXChange : onYChange;
  const minLabel = isXStep ? activity.xAxis.min : activity.yAxis.min;
  const maxLabel = isXStep ? activity.xAxis.max : activity.yAxis.max;

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
      <h3 className="text-2xl font-bold text-[#F5F0EB] mb-4" style={{ fontFamily: 'var(--font-barlow), sans-serif', textTransform: 'uppercase' }}>
        {question}
      </h3>
      <div className="bg-[#1A1714] border border-[rgba(215,205,195,0.12)] p-6 rounded-lg">
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          inputMode="none"
          className="w-full h-2 bg-[rgba(215,205,195,0.15)] rounded-lg appearance-none cursor-pointer slider"
        />
        <div className="flex justify-between text-sm font-semibold text-[#A89F96] mt-4" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.65rem' }}>
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      </div>
    </div>
  );
}
