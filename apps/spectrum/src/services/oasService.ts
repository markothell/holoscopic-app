import { apiFetch } from './api';
import type {
  AxisPair, Game, Nomination, Proposal, RoundSeconds, Snapshot,
} from '@/lib/types';

export interface CreateGameInput {
  topic: string;
  themes?: string[];
  config?: {
    roundSeconds?: Partial<RoundSeconds>;
    startingTokens?: number;
    quorum?: number;
    votesPerUser?: number;
    maxPlayers?: number;
  };
}

// Typed wrappers for /api/oas. Every mutation carries the signed-in user's
// id; api.ts attaches the verified game token.
export const OasService = {
  create(input: CreateGameInput, userId: string) {
    return apiFetch<{ game: Game; balance: number }>('/oas/games', {
      method: 'POST', body: input, userId,
    });
  },

  snapshot(code: string, userId?: string | null) {
    return apiFetch<Snapshot>(`/oas/games/${code}`, { userId: userId ?? undefined });
  },

  join(code: string, userId: string) {
    return apiFetch<{ game: Game; balance: number }>(`/oas/games/${code}/join`, {
      method: 'POST', userId,
    });
  },

  start(code: string, userId: string) {
    return apiFetch<{ game: Game }>(`/oas/games/${code}/start`, {
      method: 'POST', userId,
    });
  },

  advance(code: string, userId: string) {
    return apiFetch<{ game: Game }>(`/oas/games/${code}/advance`, {
      method: 'POST', userId,
    });
  },

  nominateSubtopic(code: string, title: string, userId: string) {
    return apiFetch<{ nomination: Nomination }>(`/oas/games/${code}/nominations`, {
      method: 'POST', body: { title }, userId,
    });
  },

  nominateMap(code: string, subtopicId: string, axes: AxisPair, userId: string) {
    return apiFetch<{ nomination: Nomination }>(`/oas/games/${code}/nominations`, {
      method: 'POST', body: { subtopicId, axes }, userId,
    });
  },

  stake(code: string, nominationId: string, userId: string) {
    return apiFetch<{ nomination: Nomination }>(
      `/oas/games/${code}/nominations/${nominationId}/stake`,
      { method: 'POST', userId },
    );
  },

  unstake(code: string, nominationId: string, userId: string) {
    return apiFetch<{ nomination: Nomination }>(
      `/oas/games/${code}/nominations/${nominationId}/unstake`,
      { method: 'POST', userId },
    );
  },

  joinMap(code: string, activityId: string, userId: string) {
    return apiFetch<{ nomination: Nomination }>(
      `/oas/games/${code}/maps/${activityId}/join`,
      { method: 'POST', userId },
    );
  },

  claimMapStake(code: string, activityId: string, userId: string) {
    return apiFetch<{ nomination: Nomination; balance: number }>(
      `/oas/games/${code}/maps/${activityId}/claim`,
      { method: 'POST', userId },
    );
  },

  submitProposal(code: string, topic: string, themes: string[], userId: string) {
    return apiFetch<{ proposal: Proposal }>(`/oas/games/${code}/proposals`, {
      method: 'POST', body: { topic, themes }, userId,
    });
  },

  joinProposal(code: string, proposalId: string, userId: string) {
    return apiFetch<{ code: string; game: Game }>(
      `/oas/games/${code}/proposals/${proposalId}/join`,
      { method: 'POST', userId },
    );
  },
};
