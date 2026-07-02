// WebSocket service for real-time communication

import { io, Socket } from 'socket.io-client';
import { HoloscopicActivity, WebSocketEvents, ActivityEntry, Participant } from '@/models/Activity';
import { getCurrentInstanceId } from '@/lib/api';

const SOCKET_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

export class WebSocketService {
  private socket: Socket | null = null;
  private activityId: string | null = null;
  private userId: string | null = null;
  private listeners: Map<string, Array<(data: any) => void>> = new Map();

  // Initialize connection
  connect(activityId: string, userId: string, username: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.socket = io(SOCKET_URL, {
          transports: ['websocket'],
          upgrade: false,
        });

        this.activityId = activityId;
        this.userId = userId;

        this.socket.on('connect', () => {
          console.log('WebSocket connected');
          this.joinActivity(activityId, userId, username);
          resolve();
        });

        this.socket.on('connect_error', (error) => {
          console.error('WebSocket connection error:', error);
          reject(error);
        });

        this.socket.on('disconnect', () => {
          console.log('WebSocket disconnected');
        });

        // Set up event listeners
        this.setupEventListeners();
      } catch (error) {
        reject(error);
      }
    });
  }

  // Disconnect from WebSocket
  disconnect(): void {
    if (this.socket) {
      if (this.activityId && this.userId) {
        this.leaveActivity(this.activityId, this.userId);
      }
      this.socket.disconnect();
      this.socket = null;
    }
    // Don't clear listeners here - let components manage their own listener lifecycle
    // via unsubscribe functions returned from .on()
  }

  // Join activity room
  private joinActivity(activityId: string, userId: string, username: string): void {
    if (this.socket) {
      this.socket.emit('join_activity', {
        activityId,
        userId,
        username,
      });
    }
  }

  // Leave activity room
  private leaveActivity(activityId: string, userId: string): void {
    if (this.socket) {
      this.socket.emit('leave_activity', {
        activityId,
        userId,
      });
    }
  }

  // Submit an entry (position and/or text for a slot)
  submitEntry(entry: {
    position?: { x: number; y: number };
    text?: string;
    objectName?: string;
    slotNumber?: number;
    questionId?: string | null;
  }): void {
    if (this.socket && this.activityId && this.userId) {
      this.socket.emit('submit_entry', {
        activityId: this.activityId,
        userId: this.userId,
        ...entry,
        instanceId: getCurrentInstanceId(),
      });
    }
  }

  // Set up event listeners
  private setupEventListeners(): void {
    if (!this.socket) return;

    // Entry events
    this.socket.on('entry_upserted', (data: { entry: ActivityEntry }) => {
      this.notifyListeners('entry_upserted', data);
    });

    this.socket.on('entry_voted', (data: { entry: ActivityEntry }) => {
      this.notifyListeners('entry_voted', data);
    });

    this.socket.on('entry_removed', (data: { entryId: string }) => {
      this.notifyListeners('entry_removed', data);
    });

    this.socket.on('entries_cleared', (data: { userId: string; slotNumber: number }) => {
      this.notifyListeners('entries_cleared', data);
    });

    // Participant events
    this.socket.on('participant_joined', (data: { participant: Participant }) => {
      this.notifyListeners('participant_joined', data);
    });

    this.socket.on('participant_left', (data: { participantId: string }) => {
      this.notifyListeners('participant_left', data);
    });

    // Activity updates
    this.socket.on('activity_updated', (data: { activity: HoloscopicActivity }) => {
      this.notifyListeners('activity_updated', data);
    });
  }

  // Subscribe to events - returns unsubscribe function
  on<K extends keyof WebSocketEvents>(event: K, callback: (data: WebSocketEvents[K]) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(event);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  // Unsubscribe from ALL listeners for an event (legacy method)
  off(event: keyof WebSocketEvents): void {
    this.listeners.delete(event);
  }

  // Notify listeners
  private notifyListeners(event: string, data: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks && callbacks.length > 0) {
      callbacks.forEach(callback => callback(data));
    }
  }

  // Get connection status
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  // Get current activity ID
  getCurrentActivityId(): string | null {
    return this.activityId;
  }

  // Get current user ID
  getCurrentUserId(): string | null {
    return this.userId;
  }
}

// Create singleton instance
export const webSocketService = new WebSocketService();