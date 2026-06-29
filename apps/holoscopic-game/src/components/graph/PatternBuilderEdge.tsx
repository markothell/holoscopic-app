'use client';

import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow, type EdgeProps } from '@xyflow/react';

function PatternBuilderEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, style, markerEnd,
}: EdgeProps) {
  const { setEdges } = useReactFlow();
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <button
          className="nodrag nopan"
          onClick={() => setEdges(es => es.filter(e => e.id !== id))}
          title="Remove connection"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
            width: 18, height: 18,
            borderRadius: '50%',
            border: '1px solid rgba(200,59,80,0.35)',
            background: 'rgba(247,244,239,0.95)',
            color: '#C83B50',
            fontSize: '10px', lineHeight: 1,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0,
            opacity: 1,
          }}
        >
          ×
        </button>
      </EdgeLabelRenderer>
    </>
  );
}

export default memo(PatternBuilderEdge);
