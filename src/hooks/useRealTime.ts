'use client';

import { useState, useEffect, useCallback } from 'react';
import { webSocketService } from '@/services/websocketService';
import { Rating, Comment, Participant } from '@/models/Activity';

interface UseRealTimeResult {
  isConnected: boolean;
  isReconnecting: boolean;
  connect: (activityId: string, userId: string, username: string) => Promise<void>;
  disconnect: () => void;
  submitRating: (position: { x: number; y: number }) => void;
  submitComment: (text: string) => void;
  onRatingAdded: (callback: (rating: Rating) => void) => void;
  onCommentAdded: (callback: (comment: Comment) => void) => void;
  onParticipantJoined: (callback: (participant: Participant) => void) => void;
  onParticipantLeft: (callback: (participantId: string) => void) => void;
}

export function useRealTime(): UseRealTimeResult {
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Check connection status periodically
  useEffect(() => {
    const checkConnection = () => {
      const connected = webSocketService.isConnected();
      setIsConnected(connected);
    };

    const interval = setInterval(checkConnection, 1000);
    return () => clearInterval(interval);
  }, []);

  // Connect to WebSocket
  const connect = useCallback(async (activityId: string, userId: string, username: string) => {
    try {
      setIsReconnecting(true);
      await webSocketService.connect(activityId, userId, username);
      setIsConnected(true);
    } catch (error) {
      console.error('Failed to connect to WebSocket:', error);
      setIsConnected(false);
    } finally {
      setIsReconnecting(false);
    }
  }, []);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    webSocketService.disconnect();
    setIsConnected(false);
  }, []);

  // Submit rating
  const submitRating = useCallback((position: { x: number; y: number }) => {
    webSocketService.submitRating(position);
  }, []);

  // Submit comment
  const submitComment = useCallback((text: string) => {
    webSocketService.submitComment(text);
  }, []);

  // Event listeners
  const onRatingAdded = useCallback((callback: (rating: Rating) => void) => {
    webSocketService.on('rating_added', ({ rating }) => {
      callback(rating);
    });
  }, []);

  const onCommentAdded = useCallback((callback: (comment: Comment) => void) => {
    webSocketService.on('comment_added', ({ comment }) => {
      callback(comment);
    });
  }, []);

  const onParticipantJoined = useCallback((callback: (participant: Participant) => void) => {
    webSocketService.on('participant_joined', ({ participant }) => {
      callback(participant);
    });
  }, []);

  const onParticipantLeft = useCallback((callback: (participantId: string) => void) => {
    webSocketService.on('participant_left', ({ participantId }) => {
      callback(participantId);
    });
  }, []);

  return {
    isConnected,
    isReconnecting,
    connect,
    disconnect,
    submitRating,
    submitComment,
    onRatingAdded,
    onCommentAdded,
    onParticipantJoined,
    onParticipantLeft,
  };
}