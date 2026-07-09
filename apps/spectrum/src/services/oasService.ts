import { apiFetch } from './api';
import type {
  Axis, Game, MapDetail, MapEntry, Nomination, Proposal, RoundSeconds, Snapshot,
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

  nominateMap(code: string, subtopicId: string, dimensions: 1 | 2, userId: string) {
    return apiFetch<{ nomination: Nomination }>(`/oas/games/${code}/nominations`, {
      method: 'POST', body: { subtopicId, dimensions }, userId,
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

  mapDetail(code: string, mapId: string, userId?: string | null) {
    return apiFetch<MapDetail>(`/oas/games/${code}/maps/${mapId}`, {
      userId: userId ?? undefined,
    });
  },

  joinMap(code: string, mapId: string, userId: string) {
    return apiFetch<{ nomination: Nomination }>(
      `/oas/games/${code}/maps/${mapId}/join`,
      { method: 'POST', userId },
    );
  },

  submitMapItem(code: string, mapId: string, text: string, userId: string) {
    return apiFetch<{ entry: MapEntry }>(`/oas/games/${code}/maps/${mapId}/items`, {
      method: 'POST', body: { text }, userId,
    });
  },

  nominateMapAxis(code: string, mapId: string, label: string, userId: string) {
    return apiFetch<{ entry: MapEntry }>(`/oas/games/${code}/maps/${mapId}/axes`, {
      method: 'POST', body: { label }, userId,
    });
  },

  voteMapAxis(code: string, mapId: string, entryId: string, userId: string) {
    return apiFetch<{ entry: MapEntry }>(
      `/oas/games/${code}/maps/${mapId}/axes/${entryId}/vote`,
      { method: 'POST', userId },
    );
  },

  advanceMap(code: string, mapId: string, userId: string) {
    return apiFetch<{ nomination: Nomination }>(
      `/oas/games/${code}/maps/${mapId}/advance`,
      { method: 'POST', userId },
    );
  },

  submitMapRanking(code: string, mapId: string, axis: Axis, order: string[], done: boolean, userId: string) {
    return apiFetch<{ nomination: Nomination }>(
      `/oas/games/${code}/maps/${mapId}/rankings/${axis}`,
      { method: 'PUT', body: { order, done }, userId },
    );
  },

  claimMapStake(code: string, mapId: string, userId: string) {
    return apiFetch<{ nomination: Nomination; balance: number }>(
      `/oas/games/${code}/maps/${mapId}/claim`,
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
