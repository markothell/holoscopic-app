import { apiFetch } from '@/lib/api';

// What the signed-in dashboard needs from across the apps, in one read.

/** Something waiting in one app. `path` is relative to that app's origin. */
export interface DashboardSignal {
  count: number;
  items: { title: string; path: string }[];
}

export interface Dashboard {
  /** Apps with nothing waiting are absent, not zero. */
  apps: { circles?: DashboardSignal; threshold?: DashboardSignal; spectrum?: DashboardSignal };
  /** ISO dates of this account's last activity in each app. */
  lastUsed: { circles?: string; threshold?: string; synthesis?: string; spectrum?: string; interview?: string };
  invitations: number;
}

export const MeService = {
  getDashboard: (userId: string): Promise<Dashboard> =>
    apiFetch('/me/dashboard', { userId }),
};
