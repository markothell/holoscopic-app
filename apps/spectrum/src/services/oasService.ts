import { apiFetch } from './api';
import type {
  Axis, FrameSpec, Game, MapDetail, MapEntry, MeGames, Nomination, Proposal,
  Pulse, RoundMode, RoundSeconds, Snapshot,
} from '@/lib/types';

export interface CreateGameInput {
  topic: string;
  themes?: string[];
  config?: {
    roundSeconds?: Partial<RoundSeconds>;
    roundMode?: RoundMode;
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

  // Self-only: identity rides the verified bearer token.
  myGames(userId: string) {
    return apiFetch<MeGames>('/oas/me/games', { userId });
  },

  // Public — no auth needed, no names in the payload.
  pulse() {
    return apiFetch<Pulse>('/oas/pulse');
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

  nominateSubtopic(code: string, title: string, userId: string, parentSubtopicId?: string | null) {
    return apiFetch<{ nomination: Nomination }>(`/oas/games/${code}/nominations`, {
      method: 'POST', body: { title, parentSubtopicId: parentSubtopicId ?? null }, userId,
    });
  },

  // Rounds 2–4: the lens rides the proposal — 1 frame = a ranked line,
  // 2 frames = a 2×2 map. The subject is a subtopic (round 2) or a carried
  // previous-round item (rounds 3–4, sourceEntryId).
  nominateMap(
    code: string,
    subject: { subtopicId?: string; sourceEntryId?: string },
    frames: FrameSpec[],
    userId: string,
  ) {
    return apiFetch<{ nomination: Nomination }>(`/oas/games/${code}/nominations`, {
      method: 'POST', body: { ...subject, frames }, userId,
    });
  },

  // Nominator only: fill an open slot in their own slate.
  proposeFrame(code: string, nominationId: string, frame: FrameSpec, userId: string) {
    return apiFetch<{ nomination: Nomination }>(
      `/oas/games/${code}/nominations/${nominationId}/frames`,
      { method: 'POST', body: frame, userId },
    );
  },

  // Nominator only: pull one of their own spectrums pre-confirmation.
  removeFrame(code: string, nominationId: string, frameId: string, userId: string) {
    return apiFetch<{ nomination: Nomination }>(
      `/oas/games/${code}/nominations/${nominationId}/frames/${frameId}`,
      { method: 'DELETE', userId },
    );
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

  submitMapItem(
    code: string, mapId: string, label: string, comment: string, userId: string,
  ) {
    return apiFetch<{ entry: MapEntry }>(`/oas/games/${code}/maps/${mapId}/items`, {
      method: 'POST', body: { label, comment }, userId,
    });
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
