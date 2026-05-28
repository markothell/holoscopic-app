'use client';

import CollapsibleSection from '../../CollapsibleSection';
import type { TypeCreatePanelProps } from '../registry-types';

const s = {
  label: {
    display: 'block' as const,
    fontFamily: 'var(--font-dm-mono), monospace',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: '#6B6560',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.15em',
    marginBottom: '0.5rem',
  },
  input: {
    width: '100%',
    padding: '0.625rem 0.875rem',
    background: 'rgba(255, 255, 255, 0.6)',
    border: '1px solid #D9D4CC',
    borderRadius: '4px',
    color: '#0F0D0B',
    fontFamily: 'var(--font-cormorant), Georgia, serif',
    fontSize: '1rem',
    outline: 'none',
  },
  hint: {
    fontFamily: 'var(--font-dm-mono), monospace',
    fontSize: '0.65rem',
    color: '#6B6560',
    marginTop: '0.25rem',
    letterSpacing: '0.05em',
  },
  error: {
    color: '#C83B50',
    fontSize: '0.8rem',
    marginTop: '0.25rem',
    fontFamily: 'var(--font-cormorant), Georgia, serif',
  },
  radio: {
    width: '1rem',
    height: '1rem',
    accentColor: '#C83B50',
    cursor: 'pointer' as const,
  },
};

export default function ResolveCreatePanel({
  formData,
  setFormData,
  validationErrors,
}: TypeCreatePanelProps) {
  const handleFieldChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <>
      {/* Axis Endpoints */}
      <CollapsibleSection title="Axis Endpoints" defaultOpen={false}>
        <p style={{ fontFamily: 'var(--font-cormorant), Georgia, serif', fontSize: '0.9rem', color: '#6B6560', fontStyle: 'italic', marginBottom: '0.5rem' }}>
          These labels will appear on the quadrant grid selector and results view.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h4 style={{ fontFamily: 'var(--font-barlow), sans-serif', fontSize: '0.9rem', fontWeight: 600, textTransform: 'uppercase', color: '#0F0D0B' }}>Horizontal Axis</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label htmlFor="xAxisMin" style={s.label}>Left Label</label>
              <input type="text" id="xAxisMin" value={formData.xAxisMin} onChange={(e) => handleFieldChange('xAxisMin', e.target.value)} style={s.input} placeholder="Left end" maxLength={30} />
              {validationErrors.xAxisMin && <p style={s.error}>{validationErrors.xAxisMin}</p>}
            </div>
            <div>
              <label htmlFor="xAxisMax" style={s.label}>Right Label</label>
              <input type="text" id="xAxisMax" value={formData.xAxisMax} onChange={(e) => handleFieldChange('xAxisMax', e.target.value)} style={s.input} placeholder="Right end" maxLength={30} />
              {validationErrors.xAxisMax && <p style={s.error}>{validationErrors.xAxisMax}</p>}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h4 style={{ fontFamily: 'var(--font-barlow), sans-serif', fontSize: '0.9rem', fontWeight: 600, textTransform: 'uppercase', color: '#0F0D0B' }}>Vertical Axis</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label htmlFor="yAxisMin" style={s.label}>Bottom Label</label>
              <input type="text" id="yAxisMin" value={formData.yAxisMin} onChange={(e) => handleFieldChange('yAxisMin', e.target.value)} style={s.input} placeholder="Bottom end" maxLength={30} />
              {validationErrors.yAxisMin && <p style={s.error}>{validationErrors.yAxisMin}</p>}
            </div>
            <div>
              <label htmlFor="yAxisMax" style={s.label}>Top Label</label>
              <input type="text" id="yAxisMax" value={formData.yAxisMax} onChange={(e) => handleFieldChange('yAxisMax', e.target.value)} style={s.input} placeholder="Top end" maxLength={30} />
              {validationErrors.yAxisMax && <p style={s.error}>{validationErrors.yAxisMax}</p>}
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Naming */}
      <CollapsibleSection title="Naming" defaultOpen={false}>
        <div>
          <label htmlFor="objectNameQuestion" style={s.label}>Object Name Question</label>
          <input
            type="text"
            id="objectNameQuestion"
            value={formData.objectNameQuestion}
            onChange={(e) => handleFieldChange('objectNameQuestion', e.target.value)}
            style={s.input}
            placeholder="Prompt for naming..."
            maxLength={200}
          />
          {validationErrors.objectNameQuestion && <p style={s.error}>{validationErrors.objectNameQuestion}</p>}
        </div>

        <div>
          <h4 style={s.label}>Entry Slots per User</h4>
          <p style={{ ...s.hint, marginBottom: '0.75rem' }}>Allow users to submit multiple entries in this activity</p>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            {[{ value: 1, label: '1 entry' }, { value: 2, label: '2 entries' }, { value: 4, label: '4 entries' }, { value: 0, label: 'Unlimited (Solo Tracker)' }].map(opt => (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="maxEntries"
                  value={opt.value}
                  checked={Number(formData.maxEntries) === opt.value}
                  onChange={(e) => setFormData(prev => ({ ...prev, maxEntries: Number(e.target.value) }))}
                  style={s.radio}
                />
                <span style={{ marginLeft: '0.375rem', fontFamily: 'var(--font-cormorant), Georgia, serif', fontSize: '0.9rem', color: '#0F0D0B' }}>{opt.label}</span>
              </label>
            ))}
          </div>
          {Number(formData.maxEntries) === 0 && (
            <p style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: 'rgba(200, 59, 80, 0.06)', border: '1px solid rgba(200, 59, 80, 0.15)', borderRadius: '4px', fontSize: '0.8rem', color: '#C83B50', fontFamily: 'var(--font-cormorant), Georgia, serif' }}>
              Solo Tracker Mode: Only you (the creator) can add entries to this activity. Others can view results.
            </p>
          )}
        </div>
      </CollapsibleSection>

      {/* Quadrant Question */}
      <CollapsibleSection title="Quadrant Question" defaultOpen={false}>
        <div>
          <label htmlFor="mapQuestion" style={s.label}>Quadrant Selection Question</label>
          <input
            type="text"
            id="mapQuestion"
            value={formData.mapQuestion}
            onChange={(e) => handleFieldChange('mapQuestion', e.target.value)}
            style={s.input}
            placeholder="Map question..."
            maxLength={200}
          />
          {validationErrors.mapQuestion && <p style={s.error}>{validationErrors.mapQuestion}</p>}
        </div>
      </CollapsibleSection>

      {/* Comment */}
      <CollapsibleSection title="Comment" defaultOpen={false}>
        <div>
          <label htmlFor="commentQuestion" style={s.label}>Comment Question</label>
          <input
            type="text"
            id="commentQuestion"
            value={formData.commentQuestion}
            onChange={(e) => handleFieldChange('commentQuestion', e.target.value)}
            style={s.input}
            placeholder="Comment question..."
            maxLength={200}
          />
          {validationErrors.commentQuestion && <p style={s.error}>{validationErrors.commentQuestion}</p>}
        </div>
      </CollapsibleSection>
    </>
  );
}
