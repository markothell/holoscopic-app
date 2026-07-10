'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { OasService } from '@/services/oasService';
import { oasSocket } from '@/services/socket';
import { useAuth } from '@/contexts/AuthContext';
import type {
  Game, MapRef, MapStagePayload, MyMapState, Nomination, Participant,
  PhaseChangedPayload, Proposal, RankingDone, Snapshot,
} from '@/lib/types';

// One hook owns the whole live game: fetch the snapshot, join the socket
// room, reduce every broadcast into GameState. The snapshot is the source
// of truth (re-fetched on focus/reconnect); sockets only lower latency.

export interface GameState {
  loading: boolean;
  error: string | null;
  game: Game | null;
  nominations: Nomination[];
  balance: number | null;
  myMaps: MyMapState[];
}

type Action =
  | { type: 'snapshot'; snapshot: Snapshot }
  | { type: 'error'; message: string }
  | { type: 'player_joined'; participant: Participant }
  | { type: 'nomination'; nomination: Nomination }
  | { type: 'phase_changed'; payload: PhaseChangedPayload }
  | { type: 'map_opened'; map: MapRef; nomination: Nomination }
  | { type: 'map_stage'; payload: MapStagePayload }
  | { type: 'map_ranked'; mapId: string; rankingDone: RankingDone[] }
  | { type: 'proposal'; proposal: Proposal }
  | { type: 'balance'; balance: number };

const initialState: GameState = {
  loading: true,
  error: null,
  game: null,
  nominations: [],
  balance: null,
  myMaps: [],
};

function upsertNomination(list: Nomination[], nomination: Nomination): Nomination[] {
  const i = list.findIndex(n => n.id === nomination.id);
  if (i === -1) return [...list, nomination];
  const next = [...list];
  next[i] = nomination;
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
        balance: action.snapshot.balance ?? state.balance,
        myMaps: action.snapshot.myMaps ?? state.myMaps,
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
      return { ...state, nominations: upsertNomination(state.nominations, action.nomination) };
    case 'phase_changed': {
      if (!state.game) return state;
      const p = action.payload;
      return {
        ...state,
        game: { ...state.game, phase: p.phase, phaseDeadline: p.phaseDeadline, serverNow: p.serverNow },
      };
    }
    case 'map_opened': {
      if (!state.game) return state;
      const exists = state.game.maps.some(m => m.nominationId === action.map.nominationId);
      return {
        ...state,
        game: exists ? state.game : { ...state.game, maps: [...state.game.maps, action.map] },
        nominations: upsertNomination(state.nominations, action.nomination),
      };
    }
    case 'map_stage': {
      const p = action.payload;
      return {
        ...state,
        nominations: state.nominations.map(n =>
          n.id === p.mapId && n.mapState
            ? {
                ...n,
                mapState: {
                  ...n.mapState,
                  stage: p.stage,
                  stageDeadline: p.stageDeadline,
                  winningAxes: p.winningAxes,
                  items: p.items,
                },
              }
            : n),
      };
    }
    case 'map_ranked':
      return {
        ...state,
        nominations: state.nominations.map(n =>
          n.id === action.mapId && n.mapState
            ? { ...n, mapState: { ...n.mapState, rankingDone: action.rankingDone } }
            : n),
      };
    case 'proposal': {
      if (!state.game) return state;
      const i = state.game.proposals.findIndex(p => p.id === action.proposal.id);
      const proposals = i === -1
        ? [...state.game.proposals, action.proposal]
        : state.game.proposals.map(p => (p.id === action.proposal.id ? action.proposal : p));
      return { ...state, game: { ...state.game, proposals } };
    }
    case 'balance':
      return { ...state, balance: action.balance };
    default:
      return state;
  }
}

export function useOasGame(code: string) {
  const { userId } = useAuth();
  const [state, dispatch] = useReducer(reducer, initialState);
  const gameIdRef = useRef<string | null>(null);
  const instanceIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const snapshot = await OasService.snapshot(code, userId);
      dispatch({ type: 'snapshot', snapshot });
      instanceIdRef.current = snapshot.game.instanceId;
      if (snapshot.game.id !== gameIdRef.current) {
        gameIdRef.current = snapshot.game.id;
        oasSocket.connect(snapshot.game.id, userId);
      }
    } catch (err) {
      dispatch({ type: 'error', message: err instanceof Error ? err.message : 'Could not load game' });
    }
  }, [code, userId]);

  useEffect(() => {
    refresh();
    const subs = [
      oasSocket.on('oas_player_joined', (p) =>
        dispatch({ type: 'player_joined', participant: (p as { participant: Participant }).participant })),
      oasSocket.on('oas_nomination_upserted', (p) =>
        dispatch({ type: 'nomination', nomination: (p as { nomination: Nomination }).nomination })),
      oasSocket.on('oas_nomination_staked', (p) =>
        dispatch({ type: 'nomination', nomination: (p as { nomination: Nomination }).nomination })),
      oasSocket.on('oas_phase_changed', (p) =>
        dispatch({ type: 'phase_changed', payload: p as PhaseChangedPayload })),
      oasSocket.on('oas_map_opened', (p) => {
        const { map, nomination } = p as { map: MapRef; nomination: Nomination };
        dispatch({ type: 'map_opened', map, nomination });
      }),
      oasSocket.on('oas_map_stage', (p) =>
        dispatch({ type: 'map_stage', payload: p as MapStagePayload })),
      oasSocket.on('oas_map_ranked', (p) => {
        const { mapId, rankingDone } = p as { mapId: string; rankingDone: RankingDone[] };
        dispatch({ type: 'map_ranked', mapId, rankingDone });
      }),
      oasSocket.on('oas_proposal_added', (p) =>
        dispatch({ type: 'proposal', proposal: (p as { proposal: Proposal }).proposal })),
      // Stake returns change my claim states — cheapest correct move is a refetch.
      oasSocket.on('oas_stake_returned', (p) => {
        if ((p as { userId: string }).userId === userId) refresh();
      }),
      // Balance push, scoped to this room's instance.
      oasSocket.on('holon_update', (p) => {
        const { balance, instanceId } = p as { balance: number; instanceId?: string };
        if (!instanceId || instanceId === instanceIdRef.current) {
          dispatch({ type: 'balance', balance });
        }
      }),
      oasSocket.on('__reconnect', () => { refresh(); }),
    ];

    const onFocus = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);

    return () => {
      subs.forEach(u => u());
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
      oasSocket.disconnect();
      gameIdRef.current = null;
    };
  }, [code, refresh, userId]);

  return { ...state, refresh };
}
