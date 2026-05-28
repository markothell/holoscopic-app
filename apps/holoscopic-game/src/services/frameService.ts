import { apiFetch } from '@/lib/api';

export interface FrameEntry {
  userId: string;
  username: string;
  objectName: string;
  slotNumber: number;
  position: { x: number; y: number };
  quadrant: 'NE' | 'NW' | 'SW' | 'SE';
  voteCount: number;
  commentText: string;
}

export interface FrameNomination {
  id: string;
  sequenceId: string;
  sequenceUrlName: string;
  sourceActivityId: string;
  nomineeUserId: string;
  nomineeUsername: string;
  entryObjectName: string;
  entrySlotNumber: number;
  selectionMethod: 'manual' | 'top_voted' | 'top_voted_per_quadrant';
  nominatedBy: string;
  status: 'pending' | 'submitted' | 'declined';
  resultActivityId: string | null;
  createdAt: string;
}

export const FrameService = {
  getEntries: (activityId: string) =>
    apiFetch(`/frames/entries/${activityId}`).then(d => d as {
      entries: FrameEntry[];
      topVoted: FrameEntry | null;
      topPerQuadrant: Record<string, FrameEntry>;
    }),

  nominate: (userId: string, payload: {
    sequenceId: string;
    sourceActivityId: string;
    selectionMethod: 'manual' | 'top_voted' | 'top_voted_per_quadrant';
    nomineeUserId?: string;
    entrySlotNumber?: number;
  }) =>
    apiFetch('/frames/nominate', { method: 'POST', userId, body: JSON.stringify(payload) })
      .then(d => d as { nomination?: FrameNomination; nominations?: FrameNomination[] }),

  get: (id: string) =>
    apiFetch(`/frames/${id}`).then(d => d as {
      nomination: FrameNomination;
      sourceActivity: { id: string; title: string; xAxis: any; yAxis: any; mapQuestion: string; commentQuestion: string; objectNameQuestion: string } | null;
    }),

  submit: (userId: string, id: string, payload: {
    title: string;
    xAxis: { label: string; min: string; max: string };
    yAxis: { label: string; min: string; max: string };
    mapQuestion: string;
    commentQuestion: string;
    objectNameQuestion?: string;
    preamble?: string;
  }) =>
    apiFetch(`/frames/${id}/submit`, { method: 'POST', userId, body: JSON.stringify(payload) })
      .then(d => d as { nomination: FrameNomination; activity: any }),

  decline: (userId: string, id: string) =>
    apiFetch(`/frames/${id}/decline`, { method: 'POST', userId })
      .then(d => d as { nomination: FrameNomination }),
};
