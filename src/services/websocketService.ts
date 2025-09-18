// WebSocket service for real-time communication

import { io, Socket } from 'socket.io-client';
import { HoloscopicActivity, WebSocketEvents, Rating, Comment, Participant } from '@/models/Activity';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

export class WebSocketService {
  private socket: Socket | null = null;
  private activityId: string | null = null;
  private userId: string | null = null;
  private listeners: Map<string, (data: any) => void> = new Map();

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
    this.listeners.clear();
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

  // Submit rating
  submitRating(position: { x: number; y: number }): void {
    if (this.socket && this.activityId && this.userId) {
      this.socket.emit('submit_rating', {
        activityId: this.activityId,
        userId: this.userId,
        position,
        timestamp: new Date(),
      });
    }
  }

  // Submit comment
  submitComment(text: string): void {
    if (this.socket && this.activityId && this.userId) {
      this.socket.emit('submit_comment', {
        activityId: this.activityId,
        userId: this.userId,
        text,
        timestamp: new Date(),
      });
    }
  }

  // Set up event listeners
  private setupEventListeners(): void {
    if (!this.socket) return;

    // Rating events
    this.socket.on('rating_added', (data: { rating: Rating }) => {
      this.notifyListeners('rating_added', data);
    });

    // Comment events
    this.socket.on('comment_added', (data: { comment: Comment }) => {
      this.notifyListeners('comment_added', data);
    });
    
    this.socket.on('comment_voted', (data: { comment: Comment }) => {
      this.notifyListeners('comment_voted', data);
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

  // Subscribe to events
  on<K extends keyof WebSocketEvents>(event: K, callback: (data: WebSocketEvents[K]) => void): void {
    this.listeners.set(event, callback);
  }

  // Unsubscribe from events
  off(event: keyof WebSocketEvents): void {
    this.listeners.delete(event);
  }

  // Notify listeners
  private notifyListeners(event: string, data: any): void {
    const listener = this.listeners.get(event);
    if (listener) {
      listener(data);
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