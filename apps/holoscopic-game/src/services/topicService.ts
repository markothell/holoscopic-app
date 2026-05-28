import { apiFetch } from '@/lib/api';

export interface Topic {
  id: string;
  title: string;
  description: string;
  whyItMatters: string;
  nominatedBy: string;
  status: 'nominated' | 'confirmed' | 'expired';
  supporters: { userId: string; holonsWagered: number; supportedAt: string }[];
  supporterCount: number;
  holonPool: number;
  quorumThreshold: number;
  nominatedAt: string;
  expiresAt: string;
  confirmedAt: string | null;
  inquirySequenceId: string | null;
  priorTopicId: string | null;
  priorCycleNotes: string | null;
}

export interface InquirySequence {
  id: string;
  title: string;
  urlName: string;
  description: string;
  status: string;
}

export interface Inquiry extends Topic {
  sequence: InquirySequence | null;
}

export const TopicService = {
  list: (status: 'nominated' | 'confirmed' | 'expired' = 'nominated') =>
    apiFetch(`/topics?status=${status}`).then(d => d.topics as Topic[]),

  get: (id: string) =>
    apiFetch(`/topics/${id}`).then(d => d.topic as Topic),

  nominate: (userId: string, payload: { title: string; description: string; whyItMatters: string; priorTopicId?: string; priorCycleNotes?: string }) =>
    apiFetch('/topics/nominate', { method: 'POST', userId, body: JSON.stringify(payload) }).then(d => d.topic as Topic),

  support: (userId: string, topicId: string) =>
    apiFetch(`/topics/${topicId}/support`, { method: 'POST', userId }).then(d => d.topic as Topic),

  unsupport: (userId: string, topicId: string) =>
    apiFetch(`/topics/${topicId}/unsupport`, { method: 'POST', userId }).then(d => d.topic as Topic),

  linkInquiry: (userId: string, topicId: string, sequenceId: string) =>
    apiFetch(`/topics/${topicId}/link-inquiry`, { method: 'POST', userId, body: JSON.stringify({ sequenceId }) }).then(d => d.topic as Topic),

  listInquiries: () =>
    apiFetch('/topics/inquiry').then(d => d.inquiries as Inquiry[]),
};
