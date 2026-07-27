'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, MarkerType,
  type Node, type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { NODE_TYPES, type UnisonNodeData } from './nodes';
import ThoughtPopup from './ThoughtPopup';
import NodeSheet from '@/components/map/NodeSheet';
import CreateSheet, { type CreateIntent } from '@/components/map/CreateSheet';
import MarryBar from '@/components/map/MarryBar';
import PostOverlay from '@/components/overlays/PostOverlay';
import { layoutMap } from '@/lib/graph';
import { MOCK_FRAMES, MOCK_POST, MOCK_REPLIES, resolveMockRemoteNode } from '@/lib/mock';
import type { NodeContent, NodeKind, UnisonFrame, UnisonNode, UnisonReply } from '@/lib/types';
import type { ResolveAxis, ResolvePosition } from '@/lib/resolveLogic';
import { useMyMap } from '@/hooks/useMyMap';
import { UnisonService } from '@/services/unisonService';
import { unisonSocket } from '@/services/socket';

// My Map — the DAG editor and home surface (D7). Two interaction modes:
//   browse  — tap a thought → context popup → "Open thought" → the
//             read-first post view (PostOverlay, task item 2); Edit lives
//             inside that view for the viewer's own nodes only.
//             tap a topic hub → edit sheet directly (hubs have no context).
//   marry   — tap one node, tap a second, then Marry (D4/MAP-2); the bar at
//             the bottom drives it, node opacity marks kind-eligibility.
// Same-map edges are solid (child + marriage); the dashed cross-map link
// vocabulary is reserved for a borrowed node's sourceNodeId (M1) — a private
// map has no such edge to draw yet, so the color vocabulary (origin) still
// shows up on the node itself (nodes.tsx) even though M0 draws no dashes.

function buildFlow(
  nodes: UnisonNode[], marryMode: boolean, marrySelection: string[], onOpenSource: (id: string) => void,
): { flowNodes: Node[]; flowEdges: Edge[] } {
  const laid = layoutMap(nodes);
  const eligibleKind = marrySelection.length === 1
    ? nodes.find(n => n.id === marrySelection[0])?.kind ?? null
    : null;

  const flowNodes: Node[] = laid.map(({ node, x, y }) => ({
    id: node.id,
    type: node.kind,
    position: { x, y },
    data: {
      unisonNode: node,
      selected: marrySelection.includes(node.id),
      marryMode,
      eligible: !eligibleKind || eligibleKind === node.kind || marrySelection.includes(node.id),
      onOpenSource,
    } satisfies UnisonNodeData,
    draggable: false,
  }));

  const flowEdges: Edge[] = [];
  for (const node of nodes) {
    node.parentIds.forEach((parentId, i) => {
      const accent = node.edgeKind === 'marriage' ? 'var(--synthesis)' : node.origin === 'borrowed' ? 'var(--borrowed)' : 'var(--own)';
      flowEdges.push({
        id: `${parentId}-${node.id}-${i}`,
        source: parentId,
        target: node.id,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, color: accent },
        style: { stroke: accent, strokeWidth: 1.5, opacity: node.edgeKind === 'marriage' ? 0.85 : 0.55 },
      });
    });
  }

  return { flowNodes, flowEdges };
}

