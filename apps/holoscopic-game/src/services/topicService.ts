import { apiFetch } from '@/lib/api';

export interface Topic {
  id: string;
  title: string;
  description: string;
  nominatedBy: string;
  status: 'nominated' | 'confirmed' | 'expired';
  supporters: { userId: string; holonsWagered: number; supportedAt: string }[];
  supporterCount: number;
  holonPool: number;
  quorumThreshold: number;
  nominatedAt: string;
  expiresAt: string;
  confirmedAt: string | null;
  priorTopicId: string | null;
  priorCycleNotes: string | null;
}

export const TopicService = {
  list: (status: 'nominated' | 'confirmed' | 'expired' = 'nominated') =>
    apiFetch(`/topics?status=${status}`).then(d => d.topics as Topic[]),

  get: (id: string) =>
    apiFetch(`/topics/${id}`).then(d => d.topic as Topic),

  nominate: (userId: string, payload: { title: string; description: string; priorTopicId?: string; priorCycleNotes?: string }) =>
    apiFetch('/topics/nominate', { method: 'POST', userId, body: JSON.stringify(payload) }).then(d => d.topic as Topic),

  support: (userId: string, topicId: string) =>
    apiFetch(`/topics/${topicId}/support`, { method: 'POST', userId }).then(d => d.topic as Topic),

  unsupport: (userId: string, topicId: string) =>
    apiFetch(`/topics/${topicId}/unsupport`, { method: 'POST', userId }).then(d => d.topic as Topic),
};
