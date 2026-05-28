// Sequence service for API calls and data management

import { Sequence, CreateSequenceData, UpdateSequenceData } from '@/models/Sequence';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export class SequenceService {
  // Get all sequences, optionally scoped to a creator
  static async getAdminSequences(userId?: string): Promise<Sequence[]> {
    try {
      const url = userId
        ? `${API_BASE_URL}/sequences/admin?createdBy=${encodeURIComponent(userId)}`
        : `${API_BASE_URL}/sequences/admin`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch sequences');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching sequences:', error);
      throw error;
    }
  }

  // Get public sequences (no invitation required)
  static async getPublicSequences(): Promise<Sequence[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/sequences/public`);
      if (!response.ok) {
        throw new Error('Failed to fetch public sequences');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching public sequences:', error);
      throw error;
    }
  }

  // Get sequences for a user
  static async getUserSequences(userId: string): Promise<Sequence[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/sequences/user/${userId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch user sequences');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching user sequences:', error);
      throw error;
    }
  }

  // Get single sequence by ID
  static async getSequence(id: string): Promise<Sequence> {
    try {
      const response = await fetch(`${API_BASE_URL}/sequences/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch sequence');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching sequence:', error);
      throw error;
    }
  }

  // Get single sequence by URL name
  static async getSequenceByUrlName(urlName: string, userId?: string): Promise<Sequence> {
    try {
      const url = userId
        ? `${API_BASE_URL}/sequences/url/${urlName}?userId=${userId}`
        : `${API_BASE_URL}/sequences/url/${urlName}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch sequence');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching sequence by URL name:', error);
      throw error;
    }
  }

  // Create new sequence
  static async createSequence(data: CreateSequenceData): Promise<Sequence> {
    try {
      const response = await fetch(`${API_BASE_URL}/sequences`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create sequence');
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating sequence:', error);
      throw error;
    }
  }

  // Update sequence
  static async updateSequence(id: string, data: UpdateSequenceData): Promise<Sequence> {
    try {
      const response = await fetch(`${API_BASE_URL}/sequences/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update sequence');
      }

      return await response.json();
    } catch (error) {
      console.error('Error updating sequence:', error);
      throw error;
    }
  }

  // Delete sequence
  static async deleteSequence(id: string, deleteActivities = false): Promise<void> {
    try {
      const url = deleteActivities
        ? `${API_BASE_URL}/sequences/${id}?deleteActivities=true`
        : `${API_BASE_URL}/sequences/${id}`;
      const response = await fetch(url, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete sequence');
      }
    } catch (error) {
      console.error('Error deleting sequence:', error);
      throw error;
    }
  }

  // Add member to sequence
  static async addMember(sequenceId: string, userId: string, email?: string, username?: string): Promise<Sequence> {
    try {
      const response = await fetch(`${API_BASE_URL}/sequences/${sequenceId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, email, username }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add member');
      }

      return await response.json();
    } catch (error) {
      console.error('Error adding member:', error);
      throw error;
    }
  }

  // Remove member from sequence
  static async removeMember(sequenceId: string, userId: string): Promise<Sequence> {
    try {
      const response = await fetch(`${API_BASE_URL}/sequences/${sequenceId}/members/${userId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to remove member');
      }

      return await response.json();
    } catch (error) {
      console.error('Error removing member:', error);
      throw error;
    }
  }

  // Add activity to sequence
  static async addActivity(sequenceId: string, activityId: string, order: number, duration: number = 7): Promise<Sequence> {
    try {
      const response = await fetch(`${API_BASE_URL}/sequences/${sequenceId}/activities`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ activityId, order, duration }),
      });

      if (!response.ok) {
        throw new Error('Failed to add activity');
      }

      return await response.json();
    } catch (error) {
      console.error('Error adding activity:', error);
      throw error;
    }
  }

  // Remove activity from sequence
  static async removeActivity(sequenceId: string, activityId: string): Promise<Sequence> {
    try {
      const response = await fetch(`${API_BASE_URL}/sequences/${sequenceId}/activities/${activityId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to remove activity');
      }

      return await response.json();
    } catch (error) {
      console.error('Error removing activity:', error);
      throw error;
    }
  }

  // Set sequence to waitlist status
  static async setWaitlistStatus(sequenceId: string): Promise<Sequence> {
    try {
      const response = await fetch(`${API_BASE_URL}/sequences/${sequenceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'waitlist' }),
      });
      if (!response.ok) throw new Error('Failed to set waitlist status');
      return await response.json();
    } catch (error) {
      console.error('Error setting waitlist status:', error);
      throw error;
    }
  }

  // Remove from waitlist (back to draft)
  static async setDraftStatus(sequenceId: string): Promise<Sequence> {
    try {
      const response = await fetch(`${API_BASE_URL}/sequences/${sequenceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'draft' }),
      });
      if (!response.ok) throw new Error('Failed to set draft status');
      return await response.json();
    } catch (error) {
      console.error('Error setting draft status:', error);
      throw error;
    }
  }

  // Start sequence (opens first activity)
  static async startSequence(sequenceId: string): Promise<Sequence> {
    try {
      const response = await fetch(`${API_BASE_URL}/sequences/${sequenceId}/start`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to start sequence');
      }

      return await response.json();
    } catch (error) {
      console.error('Error starting sequence:', error);
      throw error;
    }
  }

  // Open next activity in sequence
  static async openNextActivity(sequenceId: string): Promise<Sequence> {
    try {
      const response = await fetch(`${API_BASE_URL}/sequences/${sequenceId}/next`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to open next activity');
      }

      return await response.json();
    } catch (error) {
      console.error('Error opening next activity:', error);
      throw error;
    }
  }

  // Complete sequence
  static async completeSequence(sequenceId: string): Promise<Sequence> {
    try {
      const response = await fetch(`${API_BASE_URL}/sequences/${sequenceId}/complete`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to complete sequence');
      }

      return await response.json();
    } catch (error) {
      console.error('Error completing sequence:', error);
      throw error;
    }
  }

  // Manually close an activity in the sequence
  static async closeActivity(sequenceId: string, activityId: string): Promise<Sequence> {
    try {
      const response = await fetch(`${API_BASE_URL}/sequences/${sequenceId}/activities/${activityId}/close`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to close activity');
      }

      return await response.json();
    } catch (error) {
      console.error('Error closing activity:', error);
      throw error;
    }
  }

  // Manually reopen an activity in the sequence
  static async reopenActivity(sequenceId: string, activityId: string): Promise<Sequence> {
    try {
      const response = await fetch(`${API_BASE_URL}/sequences/${sequenceId}/activities/${activityId}/reopen`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to reopen activity');
      }

      return await response.json();
    } catch (error) {
      console.error('Error reopening activity:', error);
      throw error;
    }
  }

  // For the manage page — returns all activities including hidden rounds
  static async getSequenceForManage(urlName: string): Promise<Sequence> {
    const response = await fetch(`${API_BASE_URL}/sequences/by-url/${urlName}`);
    if (!response.ok) throw new Error('Failed to fetch sequence');
    return response.json();
  }

  static async openActivity(sequenceId: string, activityId: string): Promise<Sequence> {
    const response = await fetch(`${API_BASE_URL}/sequences/${sequenceId}/activities/${activityId}/open`, { method: 'POST' });
    if (!response.ok) { const e = await response.json(); throw new Error(e.error || 'Failed to open activity'); }
    return response.json();
  }

  static async scheduleActivityClose(sequenceId: string, activityId: string, closedAt: string): Promise<Sequence> {
    const response = await fetch(`${API_BASE_URL}/sequences/${sequenceId}/activities/${activityId}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ closedAt }),
    });
    if (!response.ok) { const e = await response.json(); throw new Error(e.error || 'Failed to schedule close'); }
    return response.json();
  }

  static async setRoundVisibility(sequenceId: string, roundNumber: number, hidden: boolean): Promise<Sequence> {
    const response = await fetch(`${API_BASE_URL}/sequences/${sequenceId}/rounds/${roundNumber}/visibility`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hidden }),
    });
    if (!response.ok) { const e = await response.json(); throw new Error(e.error || 'Failed to set round visibility'); }
    return response.json();
  }

  static async getMemberStats(sequenceId: string): Promise<Array<{
    userId: string; email: string; username: string; joinedAt: Date;
    activitiesCount: number; mappingsCount: number;
  }>> {
    const response = await fetch(`${API_BASE_URL}/sequences/${sequenceId}/member-stats`);
    if (!response.ok) throw new Error('Failed to get member stats');
    return response.json();
  }

  static async addInvitedEmails(sequenceId: string, emails: string[]): Promise<Sequence> {
    const response = await fetch(`${API_BASE_URL}/sequences/${sequenceId}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emails }),
    });
    if (!response.ok) { const e = await response.json(); throw new Error(e.error || 'Failed to add emails'); }
    return response.json();
  }

  static async removeInvitedEmail(sequenceId: string, email: string): Promise<Sequence> {
    const response = await fetch(`${API_BASE_URL}/sequences/${sequenceId}/invite/${encodeURIComponent(email)}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to remove email');
    return response.json();
  }

  static async duplicateSequence(sequenceId: string): Promise<Sequence> {
    const response = await fetch(`${API_BASE_URL}/sequences/${sequenceId}/duplicate`, { method: 'POST' });
    if (!response.ok) { const e = await response.json(); throw new Error(e.error || 'Failed to duplicate sequence'); }
    return response.json();
  }
}