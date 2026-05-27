'use client';

interface AxisSelectorProps {
  label: string;
  options: string[]; // 2 or 4 labels
  value: number | null; // index into options, or null if unselected
  onChange: (index: number) => void;
  axisDirection: 'horizontal' | 'vertical';
}

export default function AxisSelector({ label, options, value, onChange, axisDirection }: AxisSelectorProps) {
  return (
    <div className="flex flex-col gap-2">
      <span
        className="text-[#7A7068]"
        style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}
      >
        {label}
      </span>
      <div className={`flex gap-2 ${axisDirection === 'vertical' ? 'flex-col' : 'flex-row'}`}>
        {options.map((opt, i) => {
          const selected = value === i;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onChange(i)}
              className="flex-1 px-4 py-3 rounded-lg border transition-all duration-150 text-center"
              style={{
                fontFamily: 'var(--font-cormorant), Georgia, serif',
                fontSize: '1rem',
                fontWeight: selected ? 600 : 400,
                background: selected ? 'rgba(200, 59, 80, 0.12)' : 'rgba(215, 205, 195, 0.06)',
                border: selected ? '1px solid #C83B50' : '1px solid rgba(215, 205, 195, 0.15)',
                color: selected ? '#F5F0EB' : '#7A7068',
                cursor: 'pointer',
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
