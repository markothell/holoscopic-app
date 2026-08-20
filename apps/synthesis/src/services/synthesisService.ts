import { apiFetch, apiStream } from './api';
import type { Collaborator, FrameSpec, Idea, Membership, MyIdea, NodeContent, NodeKind, Statement, StatementBoard, SynthesisCache, SynthesisDepth, SynthesisState, SynFrame, SynNode, SynthesisReply } from '@/lib/types';

// Typed wrappers for the live REST surface (routes/synthesis.js). Matches
// its two addressing schemes (apps/synthesis/PLAN.md §5):
//   - /ideas* is addressed by shareable CODE — you don't have an idea's
//     instance id until you've drafted or joined it.
//   - /nodes* and /frames* run against the resolved x-instance-id, exactly
//     like every other instance-scoped surface in the app.
// Every call here degrades gracefully in useMyMap — the hook is local-state
// first and treats a failed/absent backend as "not synced yet," never a
// hard error, so the app renders on seed data with no server (or no
// idea membership) in place.

export const SynthesisService = {
  // No handle: your display name comes off your Holoscopic account, server-side
  // (pseudonymity dropped 2026-08-20, reversing PLAN D3).
  createIdea(input: { title: string; visibility?: 'public' | 'private' }, userId: string) {
    return apiFetch<{ idea: Idea; membership: Membership }>('/synthesis/ideas', {
      method: 'POST', body: input, userId,
    });
  },

  joinIdea(code: string, userId: string) {
    return apiFetch<{ idea: Idea; membership: Membership }>(`/synthesis/ideas/${code}/join`, {
      method: 'POST', body: {}, userId,
    });
  },

  getIdea(code: string, userId?: string | null) {
    return apiFetch<{ idea: Idea; membership: Membership | null }>(`/synthesis/ideas/${code}`, {
      userId: userId ?? undefined,
    });
  },

  // The app's home surface: what I drafted and what I joined, with the stats
  // that list renders.
  myIdeas(userId: string) {
    return apiFetch<{ ideas: MyIdea[] }>('/synthesis/me/ideas', { userId });
  },

  // The browse directory — public ideas only (D13); the server never lists a
  // private one.
  publicIdeas(userId: string) {
    return apiFetch<{ ideas: Idea[] }>('/synthesis/ideas/public', { userId });
  },

  // The social page: who is working on this idea. Collaborators only.
  collaborators(code: string, userId: string) {
    return apiFetch<{ collaborators: Collaborator[] }>(`/synthesis/ideas/${code}/collaborators`, { userId });
  },

  // One collaborator's thinking inside this idea, as their map — the way into
  // someone's work from the social page.
  // Addressed by userId — a display name is not unique any more.
  collaboratorMap(code: string, collaboratorUserId: string, userId: string) {
    return apiFetch<{ collaborator: Membership; nodes: SynNode[] }>(
      `/synthesis/ideas/${code}/collaborators/${encodeURIComponent(collaboratorUserId)}/map`,
      { userId },
    );
  },

  // ── Statements: the synthesis mechanism ────────────────────────────────
  // The voting surface — ranked statements wrapped in the group's live
  // measure and my remaining slots.
  statements(instanceId: string, userId: string) {
    return apiFetch<StatementBoard>('/synthesis/statements', { instanceId, userId });
  },

  submitStatement(instanceId: string, userId: string, text: string, sourceUnionId?: string | null) {
    return apiFetch<{ statement: Statement }>('/synthesis/statements', {
      method: 'POST', body: { text, sourceUnionId: sourceUnionId ?? null }, instanceId, userId,
    });
  },

  // A toggle: backing a statement, or taking that backing away. Either can
  // move the group across the bar, so the response carries the new state.
  voteStatement(instanceId: string, userId: string, statementId: string) {
    return apiFetch<{ statement: Statement; state: SynthesisState; enteredSynthesis: boolean; leftSynthesis: boolean }>(
      `/synthesis/statements/${statementId}/vote`,
      { method: 'POST', instanceId, userId },
    );
  },

  withdrawStatement(instanceId: string, userId: string, statementId: string) {
    return apiFetch<{ statement: Statement; state: SynthesisState }>(
      `/synthesis/statements/${statementId}`,
      { method: 'DELETE', instanceId, userId },
    );
  },

  // Flat indexed scan of the caller's own map (SynNode.find({instanceId, ownerId})).
  myMap(instanceId: string, userId: string) {
    return apiFetch<{ nodes: SynNode[] }>('/synthesis/nodes', { instanceId, userId });
  },

  // parentId omitted → root; given → child. `axes` are specs (borrow an
  // existing frame with {frameId}, or coin one with {poleA, poleB}) — the
  // server resolves/dedupes them, never takes raw frame ids directly.
  createRoot(instanceId: string, kind: NodeKind, content: Partial<NodeContent>, axes: FrameSpec[], userId: string) {
    return apiFetch<{ node: SynNode }>('/synthesis/nodes', {
      method: 'POST', instanceId, userId, body: { kind, content, axes },
    });
  },

  createChild(instanceId: string, parentId: string, kind: NodeKind, content: Partial<NodeContent>, axes: FrameSpec[], userId: string) {
    return apiFetch<{ node: SynNode }>('/synthesis/nodes', {
      method: 'POST', instanceId, userId, body: { parentId, kind, content, axes },
    });
  },

  // Thought⨯Thought or Topic⨯Topic only — no cross-kind marriage (D4).
  marry(instanceId: string, parentIds: [string, string], kind: NodeKind, content: Partial<NodeContent>, axes: FrameSpec[], userId: string) {
    return apiFetch<{ node: SynNode }>('/synthesis/nodes/marry', {
      method: 'POST', instanceId, userId, body: { parentIds, kind, content, axes },
    });
  },

  editContent(instanceId: string, nodeId: string, content: Partial<NodeContent>, userId: string) {
    return apiFetch<{ node: SynNode }>(`/synthesis/nodes/${nodeId}`, {
      method: 'PATCH', instanceId, userId, body: { content },
    });
  },

  setAxes(instanceId: string, nodeId: string, axes: FrameSpec[], userId: string) {
    return apiFetch<{ node: SynNode }>(`/synthesis/nodes/${nodeId}`, {
      method: 'PATCH', instanceId, userId, body: { axes },
    });
  },

  reparent(instanceId: string, nodeId: string, parentIds: string[], userId: string) {
    return apiFetch<{ node: SynNode }>(`/synthesis/nodes/${nodeId}/parent`, {
      method: 'PATCH', instanceId, userId, body: { parentIds },
    });
  },

  // Deleting orphans the children rather than cascading — they stay on the
  // map as their own root and the move gesture re-files them.
  deleteNode(instanceId: string, nodeId: string, userId: string) {
    return apiFetch<{ deleted: string }>(`/synthesis/nodes/${nodeId}`, {
      method: 'DELETE', instanceId, userId,
    });
  },

  frames(instanceId: string, userId: string) {
    return apiFetch<{ frames: SynFrame[] }>('/synthesis/frames', { instanceId, userId });
  },

  // Body IS the spec ({frameId} or {poleA, poleB}) — no wrapper key.
  resolveFrame(instanceId: string, spec: FrameSpec, userId: string) {
    return apiFetch<{ frame: SynFrame }>('/synthesis/frames', {
      method: 'POST', instanceId, userId, body: spec,
    });
  },

  // ── M1: read → borrow → the networking loop ────────────────────────────

  // Recency-first across the idea; each item carries
  // ownerHandle + topicLabel for Feed's switchable lenses (D10).
  feed(instanceId: string, userId: string) {
    return apiFetch<{ feed: SynNode[] }>('/synthesis/feed', { instanceId, userId });
  },

  // A post + its public reply thread (comment section, D6/D9).
  getPost(instanceId: string, nodeId: string, userId: string) {
    return apiFetch<{ post: SynNode; replies: SynthesisReply[] }>(`/synthesis/nodes/${nodeId}/post`, {
      instanceId, userId,
    });
  },

  // The two-record write (D2): a public reply Entry on the post + a borrowed
  // node dropped silently on my own map (D8). `node` is null for a
  // self-response. Re-responding upserts both (no duplicate reply/borrow).
  respond(instanceId: string, nodeId: string, position: { x: number; y: number }, text: string, userId: string) {
    return apiFetch<{ reply: SynthesisReply; node: SynNode | null }>(`/synthesis/nodes/${nodeId}/respond`, {
      method: 'POST', instanceId, userId, body: { position, text },
    });
  },

  // Toggles a free upvote on a reply (D9) — a second call by the same user un-votes.
  upvoteReply(instanceId: string, nodeId: string, entryId: string, userId: string) {
    return apiFetch<{ reply: SynthesisReply }>(`/synthesis/nodes/${nodeId}/replies/${entryId}/upvote`, {
      method: 'POST', instanceId, userId,
    });
  },

  // ── S1: the union — "The Group" ───────────────────────────
  // Replaces the M3 "Ask the Group" Q&A (question box, per-user thread) with
  // a single cached, whole-community artifact — see UnionOverlay.

  // The cached { brief?, full?, corpusVersion, stale } (UnionOverlay, on
  // open) — may be empty/absent if the community has never synthesized.
  getSynthesis(instanceId: string, userId: string) {
    return apiFetch<SynthesisCache>('/synthesis/synthesis', { instanceId, userId });
  },

  // The SSE POST (routes/synthesis.js's STREAMING CONTRACT) — (re)generates the
  // given depth, streams it, and updates the server-side cache. Returns the
  // raw Response — apiStream already turned a non-2xx (e.g. 503 "LLM not
  // configured") into an ApiError before this resolves, so a caller only
  // needs to read the body stream on success. UnionOverlay owns the
  // event:/data: frame parsing since EventSource can't POST.
  synthesizeStream(instanceId: string, depth: SynthesisDepth, userId: string, signal?: AbortSignal) {
    return apiStream('/synthesis/synthesis', { instanceId, userId, body: { depth }, signal });
  },
};
