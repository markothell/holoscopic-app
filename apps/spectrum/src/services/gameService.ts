import { apiFetch } from './api';
import type {
  Axis, Game, Nomination, PlayerIdentity, ResultDot, Snapshot, Participant,
} from '@/lib/types';

interface JoinResponse {
  game: Game;
  player?: Participant;
  token?: string | null;
  spectator?: boolean;
}

export const GameService = {
  create(hostName: string) {
    return apiFetch<{ game: Game; player: Participant; token: string | null }>(
      '/spectrum/games', { method: 'POST', body: { hostName } },
    );
  },

  snapshot(code: string) {
    return apiFetch<Snapshot>(`/spectrum/games/${code}`);
  },

  join(code: string, name: string) {
    return apiFetch<JoinResponse>(`/spectrum/games/${code}/join`, {
      method: 'POST', body: { name },
    });
  },

  start(code: string, auth: PlayerIdentity) {
    return apiFetch<{ game: Game }>(`/spectrum/games/${code}/start`, {
      method: 'POST', auth,
    });
  },

  nominate(code: string, text: string, auth: PlayerIdentity) {
    return apiFetch<{ entry: Nomination }>(`/spectrum/games/${code}/nominations`, {
      method: 'POST', body: { text }, auth,
    });
  },

  vote(code: string, entryId: string, auth: PlayerIdentity) {
    return apiFetch<{ entry: Nomination }>(
      `/spectrum/games/${code}/nominations/${entryId}/vote`,
      { method: 'POST', auth },
    );
  },

  advance(code: string, auth: PlayerIdentity) {
    return apiFetch<{ game: Game }>(`/spectrum/games/${code}/advance`, {
      method: 'POST', auth,
    });
  },

  submitRanking(code: string, axis: Axis, order: string[], done: boolean, auth: PlayerIdentity) {
    return apiFetch<{ game: Game }>(`/spectrum/games/${code}/rankings/${axis}`, {
      method: 'PUT', body: { order, done }, auth,
    });
  },

  saveStory(code: string, axis: Axis, subjectIndex: number, text: string, auth: PlayerIdentity) {
    return apiFetch<{ entry: unknown }>(
      `/spectrum/games/${code}/stories/${axis}/${subjectIndex}`,
      { method: 'PUT', body: { text }, auth },
    );
  },

  reveal(code: string, auth: PlayerIdentity) {
    return apiFetch<{ game: Game }>(`/spectrum/games/${code}/reveal`, {
      method: 'POST', auth,
    });
  },

  results(code: string) {
    return apiFetch<{ results: ResultDot[] }>(`/spectrum/games/${code}/results`);
  },

  rematch(code: string, auth: PlayerIdentity) {
    return apiFetch<{ game: Game }>(`/spectrum/games/${code}/rematch`, {
      method: 'POST', auth,
    });
  },
};
