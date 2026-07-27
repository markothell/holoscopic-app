'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MOCK_HOME_NODE_ID, MOCK_NODES } from '@/lib/mock';
import type { FrameSpec, NodeContent, NodeKind, UnisonFrame, UnisonNode } from '@/lib/types';
import { deriveTopicId, wouldCreateCycle } from '@/lib/graph';
import { UnisonService } from '@/services/unisonService';

// Local-first map store. Without a joined community (no live backend
// session — see PLAN §8, membership gates every /nodes route) the DAG
// editor still needs to work, so `seedMock` (page.tsx's `useMock`) seeds
// from the mock corpus and every mutation applies to local state immediately
// and *also* fires the matching UnisonService call in the background; a
// failed/unauthorized/absent backend never blocks the UI, it just means "not
// synced yet" (logged, not surfaced). Once a community is actually joined
// (`seedMock: false`), this instead starts empty and loads the real
// UnisonNode.find({instanceId, ownerId}) scan (GET /unison/nodes) — a thin
// optimistic-update layer over the live map rather than the only source of
// truth.
//
// Axis ids on the real path: a thought's axisFrameIds can carry a
// locally-coined frame id (`local_fr_…`, minted by MapGraph's `coinFrame`
// for instant AxisPicker feedback) that has no server-side row yet. Sending
// `{frameId: 'local_fr_…'}` to create/setAxes 404s with "Spectrum not found"
// (the backend only resolves real frame ids or coins a fresh pole pair).
// `toAxisSpecs` translates any such id into a `{poleA, poleB}` spec — looked
// up from the frames catalog passed in via `resolveLocalFrame` — so the
// backend coins/dedupes a *real* frame instead. Already-real ids pass
// through as `{frameId}` untouched. The mock path never talks to a real
// backend, so it keeps sending raw `{frameId}` specs regardless.
function toAxisSpecs(
  axisFrameIds: string[],
  seedMock: boolean,
  resolveLocalFrame?: (id: string) => Pick<UnisonFrame, 'poleA' | 'poleB'> | undefined,
): FrameSpec[] {
  return axisFrameIds.reduce<FrameSpec[]>((specs, frameId) => {
    if (seedMock || !frameId.startsWith('local_fr_')) {
      specs.push({ frameId });
      return specs;
    }
    const local = resolveLocalFrame?.(frameId);
    if (local) {
      specs.push({ poleA: local.poleA, poleB: local.poleB });
    } else {
      // Shouldn't happen — coinFrame adds to the catalog before this can
      // fire — but dropping the axis beats sending a spec that 404s.
      console.debug('[unison] could not resolve locally-coined frame', frameId);
    }
    return specs;
  }, []);
}

