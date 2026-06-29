'use client';

import { memo } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import { ActivityTypeIcon } from '@hs/activities';

const TYPES = ['dissolve', 'resolve'] as const;
type BuilderType = typeof TYPES[number];

export interface BuilderNodeData {
  title: string;
  activityType: BuilderType;
  mapQuestion?: string;
  commentQuestion?: string;
  preamble?: string;
  onSelect?: (id: string) => void;
  [key: string]: unknown;
}

function PatternBuilderNode({ id, data, selected }: { id: string; data: BuilderNodeData; selected?: boolean }) {
  const { updateNodeData, setNodes, setEdges } = useReactFlow();

  const remove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNodes(ns => ns.filter(n => n.id !== id));
    setEdges(es => es.filter(e => e.source !== id && e.target !== id));
  };

  const border = selected ? '#C83B50' : 'rgba(210, 203, 196, 0.8)';
  const bg = selected ? 'rgba(200,59,80,0.05)' : 'rgba(255,255,255,0.92)';

  return (
    <>
      <Handle type="target" position={Position.Top}
        style={{ background: '#C83B50', width: 8, height: 8, border: 'none' }} />

      <div style={{
        width: 120, height: 120, borderRadius: '50%',
        border: `2px solid ${border}`, background: bg,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: '0.25rem', position: 'relative',
        transition: 'border-color 0.15s',
        boxShadow: selected ? '0 0 0 3px rgba(200,59,80,0.12)' : 'none',
      }}>

        {/* Delete */}
        <button
          className="nodrag nopan"
          onMouseDown={e => e.stopPropagation()}
          onClick={remove}
          title="Remove step"
          style={{
            position: 'absolute', top: 7, right: 10,
            width: 15, height: 15, borderRadius: '50%',
            border: 'none', background: 'rgba(200,59,80,0.13)',
            color: '#C83B50', fontSize: '9px', lineHeight: 1,
            cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            padding: 0,
          }}
        >×</button>

        <div style={{ color: '#6B6560', pointerEvents: 'none' }}>
          <ActivityTypeIcon type={data.activityType} size={14} />
        </div>

        <input
          value={data.title}
          onChange={e => updateNodeData(id, { title: e.target.value })}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          placeholder="Step title"
          className="nodrag nopan nowheel"
          style={{
            width: 82, background: 'transparent',
            border: 'none', borderBottom: '1px solid rgba(210,203,196,0.7)',
            outline: 'none', textAlign: 'center',
            fontSize: '0.6rem', fontFamily: 'inherit',
            color: data.title ? '#0F0D0B' : '#B0A89E',
            padding: '1px 0',
          }}
        />

        <div className="nodrag nopan" style={{ display: 'flex', gap: 4, marginTop: 2 }}>
          {TYPES.map(t => (
            <button key={t}
              title={t}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); updateNodeData(id, { activityType: t }); }}
              style={{
                width: 20, height: 20, borderRadius: 4,
                border: `1px solid ${data.activityType === t ? '#C83B50' : '#D9D4CC'}`,
                background: data.activityType === t ? 'rgba(200,59,80,0.1)' : 'transparent',
                cursor: 'pointer', padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: data.activityType === t ? '#C83B50' : '#9A9288',
              }}>
              <ActivityTypeIcon type={t} size={10} />
            </button>
          ))}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom}
        style={{ background: '#C83B50', width: 8, height: 8, border: 'none' }} />
    </>
  );
}

export default memo(PatternBuilderNode);
