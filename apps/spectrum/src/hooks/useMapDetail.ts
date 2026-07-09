'use client';

import { useCallback, useEffect, useReducer } from 'react';
import { OasService } from '@/services/oasService';
import { oasSocket } from '@/services/socket';
import { useAuth } from '@/contexts/AuthContext';
import type { MapDetail, MapEntry, MapStagePayload, RankingDone } from '@/lib/types';

// One open map sheet's live state: the detail payload folded with the
// oas_map_* broadcasts. Stage changes refetch — results and myRankings are
// stage-dependent and cheap to reload.

interface MapDetailState {
  loading: boolean;
  error: string | null;
  detail: MapDetail | null;
}

type Action =
  | { type: 'detail'; detail: MapDetail }
  | { type: 'error'; message: string }
  | { type: 'entry'; kind: 'item' | 'axis'; entry: MapEntry }
  | { type: 'ranked'; rankingDone: RankingDone[] };

function upsert(list: MapEntry[], entry: MapEntry): MapEntry[] {
  const i = list.findIndex(e => e.id === entry.id);
  if (i === -1) return [...list, entry];
  const next = [...list];
  next[i] = entry;
  return next;
}

function reducer(state: MapDetailState, action: Action): MapDetailState {
  switch (action.type) {
    case 'detail':
      return { loading: false, error: null, detail: action.detail };
    case 'error':
      return { ...state, loading: false, error: action.message };
    case 'entry': {
      if (!state.detail) return state;
      const key = action.kind === 'item' ? 'items' : 'axisIdeas';
      return {
        ...state,
        detail: { ...state.detail, [key]: upsert(state.detail[key], action.entry) },
      };
    }
    case 'ranked': {
      if (!state.detail?.nomination.mapState) return state;
      return {
        ...state,
        detail: {
          ...state.detail,
          nomination: {
            ...state.detail.nomination,
            mapState: { ...state.detail.nomination.mapState, rankingDone: action.rankingDone },
          },
        },
      };
    }
    default:
      return state;
  }
}

export function useMapDetail(code: string, mapId: string | null) {
  const { userId } = useAuth();
  const [state, dispatch] = useReducer(reducer, { loading: true, error: null, detail: null });

  const refresh = useCallback(async () => {
    if (!mapId) return;
    try {
      dispatch({ type: 'detail', detail: await OasService.mapDetail(code, mapId, userId) });
    } catch (err) {
      dispatch({ type: 'error', message: err instanceof Error ? err.message : 'Could not load map' });
    }
  }, [code, mapId, userId]);

  useEffect(() => {
    if (!mapId) return;
    refresh();
    const subs = [
      oasSocket.on('oas_map_entry', (p) => {
        const { mapId: id, kind, entry } = p as { mapId: string; kind: 'item' | 'axis'; entry: MapEntry };
        if (id === mapId) dispatch({ type: 'entry', kind, entry });
      }),
      oasSocket.on('oas_map_stage', (p) => {
        if ((p as MapStagePayload).mapId === mapId) refresh();
      }),
      oasSocket.on('oas_map_ranked', (p) => {
        const { mapId: id, rankingDone, allDone } = p as { mapId: string; rankingDone: RankingDone[]; allDone: boolean };
        if (id !== mapId) return;
        if (allDone) refresh();
        else dispatch({ type: 'ranked', rankingDone });
      }),
    ];
    return () => { subs.forEach(u => u()); };
  }, [mapId, refresh]);

  return { ...state, refresh };
}