export function useMyMap(instanceId: string, userId: string, ownerHandle: string, options: {
  seedMock?: boolean;
  // Real path only: looks up a locally-coined frame's poles by id (backed by
  // MapGraph's frames catalog) and, when provided, is called after any sync
  // that touched axes so the catalog picks up the frame the server actually
  // coined/deduped.
  resolveLocalFrame?: (id: string) => Pick<UnisonFrame, 'poleA' | 'poleB'> | undefined;
  refreshFrames?: () => void;
} = {}) {
  const seedMock = options.seedMock ?? true;
  const { resolveLocalFrame, refreshFrames } = options;
  const [nodes, setNodes] = useState<UnisonNode[]>(seedMock ? MOCK_NODES : []);
  const [error, setError] = useState<string | null>(null);

  // Real path only: load the caller's own map once a live community is
  // joined. Re-runs if the community (instanceId) or account changes.
  useEffect(() => {
    if (seedMock) return;
    let cancelled = false;
    UnisonService.myMap(instanceId, userId)
      .then(({ nodes: serverNodes }) => {
        if (!cancelled) setNodes(serverNodes);
      })
      .catch(err => console.debug('[unison] map load failed', err));
    return () => {
      cancelled = true;
    };
  }, [seedMock, instanceId, userId]);

  const byId = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  // Real path only: fold a server-authored node (e.g. the borrowed node
  // respond() returns, PLAN D2/D8) into local state without a full re-fetch.
  const mergeNode = useCallback((node: UnisonNode) => {
    setNodes(prev => {
      const idx = prev.findIndex(n => n.id === node.id);
      if (idx === -1) return [...prev, node];
      const next = [...prev];
      next[idx] = node;
      return next;
    });
  }, []);

  function sync(promise: Promise<{ node: UnisonNode }>, localId: string, touchesAxes: boolean) {
    promise
      .then(({ node: serverNode }) => {
        // Reconcile the locally-minted id with the server's once it answers
        // — this is what folds the real axisFrameIds back onto the node.
        setNodes(prev => prev.map(n => (n.id === localId ? { ...serverNode } : n)));
        // The node now points at real frame ids; make sure the frames
        // catalog actually has them (a coined pole pair only existed
        // locally until this response came back).
        if (touchesAxes && !seedMock) refreshFrames?.();
        // New thoughts default to published (a deliberate product default —
        // the backend still creates them private per §8, we publish right
        // after so a thought lands in the community feed without a separate
        // step). Topic hubs stay private scaffold. Unpublish stays available.
        if (!seedMock && serverNode.kind === 'thought' && serverNode.visibility !== 'published') {
          setNodes(prev => prev.map(n => (n.id === serverNode.id
            ? { ...n, visibility: 'published', publishedAt: new Date().toISOString() }
            : n)));
          UnisonService.publish(instanceId, serverNode.id, userId)
            .then(({ node: pub }) => setNodes(prev => prev.map(n => (n.id === pub.id ? { ...pub } : n))))
            .catch(err => console.debug('[unison] auto-publish failed', err));
        }
      })
      .catch(err => {
        // Expected until routes/unison.js is live — the local copy stands.
        console.debug('[unison] backend not synced for', localId, err);
      });
  }

  function localId() {
    return 'local_' + Math.random().toString(36).slice(2, 10);
  }

  const addRoot = useCallback((kind: NodeKind, content: Partial<NodeContent>, axisFrameIds: string[] = []) => {
    const id = localId();
    // Task item 3: every top-level node connects to the home root, so the
    // map stays one connected tree — a fresh "+" node is a child of home,
    // not a second, disconnected root. Skipped only for the home node
    // itself (it has no parent by definition), which addRoot never mints.
    const hasHome = byId.has(MOCK_HOME_NODE_ID);
    const draft: UnisonNode = {
      id, instanceId, ownerId: userId, ownerHandle, kind,
      content: { topic: '', thought: '', context: '', ...content },
      axisFrameIds: kind === 'thought' ? axisFrameIds : [],
      topicId: null,
      parentIds: hasHome ? [MOCK_HOME_NODE_ID] : [],
      edgeKind: hasHome ? 'child' : 'root',
      origin: 'own',
      sourceNodeId: null, sourceEntryId: null, sourceOwnerHandle: null,
      visibility: kind === 'thought' ? 'published' : 'private',
      publishedAt: kind === 'thought' ? new Date().toISOString() : null,
      promotedAt: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    setNodes(prev => [...prev, draft]);
    setError(null);
    sync(
      UnisonService.createRoot(instanceId, kind, content, toAxisSpecs(axisFrameIds, seedMock, resolveLocalFrame), userId),
      id,
      axisFrameIds.length > 0,
    );
    return draft;
  }, [byId, instanceId, userId, ownerHandle, seedMock, resolveLocalFrame, refreshFrames]);

  const addChild = useCallback((
    parentId: string, kind: NodeKind, content: Partial<NodeContent>, axisFrameIds: string[] = [],
  ) => {
    const parent = byId.get(parentId);
    if (!parent) { setError('Parent not found'); return null; }
    const id = localId();
    if (wouldCreateCycle(id, [parentId], nodes)) { setError('That would create a cycle in the map'); return null; }
    const draft: UnisonNode = {
      id, instanceId, ownerId: userId, ownerHandle, kind,
      content: { topic: '', thought: '', context: '', ...content },
      axisFrameIds: kind === 'thought' ? axisFrameIds : [],
      topicId: deriveTopicId(kind, [parent]),
      parentIds: [parentId], edgeKind: 'child', origin: 'own',
      sourceNodeId: null, sourceEntryId: null, sourceOwnerHandle: null,
      visibility: kind === 'thought' ? 'published' : 'private',
      publishedAt: kind === 'thought' ? new Date().toISOString() : null,
      promotedAt: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    setNodes(prev => [...prev, draft]);
    setError(null);
    sync(
      UnisonService.createChild(instanceId, parentId, kind, content, toAxisSpecs(axisFrameIds, seedMock, resolveLocalFrame), userId),
      id,
      axisFrameIds.length > 0,
    );
    return draft;
  }, [byId, nodes, instanceId, userId, ownerHandle, seedMock, resolveLocalFrame, refreshFrames]);

  // D4: thought⨯thought → synthesis thought (inherits the first-selected
  // parent's topic if the two disagree); topic⨯topic → a new merged hub. No
  // cross-kind marriage — callers gate this before invoking marry().
  const marry = useCallback((
    parentIds: [string, string], content: Partial<NodeContent>, axisFrameIds: string[] = [],
  ) => {
    const [a, b] = parentIds;
    const pa = byId.get(a);
    const pb = byId.get(b);
    if (!pa || !pb) { setError('Both nodes must exist to marry'); return null; }
    if (pa.kind !== pb.kind) { setError('Marriage needs two nodes of the same kind'); return null; }
    if (a === b) { setError('A marriage needs two distinct parents'); return null; }
    const id = localId();
    if (wouldCreateCycle(id, parentIds, nodes)) { setError('That would create a cycle in the map'); return null; }
    const kind: NodeKind = pa.kind;
    const draft: UnisonNode = {
      id, instanceId, ownerId: userId, ownerHandle, kind,
      content: { topic: '', thought: '', context: '', ...content },
      axisFrameIds: kind === 'thought' ? axisFrameIds : [],
      topicId: kind === 'thought' ? deriveTopicId(kind, [pa]) : null, // first-selected parent's topic
      parentIds, edgeKind: 'marriage', origin: 'own',
      sourceNodeId: null, sourceEntryId: null, sourceOwnerHandle: null,
      visibility: kind === 'thought' ? 'published' : 'private',
      publishedAt: kind === 'thought' ? new Date().toISOString() : null,
      promotedAt: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    setNodes(prev => [...prev, draft]);
    setError(null);
    sync(
      UnisonService.marry(instanceId, parentIds, kind, content, toAxisSpecs(axisFrameIds, seedMock, resolveLocalFrame), userId),
      id,
      axisFrameIds.length > 0,
    );
    return draft;
  }, [byId, nodes, instanceId, userId, ownerHandle, seedMock, resolveLocalFrame, refreshFrames]);

  const editNode = useCallback((nodeId: string, content: Partial<NodeContent>) => {
    setNodes(prev => prev.map(n => (n.id === nodeId
      ? { ...n, content: { ...n.content, ...content }, updatedAt: new Date().toISOString() }
      : n)));
    UnisonService.editContent(instanceId, nodeId, content, userId).catch(err => console.debug('[unison] edit not synced', err));
  }, [instanceId, userId]);

  const setAxes = useCallback((nodeId: string, axisFrameIds: string[]) => {
    if (axisFrameIds.length > 2) { setError('A thought carries at most two axes'); return; }
    // Instant local feedback — keeps AxisPicker snappy even with a
    // just-coined local_fr_ id in the list.
    setNodes(prev => prev.map(n => (n.id === nodeId ? { ...n, axisFrameIds, updatedAt: new Date().toISOString() } : n)));
    setError(null);
    UnisonService.setAxes(instanceId, nodeId, toAxisSpecs(axisFrameIds, seedMock, resolveLocalFrame), userId)
      .then(({ node: serverNode }) => {
        // Fold the real axisFrameIds the server resolved/coined back onto
        // the node, and make sure the frames catalog has the real frame.
        setNodes(prev => prev.map(n => (n.id === nodeId ? { ...serverNode } : n)));
        if (axisFrameIds.length > 0 && !seedMock) refreshFrames?.();
      })
      .catch(err => console.debug('[unison] axes not synced', err));
  }, [instanceId, userId, seedMock, resolveLocalFrame, refreshFrames]);

  const setPublished = useCallback((nodeId: string, published: boolean) => {
    setNodes(prev => prev.map(n => (n.id === nodeId
      ? { ...n, visibility: published ? 'published' : 'private', publishedAt: published ? new Date().toISOString() : null }
      : n)));
    const call = published ? UnisonService.publish : UnisonService.unpublish;
    call(instanceId, nodeId, userId).catch(err => console.debug('[unison] publish state not synced', err));
  }, [instanceId, userId]);

  return { nodes, byId, error, clearError: () => setError(null), addRoot, addChild, marry, editNode, setAxes, setPublished, mergeNode };
}
