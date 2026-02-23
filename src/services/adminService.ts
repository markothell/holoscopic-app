const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

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

export class AdminService {
  static async getPlatformStats(userId: string): Promise<PlatformStats> {
    const response = await fetch(`${API_BASE_URL}/admin/stats`, {
      headers: { 'x-user-id': userId }
    });
    if (!response.ok) throw new Error('Failed to fetch platform stats');
    return response.json();
  }

  static async getUsers(userId: string, search?: string): Promise<AdminUser[]> {
    const url = search
      ? `${API_BASE_URL}/admin/users?search=${encodeURIComponent(search)}`
      : `${API_BASE_URL}/admin/users`;
    const response = await fetch(url, {
      headers: { 'x-user-id': userId }
    });
    if (!response.ok) throw new Error('Failed to fetch users');
    const data = await response.json();
    return data.users;
  }

  static async updateUserRole(userId: string, targetId: string, role: 'user' | 'admin'): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/admin/users/${targetId}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId
      },
      body: JSON.stringify({ role })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to update role');
    }
  }

  static async updateUserStatus(userId: string, targetId: string, isActive: boolean): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/admin/users/${targetId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId
      },
      body: JSON.stringify({ isActive })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to update status');
    }
  }
}
