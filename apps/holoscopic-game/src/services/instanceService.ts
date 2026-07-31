import { apiFetch } from '@/lib/api';
import type { GameApp } from '@/lib/games';

/** A game the current user has joined, in any app (dashboard Games list). */
export interface JoinedEdition {
  id: string;
  name: string;
  slug: string;
  /** Which game this instance belongs to — the stored Instance.app. */
  app?: GameApp;
  /** interView only. A memorial or a Synthesis idea holding one is a bug. */
  gameNumber: number | null;
  gameVersion: string | null;
  active: boolean;
  startDate: string | null;
  endDate: string | null;
  holonBalance: number;
  joinedAt: string | null;
}

/**
 * Edition.game readout, e.g. "1.02" = platform edition 1, game #2.
 * Edition = major of gameVersion; game = zero-padded gameNumber.
 */
export function editionLabel(ed?: { gameVersion?: string | null; gameNumber?: number | null } | null): string {
  const edition = parseInt(ed?.gameVersion ?? '1', 10) || 1;
  const game = ed?.gameNumber ?? 1;
  return `${edition}.${String(game).padStart(2, '0')}`;
}

export const InstanceService = {
  /** Every game this user has joined, across all four apps. */
  getMine: (userId: string) =>
    apiFetch('/instances/mine', { userId }).then(d => (d.instances ?? []) as JoinedEdition[]),
};
