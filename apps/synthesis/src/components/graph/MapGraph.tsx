'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, MarkerType,
  type Node, type BuiltInEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { NODE_TYPES, type SynNodeData } from './nodes';
import ThoughtPopup from './ThoughtPopup';
import NodeSheet from '@/components/map/NodeSheet';
import CreateSheet, { type CreateIntent } from '@/components/map/CreateSheet';
import MarryBar from '@/components/map/MarryBar';
import PostOverlay from '@/components/overlays/PostOverlay';
import { layoutMap } from '@/lib/graph';
import { MOCK_FRAMES, MOCK_POST, MOCK_REPLIES, resolveMockRemoteNode } from '@/lib/mock';
import type { NodeContent, NodeKind, SynFrame, SynNode, SynthesisReply } from '@/lib/types';
import type { ResolveAxis, ResolvePosition } from '@/lib/resolveLogic';
import { useMyMap } from '@/hooks/useMyMap';
import { SynthesisService } from '@/services/synthesisService';
import { synthesisSocket } from '@/services/socket';

// My Map — the DAG editor and home surface (D7). Two interaction modes:
//   browse  — tap a thought → context popup → "Open thought" → the
//             read-first post view (PostOverlay, task item 2); Edit lives
//             inside that view for the viewer's own nodes only. The popup
//             also carries the two growth gestures (+ Add below / Marry),
//             so the map can be grown from where you're already standing.
//             tap a topic hub → edit sheet directly (hubs have no context).
//   marry   — tap one node, tap a second, then Marry (D4/MAP-2); the bar at
//             the bottom drives it, node opacity marks kind-eligibility.
// Either kind can hang under either kind: a hub takes sub-hubs, a thought
// takes further thoughts (PLAN §2, unlimited depth) — see CreateSheet.
// Same-map edges are solid (child + marriage); the dashed cross-map link
// vocabulary is reserved for a borrowed node's sourceNodeId (M1) — a private
// map has no such edge to draw yet, so the color vocabulary (origin) still
// shows up on the node itself (nodes.tsx) even though M0 draws no dashes.

function buildFlow(
  nodes: SynNode[], marryMode: boolean, marrySelection: string[], onOpenSource: (id: string) => void,
  inSynthesis: boolean,
): { flowNodes: Node[]; flowEdges: BuiltInEdge[] } {
  const laid = layoutMap(nodes);
  const onMap = new Set(nodes.map(n => n.id));
  const eligibleKind = marrySelection.length === 1
    ? nodes.find(n => n.id === marrySelection[0])?.kind ?? null
    : null;

  const flowNodes: Node[] = laid.map(({ node, x, y, hubTier }) => ({
    id: node.id,
    type: node.kind,
    position: { x, y },
    data: {
      synthesisNode: node,
      selected: marrySelection.includes(node.id),
      marryMode,
      eligible: !eligibleKind || eligibleKind === node.kind || marrySelection.includes(node.id),
      hubTier,
      inSynthesis,
      onOpenSource,
    } satisfies SynNodeData,
    draggable: false,
  }));

  // Edge grammar: a plain parent→child edge is quiet structural wiring —
  // geometry already says who the parent is now that a subtree sits directly
  // under its own hub (lib/graph.ts), so the line doesn't need to shout.
  // Only a marriage earns colour and weight: two lines converging is the
  // notable fact, and its two edges have to be told apart from the ordinary
  // single-parent ones running past them.
  const flowEdges: BuiltInEdge[] = [];
  for (const node of nodes) {
    const isMarriage = node.edgeKind === 'marriage';
    const stroke = isMarriage ? 'var(--join)' : 'var(--line-strong)';
    node.parentIds.filter(p => onMap.has(p)).forEach((parentId, i) => {
      flowEdges.push({
        id: `${parentId}-${node.id}-${i}`,
        source: parentId,
        target: node.id,
        type: 'smoothstep',
        pathOptions: { borderRadius: 18 },
        markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 14, height: 14 },
        style: { stroke, strokeWidth: isMarriage ? 1.75 : 1.25, opacity: isMarriage ? 0.9 : 0.75 },
      });
    });
  }

  return { flowNodes, flowEdges };
}

