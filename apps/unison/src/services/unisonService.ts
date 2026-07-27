import { apiFetch } from './api';
import type { Community, FrameSpec, Membership, NodeContent, NodeKind, UnisonFrame, UnisonNode, UnisonReply } from '@/lib/types';

// Typed wrappers for the live M0b REST surface (routes/unison.js). Matches
// its two addressing schemes (apps/unison/PLAN.md §5):
//   - /communities* is addressed by shareable CODE — you don't have the
//     community's instance id until you've created or joined it.
//   - /nodes* and /frames* run against the resolved x-instance-id, exactly
//     like every other instance-scoped surface in the app.
// Every call here degrades gracefully in useMyMap — the hook is local-state
// first and treats a failed/absent backend as "not synced yet," never a
// hard error, so the app renders on seed data with no server (or no
// community membership) in place.

export const UnisonService = {
  createCommunity(input: { name: string; handle: string }, userId: string) {
    return apiFetch<{ community: Community; membership: Membership }>('/unison/communities', {
      method: 'POST', body: input, userId,
    });
  },

  joinCommunity(code: string, handle: string, userId: string) {
    return apiFetch<{ community: Community; membership: Membership }>(`/unison/communities/${code}/join`, {
      method: 'POST', body: { handle }, userId,
    });
  },

  getCommunity(code: string, userId?: string | null) {
    return apiFetch<{ community: Community; membership: Membership | null }>(`/unison/communities/${code}`, {
      userId: userId ?? undefined,
    });
  },

  myCommunities(userId: string) {
    return apiFetch<{ communities: (Community & { membership: Membership })[] }>('/unison/me/communities', { userId });
  },

  // Flat indexed scan of the caller's own map (UnisonNode.find({instanceId, ownerId})).
  myMap(instanceId: string, userId: string) {
    return apiFetch<{ nodes: UnisonNode[] }>('/unison/nodes', { instanceId, userId });
  },

  // parentId omitted → root; given → child. `axes` are specs (borrow an
  // existing frame with {frameId}, or coin one with {poleA, poleB}) — the
  // server resolves/dedupes them, never takes raw frame ids directly.
  createRoot(instanceId: string, kind: NodeKind, content: Partial<NodeContent>, axes: FrameSpec[], userId: string) {
    return apiFetch<{ node: UnisonNode }>('/unison/nodes', {
      method: 'POST', instanceId, userId, body: { kind, content, axes },
    });
  },

  createChild(instanceId: string, parentId: string, kind: NodeKind, content: Partial<NodeContent>, axes: FrameSpec[], userId: string) {
    return apiFetch<{ node: UnisonNode }>('/unison/nodes', {
      method: 'POST', instanceId, userId, body: { parentId, kind, content, axes },
    });
  },

  // Thought⨯Thought or Topic⨯Topic only — no cross-kind marriage (D4).
  marry(instanceId: string, parentIds: [string, string], kind: NodeKind, content: Partial<NodeContent>, axes: FrameSpec[], userId: string) {
    return apiFetch<{ node: UnisonNode }>('/unison/nodes/marry', {
      method: 'POST', instanceId, userId, body: { parentIds, kind, content, axes },
    });
  },

  editContent(instanceId: string, nodeId: string, content: Partial<NodeContent>, userId: string) {
    return apiFetch<{ node: UnisonNode }>(`/unison/nodes/${nodeId}`, {
      method: 'PATCH', instanceId, userId, body: { content },
    });
  },

  setAxes(instanceId: string, nodeId: string, axes: FrameSpec[], userId: string) {
    return apiFetch<{ node: UnisonNode }>(`/unison/nodes/${nodeId}`, {
      method: 'PATCH', instanceId, userId, body: { axes },
    });
  },

  reparent(instanceId: string, nodeId: string, parentIds: string[], userId: string) {
    return apiFetch<{ node: UnisonNode }>(`/unison/nodes/${nodeId}/parent`, {
      method: 'PATCH', instanceId, userId, body: { parentIds },
    });
  },

  publish(instanceId: string, nodeId: string, userId: string) {
    return apiFetch<{ node: UnisonNode }>(`/unison/nodes/${nodeId}/publish`, {
      method: 'POST', instanceId, userId,
    });
  },

  unpublish(instanceId: string, nodeId: string, userId: string) {
    return apiFetch<{ node: UnisonNode }>(`/unison/nodes/${nodeId}/unpublish`, {
      method: 'POST', instanceId, userId,
    });
  },

  frames(instanceId: string, userId: string) {
    return apiFetch<{ frames: UnisonFrame[] }>('/unison/frames', { instanceId, userId });
  },

  // Body IS the spec ({frameId} or {poleA, poleB}) — no wrapper key.
  resolveFrame(instanceId: string, spec: FrameSpec, userId: string) {
    return apiFetch<{ frame: UnisonFrame }>('/unison/frames', {
      method: 'POST', instanceId, userId, body: spec,
    });
  },

  // ── M1: publish → borrow → the networking loop ─────────────────────────

  // Recency-first, published-only across the community; each item carries
  // ownerHandle + topicLabel for Feed's switchable lenses (D10).
  feed(instanceId: string, userId: string) {
    return apiFetch<{ feed: UnisonNode[] }>('/unison/feed', { instanceId, userId });
  },

  // A published post + its public reply thread (comment section, D6/D9).
  getPost(instanceId: string, nodeId: string, userId: string) {
    return apiFetch<{ post: UnisonNode; replies: UnisonReply[] }>(`/unison/nodes/${nodeId}/post`, {
      instanceId, userId,
    });
  },

  // The two-record write (D2): a public reply Entry on the post + a borrowed
  // node dropped silently on my own map (D8). `node` is null for a
  // self-response. Re-responding upserts both (no duplicate reply/borrow).
  respond(instanceId: string, nodeId: string, position: { x: number; y: number }, text: string, userId: string) {
    return apiFetch<{ reply: UnisonReply; node: UnisonNode | null }>(`/unison/nodes/${nodeId}/respond`, {
      method: 'POST', instanceId, userId, body: { position, text },
    });
  },

  // Toggles a free upvote on a reply (D9) — a second call by the same user un-votes.
  upvoteReply(instanceId: string, nodeId: string, entryId: string, userId: string) {
    return apiFetch<{ reply: UnisonReply }>(`/unison/nodes/${nodeId}/replies/${entryId}/upvote`, {
      method: 'POST', instanceId, userId,
    });
  },
};
