import { apiFetch } from './api';

// The `/api/admin` surface, moved here from the game app.
//
// It used to live at apps/holoscopic-game/src/services/adminService.ts and be
// reached through a /admin page inside the game — so managing users meant
// signing into the thing you were administering, and the game's own nav
// carried a link most of its players could never use. The routes did not
// change; only who calls them did.
//
// Identity comes from the bearer token that lib/api.ts already attaches.
// `routes/admin.js` does `router.use(requireAdmin)`, which re-reads the User
// row on every call, so a demoted admin loses access immediately rather than
// whenever their token expires. The old `userId` argument these functions took
// is gone: it was passed as `x-user-id`, which is a header, not a credential.

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

export interface SignupEntry {
  email: string;
  joinedAt: string;
}

// One interest-capture source ('first-gathering', 'platform-updates', …),
// with its signups newest first.
export interface SignupSource {
  source: string;
  count: number;
  latestAt: string;
  emails: SignupEntry[];
}

export interface SignupsData {
  sources: SignupSource[];
  total: number;
}

export const AdminApi = {
  stats: (): Promise<PlatformStats> => apiFetch('/admin/stats'),

  users: (search?: string): Promise<AdminUser[]> =>
    apiFetch(search ? `/admin/users?search=${encodeURIComponent(search)}` : '/admin/users')
      .then(d => d.users as AdminUser[]),

  setRole: (targetId: string, role: 'user' | 'admin') =>
    apiFetch(`/admin/users/${targetId}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),

  setActive: (targetId: string, isActive: boolean) =>
    apiFetch(`/admin/users/${targetId}/status`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),

  // The password is returned once and never stored anywhere on this client —
  // it is read out to the person in the room and then gone.
  resetPassword: (targetId: string): Promise<{ tempPassword: string; email: string }> =>
    apiFetch(`/admin/users/${targetId}/reset-password`, { method: 'POST', body: JSON.stringify({}) }),

  signups: (): Promise<SignupsData> => apiFetch('/admin/signups'),
};
