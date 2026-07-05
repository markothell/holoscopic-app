'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { GameService } from '@/services/gameService';
import { spectrumSocket } from '@/services/socket';
import type {
  Game, Nomination, PhaseChangedPayload, Participant, RankingDone, ResultDot, Snapshot,
} from '@/lib/types';

// One hook owns the whole live game: fetch the snapshot, join the socket
// room, reduce every broadcast into GameState. The snapshot is the source
// of truth (re-fetched on focus/reconnect); sockets only lower latency.

export interface GameState {
  loading: boolean;
  error: string | null;
  game: Game | null;
  nominations: Nomination[];
  results: ResultDot[] | null;
  rematchCode: string | null;
  needIdeasNudge: number; // increments each time the deadline extends for lack of ideas
}

type Action =
  | { type: 'snapshot'; snapshot: Snapshot }
  | { type: 'error'; message: string }
  | { type: 'player_joined'; participant: Participant }
  | { type: 'nomination'; entry: Nomination }
  | { type: 'phase_changed'; payload: PhaseChangedPayload }
  | { type: 'ranking_progress'; rankingDone?: RankingDone[] }
  | { type: 'rematch'; code: string };

const initialState: GameState = {
  loading: true,
  error: null,
  game: null,
  nominations: [],
  results: null,
  rematchCode: null,
  needIdeasNudge: 0,
};

function upsertNomination(list: Nomination[], entry: Nomination): Nomination[] {
  const i = list.findIndex(n => n.id === entry.id);
  if (i === -1) return [...list, entry];
  const next = [...list];
  next[i] = entry;
  return next;
}

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'snapshot':
      return {
        ...state,
        loading: false,
        error: null,
        game: action.snapshot.game,
        nominations: action.snapshot.nominations,
        results: action.snapshot.results ?? state.results,
      };
    case 'error':
      return { ...state, loading: false, error: action.message };
    case 'player_joined': {
      if (!state.game) return state;
      if (state.game.participants.some(p => p.id === action.participant.id)) return state;
      return {
        ...state,
        game: { ...state.game, participants: [...state.game.participants, action.participant] },
      };
    }
    case 'nomination':
      return { ...state, nominations: upsertNomination(state.nominations, action.entry) };
    case 'phase_changed': {
      if (!state.game) return state;
      const p = action.payload;
      return {
        ...state,
        game: {
          ...state.game,
          phase: p.phase,
          phaseDeadline: p.phaseDeadline,
          serverNow: p.serverNow,
          winningAxes: p.winningAxes?.length ? p.winningAxes : state.game.winningAxes,
          roster: p.roster?.length ? p.roster : state.game.roster,
        },
        results: p.results ?? state.results,
        needIdeasNudge: p.reason === 'need_ideas' ? state.needIdeasNudge + 1 : state.needIdeasNudge,
      };
    }
    case 'ranking_progress': {
      if (!state.game || !action.rankingDone) return state;
      return { ...state, game: { ...state.game, rankingDone: action.rankingDone } };
    }
    case 'rematch':
      return { ...state, rematchCode: action.code };
    default:
      return state;
  }
}

export function useGame(code: string) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const gameIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const snapshot = await GameService.snapshot(code);
      dispatch({ type: 'snapshot', snapshot });
      if (snapshot.game.id !== gameIdRef.current) {
        gameIdRef.current = snapshot.game.id;
        spectrumSocket.connect(snapshot.game.id);
      }
    } catch (err) {
      dispatch({ type: 'error', message: err instanceof Error ? err.message : 'Could not load game' });
    }
  }, [code]);

  useEffect(() => {
    refresh();
    const subs = [
      spectrumSocket.on('player_joined', (p) =>
        dispatch({ type: 'player_joined', participant: (p as { participant: Participant }).participant })),
      spectrumSocket.on('nomination_upserted', (p) =>
        dispatch({ type: 'nomination', entry: (p as { entry: Nomination }).entry })),
      spectrumSocket.on('nomination_voted', (p) =>
        dispatch({ type: 'nomination', entry: (p as { entry: Nomination }).entry })),
      spectrumSocket.on('phase_changed', (p) =>
        dispatch({ type: 'phase_changed', payload: p as PhaseChangedPayload })),
      spectrumSocket.on('ranking_progress', (p) =>
        dispatch({ type: 'ranking_progress', rankingDone: (p as { rankingDone?: RankingDone[] }).rankingDone })),
      spectrumSocket.on('rematch', (p) =>
        dispatch({ type: 'rematch', code: (p as { code: string }).code })),
      spectrumSocket.on('__reconnect', () => { refresh(); }),
    ];

    const onFocus = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);

    return () => {
      subs.forEach(u => u());
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
      spectrumSocket.disconnect();
      gameIdRef.current = null;
    };
  }, [code, refresh]);

  return { ...state, refresh };
}
