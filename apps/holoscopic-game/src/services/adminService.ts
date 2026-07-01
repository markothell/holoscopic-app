import { apiFetch } from '@/lib/api';

export interface WaitlistEntry {
  email: string;
  joinedAt: string;
}

export interface WaitlistSequence {
  sequenceId: string;
  title: string;
  urlName: string;
  count: number;
  emails: WaitlistEntry[];
}

export interface WaitlistData {
  sequences: WaitlistSequence[];
  total: number;
}

export interface PlatformStats {
  users: number;
  activities: number;
  sequences: number;
  participants: number;
  comments: number;
  votes: number;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

// Admin routes use requireAdmin middleware which reads the x-user-id header,
// so all methods pass userId via the apiFetch { userId } option.
export const AdminService = {
  getPlatformStats: (userId: string): Promise<PlatformStats> =>
    apiFetch('/admin/stats', { userId }),

  getUsers: (userId: string, search?: string): Promise<AdminUser[]> =>
    apiFetch(search
      ? `/admin/users?search=${encodeURIComponent(search)}`
      : '/admin/users',
      { userId }
    ).then(d => d.users as AdminUser[]),

  updateUserRole: (userId: string, targetId: string, role: 'user' | 'admin'): Promise<void> =>
    apiFetch(`/admin/users/${targetId}/role`, {
      method: 'PATCH',
      userId,
      body: JSON.stringify({ role }),
    }),

  updateUserStatus: (userId: string, targetId: string, isActive: boolean): Promise<void> =>
    apiFetch(`/admin/users/${targetId}/status`, {
      method: 'PATCH',
      userId,
      body: JSON.stringify({ isActive }),
    }),

  getWaitlist: (userId: string): Promise<WaitlistData> =>
    apiFetch('/admin/waitlist', { userId }),

  getConfig: (userId: string) =>
    apiFetch('/admin/config', { userId }),

  updateConfig: (userId: string, config: { holons?: object; quorum?: object }) =>
    apiFetch('/admin/config', { method: 'PUT', userId, body: JSON.stringify(config) }),

  awardHolons: (userId: string, payload: { targetUserId: string; amount: number; reason?: string }) =>
    apiFetch('/admin/holons/award', { method: 'POST', userId, body: JSON.stringify(payload) }),

  resetPassword: (userId: string, targetUserId: string) =>
    apiFetch(`/admin/users/${targetUserId}/reset-password`, { method: 'POST', userId, body: JSON.stringify({}) })
      .then(d => d as { tempPassword: string; email: string }),
};