function GraphInner({
  instanceId, userId, ownerHandle, useMock, openPostRequest, onOpenPostRequestHandled,
}: {
  instanceId: string; userId: string; ownerHandle: string; useMock: boolean;
  openPostRequest: string | null;
  onOpenPostRequestHandled: () => void;
}) {
  const [frames, setFrames] = useState<UnisonFrame[]>(useMock ? MOCK_FRAMES : []);
  // Mirrors `frames` synchronously (a ref, not state) so coinFrame() can add
  // a locally-coined frame and have it resolvable by useMyMap's
  // toAxisSpecs() in the very same tick — NodeSheet/CreateSheet call
  // onCoinFrame then immediately onSetAxes with the returned id, and a
  // setFrames() update wouldn't be visible to the setAxes closure until the
  // next render (BUG 1's frame-persistence fix).
  const framesRef = useRef<UnisonFrame[]>(frames);
  useEffect(() => { framesRef.current = frames; }, [frames]);
  const resolveLocalFrame = useCallback(
    (id: string) => framesRef.current.find(f => f.id === id),
    [],
  );

  // Real path only: the community's shared axis vocabulary (GET /unison/frames).
  const refreshFrames = useCallback(() => {
    if (useMock) return;
    UnisonService.frames(instanceId, userId)
      .then(({ frames: serverFrames }) => setFrames(serverFrames))
      .catch(err => console.debug('[unison] frames load failed', err));
  }, [useMock, instanceId, userId]);

  useEffect(() => {
    refreshFrames();
  }, [refreshFrames]);

  const { nodes, byId, addRoot, addChild, marry, editNode, setAxes, setPublished, mergeNode } =
    useMyMap(instanceId, userId, ownerHandle, { seedMock: useMock, resolveLocalFrame, refreshFrames });

  const [marryMode, setMarryMode] = useState(false);
  const [marrySelection, setMarrySelection] = useState<string[]>([]);
  const [popupNodeId, setPopupNodeId] = useState<string | null>(null);
  const [sheetNodeId, setSheetNodeId] = useState<string | null>(null);
  const [createIntent, setCreateIntent] = useState<CreateIntent | null>(null);

  // Task item 2: the read-first post view. Driven by an explicit node id —
  // never a blank dock destination (item 1) — set from: a map thought's
  // "Open thought" popup action, a borrowed node's provenance breadcrumb
  // (item 4, resolves to the source's id), or an incoming Feed selection
  // (openPostRequest, forwarded from page.tsx since Feed is a sibling
  // overlay, not nested under the map).
  const [postNodeId, setPostNodeId] = useState<string | null>(null);
  // Mock path: repliesByPost seeds MOCK_POST's thread from the mock corpus;
  // any other post (most of the viewer's own map) starts with an empty
  // thread — both are real states the read-first view needs to handle.
  const [repliesByPost, setRepliesByPost] = useState<Record<string, UnisonReply[]>>(
    useMock ? { [MOCK_POST.id]: MOCK_REPLIES } : {},
  );
  // Real path: GET /unison/nodes/:id/post — the published post + its live
  // public reply thread (D6/D9). Fetched fresh per postNodeId so the reply
  // map is never stale, own-node or not.
  const [remotePost, setRemotePost] = useState<{ post: UnisonNode; replies: UnisonReply[] } | null>(null);

  useEffect(() => {
    if (openPostRequest) {
      setPostNodeId(openPostRequest);
      onOpenPostRequestHandled();
    }
  }, [openPostRequest, onOpenPostRequestHandled]);

  // BUG 2 fix: GET /nodes/:id/post is published-only — it 404s for any
  // unpublished node, even the owner's own draft. A node on the viewer's OWN
  // map (byId.has) is content we already hold locally, so only hit this
  // endpoint for it when it's actually published (to pull the live reply
  // thread); an unpublished own draft can't have any replies yet anyway, so
  // there's nothing to fetch — skip the call entirely and render from local
  // state. A node NOT on this map (a feed item or a borrowed node's source)
  // is guaranteed published (that's the only way it could have gotten here),
  // so it always fetches.
  useEffect(() => {
    if (useMock || !postNodeId) { setRemotePost(null); return; }
    const localNode = byId.get(postNodeId);
    if (localNode && localNode.visibility !== 'published') { setRemotePost(null); return; }
    let cancelled = false;
    UnisonService.getPost(instanceId, postNodeId, userId)
      .then(data => { if (!cancelled) setRemotePost(data); })
      .catch(err => { console.debug('[unison] post load failed', err); if (!cancelled) setRemotePost(null); });
    return () => { cancelled = true; };
  }, [useMock, instanceId, userId, postNodeId, byId]);

  // Opening a post may reference frames coined after our catalog last loaded
  // (by another member, or just now on our own map) — postAxes silently drops
  // any axis whose frame the catalog lacks, so a 2-axis post renders as 1.
  // Refresh the catalog on post-open (keyed on postNodeId, not byId, so it
  // fires once per open, not on every map edit) to pull in the full set.
  useEffect(() => {
    if (useMock || !postNodeId) return;
    refreshFrames();
  }, [useMock, postNodeId, refreshFrames]);

  // Live reply map (task item 3): reply_upserted fires on both a new/edited
  // reply AND an upvote toggle (utils/unisonNodes.js emits it from both
  // respond() and upvoteReply()) — upsert by reply id into whichever post is
  // currently open.
  useEffect(() => {
    if (useMock) return;
    return unisonSocket.on('reply_upserted', payload => {
      const { postId, reply } = payload as { postId: string; reply: UnisonReply };
      setRemotePost(prev => {
        if (!prev || prev.post.id !== postId) return prev;
        const idx = prev.replies.findIndex(r => r.id === reply.id);
        const replies = idx === -1 ? [reply, ...prev.replies] : prev.replies.map(r => (r.id === reply.id ? reply : r));
        return { ...prev, replies };
      });
    });
  }, [useMock]);

  const openSource = useCallback((sourceNodeId: string) => {
    setPopupNodeId(null);
    setPostNodeId(sourceNodeId);
  }, []);

  const { flowNodes, flowEdges } = useMemo(
    () => buildFlow(nodes, marryMode, marrySelection, openSource),
    [nodes, marryMode, marrySelection, openSource],
  );

  const sheetNode = sheetNodeId ? byId.get(sheetNodeId) ?? null : null;
  const popupNode = popupNodeId ? byId.get(popupNodeId) ?? null : null;
  // A post can be one of the viewer's own map nodes, or someone else's (a
  // feed item, or a borrowed node's source). Real path: prefer the LOCAL
  // copy when it's on this map (BUG 2 — it's the same content, already in
  // hand, and skips the published-only /post 404 for an unpublished draft),
  // falling back to the live fetch result for anything not on this map.
  // Mock path: fall back to the mock "remote" corpus when it isn't on this map (lib/mock.ts).
  const postNode = postNodeId
    ? (useMock ? byId.get(postNodeId) ?? resolveMockRemoteNode(postNodeId) ?? null : byId.get(postNodeId) ?? remotePost?.post ?? null)
    : null;
  const postAxes: ResolveAxis[] = postNode
    ? postNode.axisFrameIds
        .map(id => frames.find(f => f.id === id))
        .filter((f): f is UnisonFrame => !!f)
        .map(f => ({ frameId: f.id, poleA: f.poleA, poleB: f.poleB }))
    : [];
  // "own node" for the Edit gate (item 2) means it's actually on THIS map
  // under this owner — not just origin:'own' relative to some other
  // author's map (MOCK_POST/MOCK_FEED entries are also origin:'own' on
  // their own author's map, so byId membership is the real test).
  const postIsMine = !!postNode && byId.has(postNode.id) && postNode.origin === 'own';

  function coinFrame(poleA: string, poleB: string): string {
    const id = 'local_fr_' + Math.random().toString(36).slice(2, 8);
    const frame: UnisonFrame = { id, instanceId, parentInstanceId: null, poleA, poleB, key: null, createdBy: userId, createdByName: ownerHandle };
    // Update the ref synchronously — NodeSheet/CreateSheet call onSetAxes
    // with this id right after onCoinFrame returns, in the same tick, and
    // useMyMap's resolveLocalFrame needs to see it immediately (the setFrames
    // below only lands on the next render).
    framesRef.current = [...framesRef.current, frame];
    setFrames(prev => [...prev, frame]);
    return id;
  }

  function handleNodeClick(nodeId: string) {
    if (marryMode) {
      setMarrySelection(prev => {
        if (prev.includes(nodeId)) return prev.filter(id => id !== nodeId);
        const clickedKind = byId.get(nodeId)?.kind;
        const existingKind = prev.length ? byId.get(prev[0])?.kind : null;
        if (prev.length >= 1 && existingKind !== clickedKind) return [nodeId]; // restart with matching kind
        return [...prev, nodeId].slice(-2);
      });
      return;
    }
    const node = byId.get(nodeId);
    if (!node) return;
    if (node.kind === 'thought') setPopupNodeId(nodeId);
    else setSheetNodeId(nodeId);
  }

  function startMarryFrom(nodeId: string) {
    setSheetNodeId(null);
    setMarryMode(true);
    setMarrySelection([nodeId]);
  }

  function submitCreate(kind: NodeKind, content: Partial<NodeContent>, axisFrameIds: string[]) {
    if (!createIntent) return;
    if (createIntent.type === 'root') addRoot(kind, content, axisFrameIds);
    if (createIntent.type === 'child' && sheetNodeId) addChild(sheetNodeId, kind, content, axisFrameIds);
    if (createIntent.type === 'marry') {
      marry(marrySelection as [string, string], content, axisFrameIds);
      setMarryMode(false);
      setMarrySelection([]);
    }
    setCreateIntent(null);
    setSheetNodeId(null);
  }

  // toggleUpvote (task item 3) — free reply upvotes (D9). Mock path updates
  // local state only; real path optimistically flips the vote, fires
  // POST /replies/:entryId/upvote, and reconciles on response (the socket
  // echo above would also land this, but reconciling here keeps the caller's
  // own click snappy instead of waiting on the round trip).
  function toggleUpvote(postId: string, replyId: string) {
    if (useMock) {
      setRepliesByPost(prev => ({
        ...prev,
        [postId]: (prev[postId] ?? []).map(r => {
          if (r.id !== replyId) return r;
          const has = r.voterIds.includes(userId);
          const voterIds = has ? r.voterIds.filter(v => v !== userId) : [...r.voterIds, userId];
          return { ...r, voterIds, voteCount: voterIds.length };
        }),
      }));
      return;
    }
    setRemotePost(prev => {
      if (!prev || prev.post.id !== postId) return prev;
      const replies = prev.replies.map(r => {
        if (r.id !== replyId) return r;
        const has = r.voterIds.includes(userId);
        const voterIds = has ? r.voterIds.filter(v => v !== userId) : [...r.voterIds, userId];
        return { ...r, voterIds, voteCount: voterIds.length };
      });
      return { ...prev, replies };
    });
    UnisonService.upvoteReply(instanceId, postId, replyId, userId)
      .then(({ reply }) => setRemotePost(prev => (prev && prev.post.id === postId
        ? { ...prev, replies: prev.replies.map(r => (r.id === reply.id ? reply : r)) }
        : prev)))
      .catch(err => console.debug('[unison] upvote failed', err));
  }

  // submitReply (task item 2) — the response composer's submit. Mock path
  // keeps the M0 local-only behavior. Real path calls POST /respond (D2's
  // two-record write): folds the returned reply into the open post's thread
  // and, when one comes back (null on a self-response), the borrowed node
  // straight onto My Map via mergeNode — no need to wait on a full refetch.
  function submitReply(postId: string, stance: ResolvePosition, context: string) {
    if (useMock) {
      setRepliesByPost(prev => {
        const existing = prev[postId] ?? [];
        const reply: UnisonReply = {
          id: 'local_' + Date.now(), activityId: postId, userId, username: ownerHandle,
          position: stance, text: context, voterIds: [], voteCount: 0,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        return { ...prev, [postId]: [reply, ...existing.filter(r => r.userId !== userId)] };
      });
      return;
    }
    UnisonService.respond(instanceId, postId, stance, context, userId)
      .then(({ reply, node }) => {
        setRemotePost(prev => {
          if (!prev || prev.post.id !== postId) return prev;
          const idx = prev.replies.findIndex(r => r.id === reply.id);
          const replies = idx === -1 ? [reply, ...prev.replies] : prev.replies.map(r => (r.id === reply.id ? reply : r));
          return { ...prev, replies };
        });
        if (node) mergeNode(node);
      })
      .catch(err => console.debug('[unison] respond failed', err));
  }

  const selectedNodes = marrySelection.map(id => byId.get(id)).filter((n): n is UnisonNode => !!n);

  return (
    <div className="relative h-dvh w-full" style={{ background: 'var(--dusk)' }}>
      <div className="tuning-rings absolute inset-0" style={{ opacity: 0.6 }} />
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={NODE_TYPES}
        onNodeClick={(_, node) => handleNodeClick(node.id)}
        onPaneClick={() => { if (marryMode && marrySelection.length === 0) setMarryMode(false); }}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1.1 }}
        panOnScroll
        zoomOnScroll
        minZoom={0.3}
        maxZoom={2}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
        style={{ background: 'transparent', width: '100%', height: '100%' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="rgba(236,231,245,0.10)" />
      </ReactFlow>

      {!marryMode && (
        <button
          onClick={() => setCreateIntent({ type: 'root' })}
          aria-label="Add to your map"
          className="tone-in absolute bottom-24 right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full text-2xl"
          style={{ background: 'var(--own)', color: 'var(--dusk-deep)', boxShadow: 'var(--shadow-card)' }}
        >
          +
        </button>
      )}

      {!marryMode && (
        <button
          onClick={() => setMarryMode(true)}
          className="eyebrow tone-in absolute bottom-24 left-5 z-20 rounded-full border px-4 py-3"
          style={{ borderColor: 'var(--synthesis)', color: 'var(--synthesis)', background: 'var(--dusk-raised)' }}
        >
          ◆ Marry
        </button>
      )}

      {marryMode && (
        <MarryBar
          selected={selectedNodes}
          onMarry={() => setCreateIntent({
            type: 'marry',
            parentLabel: selectedNodes.map(n => (n.kind === 'topic' ? n.content.topic : n.content.thought).slice(0, 16)).join(' + '),
            kind: selectedNodes[0]?.kind ?? 'thought',
          })}
          onCancel={() => { setMarryMode(false); setMarrySelection([]); }}
        />
      )}

      {popupNode && (
        <ThoughtPopup
          node={popupNode}
          onClose={() => setPopupNodeId(null)}
          onOpenActions={() => { setPopupNodeId(null); setPostNodeId(popupNode.id); }}
          onOpenSource={openSource}
        />
      )}

      {postNode && (
        <PostOverlay
          node={postNode}
          axes={postAxes}
          replies={useMock ? repliesByPost[postNode.id] ?? [] : remotePost?.replies ?? []}
          isMine={postIsMine}
          viewerId={userId}
          live={!useMock}
          onClose={() => setPostNodeId(null)}
          onEdit={() => { setSheetNodeId(postNode.id); setPostNodeId(null); }}
          onOpenSource={openSource}
          onToggleUpvote={replyId => toggleUpvote(postNode.id, replyId)}
          onSubmitReply={(stance, context) => submitReply(postNode.id, stance, context)}
        />
      )}

      <NodeSheet
        node={sheetNode}
        open={!!sheetNode && !createIntent}
        frames={frames}
        onClose={() => setSheetNodeId(null)}
        onEdit={content => sheetNode && editNode(sheetNode.id, content)}
        onSetAxes={ids => sheetNode && setAxes(sheetNode.id, ids)}
        onCoinFrame={coinFrame}
        onPublishToggle={() => sheetNode && setPublished(sheetNode.id, sheetNode.visibility !== 'published')}
        onAddChild={() => sheetNode && setCreateIntent({ type: 'child', parentLabel: (sheetNode.kind === 'topic' ? sheetNode.content.topic : sheetNode.content.thought).slice(0, 24) })}
        onStartMarry={() => sheetNode && startMarryFrom(sheetNode.id)}
        onOpenSource={openSource}
      />

      <CreateSheet
        open={!!createIntent}
        intent={createIntent}
        frames={frames}
        onCancel={() => setCreateIntent(null)}
        onSubmit={submitCreate}
        onCoinFrame={coinFrame}
      />
    </div>
  );
}

export default function MapGraph(props: {
  instanceId: string; userId: string; ownerHandle: string; useMock: boolean;
  openPostRequest: string | null;
  onOpenPostRequestHandled: () => void;
}) {
  return (
    <ReactFlowProvider>
      <GraphInner {...props} />
    </ReactFlowProvider>
  );
}
