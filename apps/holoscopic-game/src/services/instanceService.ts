import { apiFetch } from '@/lib/api';

/** An interView edition the current user has joined (dashboard Games list). */
export interface JoinedEdition {
  id: string;
  name: string;
  slug: string;
  gameNumber: number | null;
  active: boolean;
  startDate: string | null;
  endDate: string | null;
  holonBalance: number;
  joinedAt: string | null;
}

export const InstanceService = {
  /** interView editions this user has joined/participated in. */
  getMine: (userId: string) =>
    apiFetch('/instances/mine', { userId }).then(d => (d.instances ?? []) as JoinedEdition[]),
};
