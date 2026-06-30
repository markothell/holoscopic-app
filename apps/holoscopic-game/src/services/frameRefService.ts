import { apiFetch } from '@/lib/api';

export interface FrameRef {
  id: string;
  xLabel: string;
  xMin: string;
  xMax: string;
  yLabel: string;
  yMin: string;
  yMax: string;
  createdBy: string;
  createdAt: string;
}

export interface FrameRefUsage {
  frame: FrameRef;
  activities: { id: string; title: string; urlName: string; activityType: string; topicId: string | null; status: string }[];
  topics: { id: string; title: string; status: string; instanceId: string }[];
}

export const FrameRefService = {
  list: (search?: string, limit = 50) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (search) params.set('search', search);
    return apiFetch(`/frame-refs?${params}`).then(d => ({ frames: d.frames as FrameRef[], total: d.total as number }));
  },

  get: (id: string) =>
    apiFetch(`/frame-refs/${id}`).then(d => d.frame as FrameRef),

  getUsage: (id: string) =>
    apiFetch(`/frame-refs/${id}/usage`).then(d => d as FrameRefUsage),

  create: (userId: string, payload: { xLabel: string; xMin?: string; xMax?: string; yLabel: string; yMin?: string; yMax?: string }) =>
    apiFetch('/frame-refs', { method: 'POST', userId, body: JSON.stringify(payload) }).then(d => d.frame as FrameRef),

  update: (userId: string, id: string, payload: Partial<Pick<FrameRef, 'xLabel' | 'xMin' | 'xMax' | 'yLabel' | 'yMin' | 'yMax'>>) =>
    apiFetch(`/frame-refs/${id}`, { method: 'PUT', userId, body: JSON.stringify(payload) }).then(d => d.frame as FrameRef),

  delete: (userId: string, id: string) =>
    apiFetch(`/frame-refs/${id}`, { method: 'DELETE', userId }),
};
