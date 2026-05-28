'use client';

import CollapsibleSection from '../../CollapsibleSection';
import type { TypeCreatePanelProps } from '../registry-types';
import { SnapshotQuestion } from '../../../types/Activity';

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

const PRESET_COLORS = ['#9B59B6', '#E67E22', '#C0392B', '#27AE60', '#2980B9', '#F39C12'];

export default function SnapshotCreatePanel({
  formData,
  setFormData,
  validationErrors,
}: TypeCreatePanelProps) {
  const handleFieldChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <>
      {/* Questions */}
      <CollapsibleSection title="Questions" defaultOpen={true}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <label style={{ ...s.label, margin: 0 }}>Questions</label>
            <button
              type="button"
              onClick={() => {
                const existing = formData.snapshotQuestions || [];
                const newQ: SnapshotQuestion = {
                  id: Math.random().toString(36).slice(2, 10),
                  topic: '',
                  label: '',
                  color: PRESET_COLORS[existing.length % PRESET_COLORS.length],
                  order: existing.length + 1,
                };
                setFormData(prev => ({ ...prev, snapshotQuestions: [...existing, newQ] }));
              }}
              style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', background: 'none', border: '1px solid #D9D4CC', borderRadius: 4, padding: '0.3rem 0.6rem', cursor: 'pointer', color: '#6B6560' }}
            >
              + Add Question
            </button>
          </div>
          {(formData.snapshotQuestions || []).length === 0 && (
            <p style={{ fontFamily: 'var(--font-cormorant), Georgia, serif', fontSize: '0.9rem', color: '#9B8F85', fontStyle: 'italic' }}>
              Add at least one question to define what participants will map.
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {(formData.snapshotQuestions || []).map((q, qi) => (
              <div key={q.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', padding: '0.75rem', border: '1px solid #D9D4CC', borderRadius: 6, background: 'rgba(255,255,255,0.3)' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="color"
                    value={q.color}
                    onChange={(e) => {
                      const updated = [...(formData.snapshotQuestions || [])];
                      updated[qi] = { ...q, color: e.target.value };
                      setFormData(prev => ({ ...prev, snapshotQuestions: updated }));
                    }}
                    style={{ width: 32, height: 32, border: 'none', borderRadius: 4, cursor: 'pointer', padding: 0, flexShrink: 0 }}
                    title="Pick color"
                  />
                  <input
                    type="text"
                    value={q.topic}
                    onChange={(e) => {
                      const updated = [...(formData.snapshotQuestions || [])];
                      updated[qi] = { ...q, topic: e.target.value };
                      setFormData(prev => ({ ...prev, snapshotQuestions: updated }));
                    }}
                    style={{ ...s.input, flex: 1, margin: 0 }}
                    placeholder="Topic (short label, e.g. Experience)"
                    maxLength={50}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const updated = (formData.snapshotQuestions || []).filter((_, i) => i !== qi);
                      setFormData(prev => ({ ...prev, snapshotQuestions: updated.map((q, i) => ({ ...q, order: i + 1 })) }));
                    }}
                    style={{ color: '#C83B50', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '0 0.25rem', flexShrink: 0 }}
                  >
                    &times;
                  </button>
                </div>
                <input
                  type="text"
                  value={q.label}
                  onChange={(e) => {
                    const updated = [...(formData.snapshotQuestions || [])];
                    updated[qi] = { ...q, label: e.target.value };
                    setFormData(prev => ({ ...prev, snapshotQuestions: updated }));
                  }}
                  style={{ ...s.input, margin: 0 }}
                  placeholder="Name question (e.g. Name an experience with money)"
                  maxLength={200}
                />
              </div>
            ))}
          </div>
        </div>
      </CollapsibleSection>

      {/* Axis Setup */}
      <CollapsibleSection title="Axis Setup" defaultOpen={false}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Single axis point count — applies to both axes */}
          <div>
            <label style={s.label}>Axis Points (applies to both axes)</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {([2, 4] as const).map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    const xDef2 = ['Left', 'Right'];
                    const xDef4 = ['Within', 'Near', 'Far', 'Distant'];
                    const yDef2 = ['Bottom', 'Top'];
                    const yDef4 = ['Inside', 'Down', 'Up', 'Out'];
                    setFormData(prev => ({
                      ...prev,
                      xAxisPoints: n,
                      yAxisPoints: n,
                      xAxisLabels: n === 2 ? xDef2 : xDef4,
                      yAxisLabels: n === 2 ? yDef2 : yDef4,
                    }));
                  }}
                  style={{
                    flex: 1,
                    padding: '0.4rem',
                    border: (formData.xAxisPoints || 2) === n ? '1px solid #C83B50' : '1px solid #D9D4CC',
                    background: (formData.xAxisPoints || 2) === n ? 'rgba(200,59,80,0.06)' : 'transparent',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-dm-mono), monospace',
                    fontSize: '0.7rem',
                    color: '#0F0D0B',
                  }}
                >
                  {n} points
                </button>
              ))}
            </div>
          </div>

          {/* Axis label inputs */}
          {(['x', 'y'] as const).map(axis => {
            const points = formData.xAxisPoints || 2; // both axes share the same count
            const labels = axis === 'x' ? (formData.xAxisLabels || []) : (formData.yAxisLabels || []);
            const axisLabel = axis === 'x' ? 'Horizontal' : 'Vertical';
            const hint = axis === 'x' ? 'left → right' : 'bottom → top';
            const placeholders = axis === 'x'
              ? points === 2 ? ['Left', 'Right'] : ['Far Left', 'Near Left', 'Near Right', 'Far Right']
              : points === 2 ? ['Bottom', 'Top'] : ['Far Bottom', 'Near Bottom', 'Near Top', 'Far Top'];
            return (
              <div key={axis}>
                <label style={s.label}>{axisLabel} Labels <span style={{ fontWeight: 300, textTransform: 'none', letterSpacing: 0 }}>({hint})</span></label>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${points}, 1fr)`, gap: '0.5rem' }}>
                  {Array.from({ length: points }).map((_, i) => (
                    <input
                      key={i}
                      type="text"
                      value={labels[i] || ''}
                      onChange={(e) => {
                        const field = axis === 'x' ? 'xAxisLabels' : 'yAxisLabels';
                        const updated = [...(labels as string[])];
                        updated[i] = e.target.value;
                        setFormData(prev => ({ ...prev, [field]: updated }));
                      }}
                      style={s.input}
                      placeholder={placeholders[i]}
                      maxLength={30}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Axis heading labels */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label htmlFor="xAxisLabel" style={s.label}>Horizontal Axis Heading</label>
              <input
                type="text"
                id="xAxisLabel"
                value={formData.xAxisLabel}
                onChange={(e) => handleFieldChange('xAxisLabel', e.target.value)}
                style={s.input}
                placeholder="e.g. Horizontal"
                maxLength={50}
              />
              <p style={s.hint}>Shown as the axis selector heading during participation</p>
            </div>
            <div>
              <label htmlFor="yAxisLabel" style={s.label}>Vertical Axis Heading</label>
              <input
                type="text"
                id="yAxisLabel"
                value={formData.yAxisLabel}
                onChange={(e) => handleFieldChange('yAxisLabel', e.target.value)}
                style={s.input}
                placeholder="e.g. Vertical"
                maxLength={50}
              />
              <p style={s.hint}>Shown as the axis selector heading during participation</p>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Slider Questions */}
      <CollapsibleSection title="Slider Questions" defaultOpen={false}>
        <div>
          <label style={s.label}>Horizontal Axis Question</label>
          <input
            type="text"
            value={formData.mapQuestion}
            onChange={(e) => handleFieldChange('mapQuestion', e.target.value)}
            style={s.input}
            placeholder="e.g. How present is this in your life?"
            maxLength={200}
          />
          <p style={s.hint}>Shown above the horizontal axis selector during participation</p>
          {validationErrors.mapQuestion && <p style={s.error}>{validationErrors.mapQuestion}</p>}
        </div>
        <div>
          <label style={s.label}>Vertical Axis Question</label>
          <input
            type="text"
            value={formData.mapQuestion2}
            onChange={(e) => handleFieldChange('mapQuestion2', e.target.value)}
            style={s.input}
            placeholder="e.g. How much energy does this take?"
            maxLength={200}
          />
          <p style={s.hint}>Shown above the vertical axis selector during participation</p>
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
