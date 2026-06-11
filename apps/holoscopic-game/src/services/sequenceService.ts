import { apiFetch } from '@/lib/api';
import type { Sequence, CreateSequenceData, UpdateSequenceData } from '@/models/Sequence';

export type { Sequence, CreateSequenceData, UpdateSequenceData };

export interface MemberStat {
  userId: string;
  email: string;
  username: string;
  joinedAt: Date;
  activitiesCount: number;
  mappingsCount: number;
}

// Sequence routes pass userId in the request body, not the x-user-id header.
// Admin/manage routes that check identity also use body userId.
export const SequenceService = {
  getAdminSequences: (userId?: string): Promise<Sequence[]> =>
    apiFetch(userId
      ? `/sequences/admin?createdBy=${encodeURIComponent(userId)}`
      : '/sequences/admin'),

  getPublicSequences: (): Promise<Sequence[]> =>
    apiFetch('/sequences/public'),

  getUserSequences: (userId: string): Promise<Sequence[]> =>
    apiFetch(`/sequences/user/${userId}`),

  // Returns sequence spread with fully-populated activities
  getSequence: (id: string): Promise<Sequence> =>
    apiFetch(`/sequences/${id}`),

  // Participant-facing view — filters hidden rounds, includes host field
  getSequenceByUrlName: (urlName: string, userId?: string): Promise<Sequence> =>
    apiFetch(userId
      ? `/sequences/url/${urlName}?userId=${encodeURIComponent(userId)}`
      : `/sequences/url/${urlName}`),

  // Manage view — includes all rounds, activity draft status
  getSequenceForManage: (urlName: string): Promise<Sequence> =>
    apiFetch(`/sequences/by-url/${urlName}`),

  createSequence: (data: CreateSequenceData): Promise<Sequence> =>
    apiFetch('/sequences', { method: 'POST', body: JSON.stringify(data) }),

  updateSequence: (id: string, data: UpdateSequenceData): Promise<Sequence> =>
    apiFetch(`/sequences/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  deleteSequence: (id: string, deleteActivities = false): Promise<void> =>
    apiFetch(`/sequences/${id}${deleteActivities ? '?deleteActivities=true' : ''}`, { method: 'DELETE' }),

  addMember: (sequenceId: string, userId: string, email?: string, username?: string): Promise<Sequence> =>
    apiFetch(`/sequences/${sequenceId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId, email, username }),
    }),

  enroll: (sequenceId: string, userId: string, email?: string, displayName?: string): Promise<Sequence> =>
    apiFetch(`/sequences/${sequenceId}/enroll`, {
      method: 'POST',
      body: JSON.stringify({ userId, email, displayName }),
    }).then(d => d.sequence as Sequence),

  removeMember: (sequenceId: string, userId: string): Promise<Sequence> =>
    apiFetch(`/sequences/${sequenceId}/members/${userId}`, { method: 'DELETE' }),

  addActivity: (sequenceId: string, activityId: string, order: number, duration = 7): Promise<Sequence> =>
    apiFetch(`/sequences/${sequenceId}/activities`, {
      method: 'POST',
      body: JSON.stringify({ activityId, order, duration }),
    }),

  removeActivity: (sequenceId: string, activityId: string): Promise<Sequence> =>
    apiFetch(`/sequences/${sequenceId}/activities/${activityId}`, { method: 'DELETE' }),

  startSequence: (id: string): Promise<Sequence> =>
    apiFetch(`/sequences/${id}/start`, { method: 'POST' }),

  openNextActivity: (id: string): Promise<Sequence> =>
    apiFetch(`/sequences/${id}/next`, { method: 'POST' }),

  completeSequence: (id: string): Promise<Sequence> =>
    apiFetch(`/sequences/${id}/complete`, { method: 'POST' }),

  closeActivity: (sequenceId: string, activityId: string): Promise<Sequence> =>
    apiFetch(`/sequences/${sequenceId}/activities/${activityId}/close`, { method: 'POST' }),

  reopenActivity: (sequenceId: string, activityId: string): Promise<Sequence> =>
    apiFetch(`/sequences/${sequenceId}/activities/${activityId}/reopen`, { method: 'POST' }),

  openActivity: (sequenceId: string, activityId: string): Promise<Sequence> =>
    apiFetch(`/sequences/${sequenceId}/activities/${activityId}/open`, { method: 'POST' }),

  scheduleActivityClose: (sequenceId: string, activityId: string, closedAt: string): Promise<Sequence> =>
    apiFetch(`/sequences/${sequenceId}/activities/${activityId}/schedule`, {
      method: 'POST',
      body: JSON.stringify({ closedAt }),
    }),

  setWaitlistStatus: (id: string): Promise<Sequence> =>
    apiFetch(`/sequences/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'waitlist' }) }),

  setDraftStatus: (id: string): Promise<Sequence> =>
    apiFetch(`/sequences/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'draft' }) }),

  setRoundVisibility: (sequenceId: string, roundNumber: number, hidden: boolean): Promise<Sequence> =>
    apiFetch(`/sequences/${sequenceId}/rounds/${roundNumber}/visibility`, {
      method: 'PATCH',
      body: JSON.stringify({ hidden }),
    }),

  getMemberStats: (sequenceId: string): Promise<MemberStat[]> =>
    apiFetch(`/sequences/${sequenceId}/member-stats`),

  duplicateSequence: (id: string): Promise<Sequence> =>
    apiFetch(`/sequences/${id}/duplicate`, { method: 'POST' }),

  addInvitedEmails: (sequenceId: string, emails: string[]): Promise<Sequence> =>
    apiFetch(`/sequences/${sequenceId}/invite`, {
      method: 'POST',
      body: JSON.stringify({ emails }),
    }),

  removeInvitedEmail: (sequenceId: string, email: string): Promise<Sequence> =>
    apiFetch(`/sequences/${sequenceId}/invite/${encodeURIComponent(email)}`, { method: 'DELETE' }),
};
