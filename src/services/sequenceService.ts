// Sequence service for API calls and data management

import { Sequence, CreateSequenceData, UpdateSequenceData } from '@/models/Sequence';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

export class SequenceService {
  // Get all sequences (admin)
  static async getAdminSequences(): Promise<Sequence[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/sequences/admin`);
      if (!response.ok) {
        throw new Error('Failed to fetch sequences');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching sequences:', error);
      throw error;
    }
  }

  // Get sequences for a user
  static async getUserSequences(userId: string): Promise<Sequence[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/sequences/user/${userId}`);
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
      const response = await fetch(`${API_BASE_URL}/api/sequences/${id}`);
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
        ? `${API_BASE_URL}/api/sequences/url/${urlName}?userId=${userId}`
        : `${API_BASE_URL}/api/sequences/url/${urlName}`;
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
      const response = await fetch(`${API_BASE_URL}/api/sequences`, {
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
      const response = await fetch(`${API_BASE_URL}/api/sequences/${id}`, {
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
  static async deleteSequence(id: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/sequences/${id}`, {
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
  static async addMember(sequenceId: string, userId: string, displayName?: string): Promise<Sequence> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/sequences/${sequenceId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, displayName }),
      });

      if (!response.ok) {
        throw new Error('Failed to add member');
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
      const response = await fetch(`${API_BASE_URL}/api/sequences/${sequenceId}/members/${userId}`, {
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
      const response = await fetch(`${API_BASE_URL}/api/sequences/${sequenceId}/activities`, {
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
      const response = await fetch(`${API_BASE_URL}/api/sequences/${sequenceId}/activities/${activityId}`, {
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

  // Start sequence (opens first activity)
  static async startSequence(sequenceId: string): Promise<Sequence> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/sequences/${sequenceId}/start`, {
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
      const response = await fetch(`${API_BASE_URL}/api/sequences/${sequenceId}/next`, {
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
      const response = await fetch(`${API_BASE_URL}/api/sequences/${sequenceId}/complete`, {
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
}