function GraphInner({
  instanceId, userId, ownerHandle, useMock, inSynthesis = false, openPostRequest, onOpenPostRequestHandled,
}: {
  instanceId: string; userId: string; ownerHandle: string; useMock: boolean;
  // The group's live measure, drawn on the idea's home hub.
  inSynthesis?: boolean;
  openPostRequest: { nodeId: string; replyId?: string } | null;
  onOpenPostRequestHandled: () => void;
}) {
  const [frames, setFrames] = useState<SynFrame[]>(useMock ? MOCK_FRAMES : []);
  // Mirrors `frames` synchronously (a ref, not state) so coinFrame() can add
  // a locally-coined frame and have it resolvable by useMyMap's
  // toAxisSpecs() in the very same tick — NodeSheet/CreateSheet call
  // onCoinFrame then immediately onSetAxes with the returned id, and a
  // setFrames() update wouldn't be visible to the setAxes closure until the
  // next render (BUG 1's frame-persistence fix).
  const framesRef = useRef<SynFrame[]>(frames);
  useEffect(() => { framesRef.current = frames; }, [frames]);
  const resolveLocalFrame = useCallback(
    (id: string) => framesRef.current.find(f => f.id === id),
    [],
  );

  // Real path only: the community's shared axis vocabulary (GET /synthesis/frames).
  const refreshFrames = useCallback(() => {
    if (useMock) return;
    SynthesisService.frames(instanceId, userId)
      .then(({ frames: serverFrames }) => setFrames(serverFrames))
      .catch(err => console.debug('[synthesis] frames load failed', err));
  }, [useMock, instanceId, userId]);

  useEffect(() => {
    refreshFrames();
  }, [refreshFrames]);

  const { nodes, byId, addRoot, addChild, marry, editNode, setAxes, setPublished, mergeNode, reparentNode } =
    useMyMap(instanceId, userId, ownerHandle, { seedMock: useMock, resolveLocalFrame, refreshFrames });

  const [marryMode, setMarryMode] = useState(false);
  const [marrySelection, setMarrySelection] = useState<string[]>([]);
  // D19 move mode: armed from the node sheet; the next tap picks the new
  // parent. Mirrors marry mode's shape — one armed state, one bottom bar.
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
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
  // A citation chip's replyId (task item: Ask citation deep-link) — set
  // alongside postNodeId only when the open request named a specific reply,
  // so PostOverlay can scroll to and highlight that one reply row. Cleared
  // whenever the post itself is closed or a new open request lands without one.
  const [highlightReplyId, setHighlightReplyId] = useState<string | null>(null);
  // Mock path: repliesByPost seeds MOCK_POST's thread from the mock corpus;
  // any other post (most of the viewer's own map) starts with an empty
  // thread — both are real states the read-first view needs to handle.
  const [repliesByPost, setRepliesByPost] = useState<Record<string, SynthesisReply[]>>(
    useMock ? { [MOCK_POST.id]: MOCK_REPLIES } : {},
  );
  // Real path: GET /synthesis/nodes/:id/post — the published post + its live
  // public reply thread (D6/D9). Fetched fresh per postNodeId so the reply
  // map is never stale, own-node or not.
  const [remotePost, setRemotePost] = useState<{ post: SynNode; replies: SynthesisReply[] } | null>(null);

  useEffect(() => {
    if (openPostRequest) {
      setPostNodeId(openPostRequest.nodeId);
      setHighlightReplyId(openPostRequest.replyId ?? null);
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
    SynthesisService.getPost(instanceId, postNodeId, userId)
      .then(data => { if (!cancelled) setRemotePost(data); })
      .catch(err => { console.debug('[synthesis] post load failed', err); if (!cancelled) setRemotePost(null); });
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
  // reply AND an upvote toggle (utils/synNodes.js emits it from both
  // respond() and upvoteReply()) — upsert by reply id into whichever post is
  // currently open.
  useEffect(() => {
    if (useMock) return;
    return synthesisSocket.on('reply_upserted', payload => {
      const { postId, reply } = payload as { postId: string; reply: SynthesisReply };
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
    setHighlightReplyId(null);
  }, []);

  const { flowNodes, flowEdges } = useMemo(
    () => buildFlow(nodes, marryMode, marrySelection, openSource, inSynthesis),
    [nodes, marryMode, marrySelection, openSource, inSynthesis],
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
        .filter((f): f is SynFrame => !!f)
        .map(f => ({ frameId: f.id, poleA: f.poleA, poleB: f.poleB }))
    : [];
  // "own node" for the Edit gate (item 2) means it's actually on THIS map
  // under this owner — not just origin:'own' relative to some other
  // author's map (MOCK_POST/MOCK_FEED entries are also origin:'own' on
  // their own author's map, so byId membership is the real test).
  const postOnMyMap = !!postNode && byId.has(postNode.id);
  const postIsMine = postOnMyMap && postNode!.origin === 'own';
  // M2: a BORROWED node that's on my own map gets the "make it mine"
  // affordance instead of the reply composer — it's a private draft on my
  // map, not someone else's live post, so replying to it makes no sense; the
  // real entry point is promoting it (editNode flips origin borrowed->own,
  // see useMyMap.ts). A borrowed node NOT on my map (i.e. viewed via a
  // provenance breadcrumb / feed — impossible today since sourceNodeId
  // always points to someone else's ORIGINAL thought, which is origin:'own'
  // on its author's map) would fall through to the normal reply composer.
  const postCanPromote = postOnMyMap && postNode!.origin === 'borrowed';

  function coinFrame(poleA: string, poleB: string): string {
    const id = 'local_fr_' + Math.random().toString(36).slice(2, 8);
    const frame: SynFrame = { id, instanceId, parentInstanceId: null, poleA, poleB, key: null, createdBy: userId, createdByName: ownerHandle };
    // Update the ref synchronously — NodeSheet/CreateSheet call onSetAxes
    // with this id right after onCoinFrame returns, in the same tick, and
    // useMyMap's resolveLocalFrame needs to see it immediately (the setFrames
    // below only lands on the next render).
    framesRef.current = [...framesRef.current, frame];
    setFrames(prev => [...prev, frame]);
    return id;
  }

  function handleNodeClick(nodeId: string) {
    if (movingId) {
      if (nodeId !== movingId) {
        // The hook's cycle guard answers synchronously; the server enforces
        // the same rule again on the sync call.
        if (reparentNode(movingId, [nodeId])) {
          setMovingId(null);
          setMoveError(null);
        } else {
          setMoveError('Not there — that would loop the map. Pick another spot.');
        }
      }
      return;
    }
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
    setPopupNodeId(null);
    setMarryMode(true);
    setMarrySelection([nodeId]);
  }

  function startMoveFrom(nodeId: string) {
    setSheetNodeId(null);
    setPopupNodeId(null);
    setMoveError(null);
    setMovingId(nodeId);
  }

  // The create intent carries its own parentId (rather than reading
  // sheetNodeId) so growth can start from anywhere a node is reachable — the
  // thought popup as well as the node sheet — without the sheet having to be
  // open behind it.
  function addBelow(nodeId: string) {
    const node = byId.get(nodeId);
    if (!node) return;
    setPopupNodeId(null);
    setSheetNodeId(null);
    setCreateIntent({
      type: 'child',
      parentId: nodeId,
      parentKind: node.kind,
      parentLabel: (node.kind === 'topic' ? node.content.topic : node.content.thought).slice(0, 24),
    });
  }

  function submitCreate(kind: NodeKind, content: Partial<NodeContent>, axisFrameIds: string[]) {
    if (!createIntent) return;
    if (createIntent.type === 'root') addRoot(kind, content, axisFrameIds);
    if (createIntent.type === 'child') addChild(createIntent.parentId, kind, content, axisFrameIds);
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
    SynthesisService.upvoteReply(instanceId, postId, replyId, userId)
      .then(({ reply }) => setRemotePost(prev => (prev && prev.post.id === postId
        ? { ...prev, replies: prev.replies.map(r => (r.id === reply.id ? reply : r)) }
        : prev)))
      .catch(err => console.debug('[synthesis] upvote failed', err));
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
        const reply: SynthesisReply = {
          id: 'local_' + Date.now(), activityId: postId, userId, username: ownerHandle,
          position: stance, text: context, voterIds: [], voteCount: 0,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        return { ...prev, [postId]: [reply, ...existing.filter(r => r.userId !== userId)] };
      });
      return;
    }
    SynthesisService.respond(instanceId, postId, stance, context, userId)
      .then(({ reply, node }) => {
        setRemotePost(prev => {
          if (!prev || prev.post.id !== postId) return prev;
          const idx = prev.replies.findIndex(r => r.id === reply.id);
          const replies = idx === -1 ? [reply, ...prev.replies] : prev.replies.map(r => (r.id === reply.id ? reply : r));
          return { ...prev, replies };
        });
        if (node) mergeNode(node);
      })
      .catch(err => console.debug('[synthesis] respond failed', err));
  }

  const selectedNodes = marrySelection.map(id => byId.get(id)).filter((n): n is SynNode => !!n);

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

      {!marryMode && !movingId && (
        <button
          onClick={() => setCreateIntent({ type: 'root' })}
          aria-label="Add to your map"
          className="tone-in absolute bottom-24 right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full text-2xl"
          style={{ background: 'var(--own)', color: 'var(--dusk-deep)', boxShadow: 'var(--shadow-card)' }}
        >
          +
        </button>
      )}

      {!marryMode && !movingId && (
        <button
          onClick={() => setMarryMode(true)}
          className="eyebrow tone-in absolute bottom-24 left-5 z-20 rounded-full border px-4 py-3"
          style={{ borderColor: 'var(--join)', color: 'var(--join)', background: 'var(--dusk-raised)' }}
        >
          ◆ Marry
        </button>
      )}

      {movingId && (
        <div
          className="tone-in absolute inset-x-4 bottom-24 z-20 rounded-2xl border p-4"
          style={{ borderColor: 'var(--line-strong)', background: 'var(--dusk-raised)' }}
        >
          <p className="text-sm" style={{ color: 'var(--mist)' }}>
            Moving &ldquo;{(() => {
              const n = byId.get(movingId);
              return ((n?.kind === 'topic' ? n?.content.topic : n?.content.thought) ?? '').slice(0, 40);
            })()}&rdquo; — tap its new parent.
          </p>
          {moveError && <p className="mt-1 text-xs" style={{ color: 'var(--live)' }}>{moveError}</p>}
          <button
            type="button"
            onClick={() => { setMovingId(null); setMoveError(null); }}
            className="eyebrow mt-2 underline"
            style={{ color: 'var(--mist-faint)' }}
          >
            Leave it where it is
          </button>
        </div>
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
          onAddChild={() => addBelow(popupNode.id)}
          onStartMarry={() => startMarryFrom(popupNode.id)}
        />
      )}

      {postNode && (
        <PostOverlay
          node={postNode}
          axes={postAxes}
          replies={useMock ? repliesByPost[postNode.id] ?? [] : remotePost?.replies ?? []}
          isMine={postIsMine}
          canPromote={postCanPromote}
          viewerId={userId}
          live={!useMock}
          highlightReplyId={highlightReplyId}
          onClose={() => { setPostNodeId(null); setHighlightReplyId(null); }}
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
        instanceId={instanceId}
        parentNodes={(sheetNode?.parentIds ?? []).map(id => byId.get(id)).filter((n): n is SynNode => !!n)}
        onClose={() => setSheetNodeId(null)}
        onEdit={content => sheetNode && editNode(sheetNode.id, content)}
        onSetAxes={ids => sheetNode && setAxes(sheetNode.id, ids)}
        onCoinFrame={coinFrame}
        onPublishToggle={() => sheetNode && setPublished(sheetNode.id, sheetNode.visibility !== 'published')}
        onAddChild={() => sheetNode && addBelow(sheetNode.id)}
        onStartMarry={() => sheetNode && startMarryFrom(sheetNode.id)}
        onStartMove={() => sheetNode && startMoveFrom(sheetNode.id)}
        onUnmarry={keepId => {
          if (!sheetNode) return;
          reparentNode(sheetNode.id, [keepId]);
          setSheetNodeId(null);
        }}
        onOpenSource={openSource}
      />

      <CreateSheet
        open={!!createIntent}
        intent={createIntent}
        frames={frames}
        instanceId={instanceId}
        onCancel={() => setCreateIntent(null)}
        onSubmit={submitCreate}
        onCoinFrame={coinFrame}
      />
    </div>
  );
}

export default function MapGraph(props: {
  instanceId: string; userId: string; ownerHandle: string; useMock: boolean;
  inSynthesis?: boolean;
  openPostRequest: { nodeId: string; replyId?: string } | null;
  onOpenPostRequestHandled: () => void;
}) {
  return (
    <ReactFlowProvider>
      <GraphInner {...props} />
    </ReactFlowProvider>
  );
}
