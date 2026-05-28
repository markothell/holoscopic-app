import { apiFetch } from '@/lib/api';

export interface Algorithm {
  id: string;
  title: string;
  thesis: string;
  description: string;
  authorId: string;
  authorName: string;
  sequenceId: string | null;
  forkParentId: string | null;
  forkDepth: number;
  royaltyPercent: number;
  status: 'draft' | 'published';
  publishedAt: string;
  forks?: AlgorithmFork[];
}

export interface AlgorithmFork {
  id: string;
  title: string;
  authorId: string;
  authorName: string;
  publishedAt: string;
}

export interface AlgorithmProposal {
  id: string;
  algorithmId: string;
  proposedBy: string;
  proposedByName: string;
  intent: string;
  status: 'open' | 'active' | 'cancelled';
  signups: { userId: string; joinedAt: string }[];
  quorumThreshold: number;
  sequenceId: string | null;
  expiresAt: string;
  createdAt: string;
}

export const AlgorithmService = {
  list: () =>
    apiFetch('/algorithms').then(d => d.algorithms as Algorithm[]),

  get: (id: string) =>
    apiFetch(`/algorithms/${id}`).then(d => d.algorithm as Algorithm),

  publish: (userId: string, payload: { title: string; thesis: string; description?: string; sequenceId?: string }) =>
    apiFetch('/algorithms/publish', { method: 'POST', userId, body: JSON.stringify(payload) }).then(d => d.algorithm as Algorithm),

  fork: (userId: string, parentId: string, payload: { title: string; thesis: string; description?: string; sequenceId?: string }) =>
    apiFetch(`/algorithms/${parentId}/fork`, { method: 'POST', userId, body: JSON.stringify(payload) })
      .then(d => ({ algorithm: d.algorithm as Algorithm, newSequenceUrlName: d.newSequenceUrlName as string | null })),

  linkSequence: (userId: string, algorithmId: string, sequenceId: string | null) =>
    apiFetch(`/algorithms/${algorithmId}/sequence`, { method: 'PATCH', userId, body: JSON.stringify({ sequenceId }) }).then(d => d.algorithm as Algorithm),

  listProposals: () =>
    apiFetch('/algorithms/proposals').then(d => d.proposals as (AlgorithmProposal & { algorithmTitle: string })[]),

  getMySessions: (userId: string) =>
    apiFetch('/algorithms/my-sessions', { userId }).then(d => d.sessions as {
      proposalId: string; algorithmId: string; algorithmTitle: string;
      intent: string; sequenceId: string; sequenceUrlName: string | null;
      sequenceTitle: string | null; sequenceStatus: string | null; createdAt: string;
    }[]),

  getProposals: (algorithmId: string) =>
    apiFetch(`/algorithms/${algorithmId}/proposals`).then(d => d.proposals as AlgorithmProposal[]),

  propose: (userId: string, algorithmId: string, intent: string) =>
    apiFetch(`/algorithms/${algorithmId}/proposals`, { method: 'POST', userId, body: JSON.stringify({ intent }) })
      .then(d => ({ proposal: d.proposal as AlgorithmProposal, sessionStarted: d.sessionStarted as boolean, sequenceUrlName: d.sequenceUrlName as string | null })),

  joinProposal: (userId: string, algorithmId: string, proposalId: string) =>
    apiFetch(`/algorithms/${algorithmId}/proposals/${proposalId}/join`, { method: 'POST', userId })
      .then(d => ({ proposal: d.proposal as AlgorithmProposal, sessionStarted: d.sessionStarted as boolean, sequenceUrlName: d.sequenceUrlName as string | null })),

  withdrawProposal: (userId: string, algorithmId: string, proposalId: string) =>
    apiFetch(`/algorithms/${algorithmId}/proposals/${proposalId}/withdraw`, { method: 'POST', userId })
      .then(d => d.proposal as AlgorithmProposal),
};
