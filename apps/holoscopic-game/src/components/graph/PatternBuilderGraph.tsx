'use client';

import { forwardRef, useCallback, useImperativeHandle } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type EdgeTypes,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import PatternBuilderNode, { type BuilderNodeData } from './PatternBuilderNode';
import PatternBuilderEdge from './PatternBuilderEdge';

const nodeTypes: NodeTypes = { builderNode: PatternBuilderNode };
const edgeTypes: EdgeTypes = { builderEdge: PatternBuilderEdge };

export interface BuilderState {
  nodes: Array<{ id: string; title: string; activityType: string; mapQuestion?: string; commentQuestion?: string; preamble?: string }>;
  edges: Array<{ source: string; target: string }>;
}

export interface PatternBuilderGraphHandle {
  getState: () => BuilderState;
  updateNode: (id: string, data: Partial<BuilderNodeData>) => void;
  getNode: (id: string) => BuilderNodeData | undefined;
}

interface PatternBuilderGraphProps {
  onNodeSelect?: (id: string | null, data: BuilderNodeData | null) => void;
}

let _seq = 0;
function newId() { return `pn-${++_seq}-${Date.now().toString(36)}`; }

function gridPos(index: number): { x: number; y: number } {
  return { x: 100 + (index % 4) * 180, y: 80 + Math.floor(index / 4) * 200 };
}

function PatternBuilderGraphCore(
  { onNodeSelect }: PatternBuilderGraphProps,
  ref: React.Ref<PatternBuilderGraphHandle>
) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useImperativeHandle(ref, () => ({
    getState: () => ({
      nodes: nodes.map(n => {
        const d = n.data as unknown as BuilderNodeData;
        return { id: n.id, title: d.title || '', activityType: d.activityType || 'dissolve', mapQuestion: d.mapQuestion, commentQuestion: d.commentQuestion, preamble: d.preamble };
      }),
      edges: edges.map(e => ({ source: e.source, target: e.target })),
    }),
    updateNode: (id, data) => {
      setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, ...data } } : n));
    },
    getNode: (id) => {
      const n = nodes.find(n => n.id === id);
      return n ? (n.data as unknown as BuilderNodeData) : undefined;
    },
  }), [nodes, edges, setNodes]);

  const handleNodeSelect = useCallback((id: string) => {
    const node = nodes.find(n => n.id === id);
    onNodeSelect?.(id, node ? (node.data as unknown as BuilderNodeData) : null);
  }, [nodes, onNodeSelect]);

  const addNode = useCallback(() => {
    setNodes(ns => {
      const id = newId();
      return [...ns, {
        id,
        type: 'builderNode',
        position: gridPos(ns.length),
        data: {
          title: '',
          activityType: 'dissolve',
          onSelect: handleNodeSelect,
        } as BuilderNodeData,
      }];
    });
  }, [setNodes, handleNodeSelect]);

  // Keep onSelect callbacks current as handleNodeSelect changes
  const ensureCallbacks = (ns: Node[]): Node[] =>
    ns.map(n => ({ ...n, data: { ...n.data, onSelect: handleNodeSelect } }));

  const onConnect = useCallback((connection: Connection) => {
    setEdges(es => addEdge({
      ...connection,
      type: 'builderEdge',
      style: { stroke: '#C0BAB3', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#C0BAB3', width: 16, height: 16 },
    }, es));
  }, [setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    onNodeSelect?.(node.id, node.data as unknown as BuilderNodeData);
  }, [onNodeSelect]);

  const onPaneClick = useCallback(() => {
    onNodeSelect?.(null, null);
  }, [onNodeSelect]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <button
        onClick={addNode}
        style={{
          position: 'absolute', top: 12, left: 12, zIndex: 10,
          fontSize: '0.6rem',
          fontFamily: 'var(--font-dm-mono), monospace',
          letterSpacing: '0.12em', textTransform: 'uppercase',
          padding: '0.4rem 0.9rem', borderRadius: 999,
          border: '1px solid #C0BAB3',
          background: 'rgba(255,255,255,0.95)', color: '#0F0D0B',
          cursor: 'pointer',
          boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
        }}>
        + Add Step
      </button>

      {nodes.length === 0 && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none', zIndex: 5,
        }}>
          <p style={{ fontSize: '0.78rem', color: '#B0A89E', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.05em' }}>
            Add steps above to build your sequence
          </p>
        </div>
      )}

      <ReactFlow
        nodes={ensureCallbacks(nodes)}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView={nodes.length > 0}
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.25} maxZoom={1.5}
        defaultViewport={{ x: 60, y: 60, zoom: 1 }}
        deleteKeyCode={['Delete', 'Backspace']}
        selectionKeyCode={null}
      >
        <Background variant={BackgroundVariant.Dots} color="#D9D4CC" gap={20} size={1} />
      </ReactFlow>
    </div>
  );
}

export default forwardRef(PatternBuilderGraphCore);
