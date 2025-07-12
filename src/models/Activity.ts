// TypeScript interfaces for We All Explain data models

export interface WeAllExplainActivity {
  id: string;
  title: string;
  
  // Map configuration
  mapQuestion: string;
  xAxis: {
    label: string;
    min: string;
    max: string;
  };
  yAxis: {
    label: string;
    min: string;
    max: string;
  };
  
  // Comment configuration
  commentQuestion: string;
  
  // Activity state
  status: 'active' | 'completed';
  createdAt: Date;
  updatedAt: Date;
  
  // Participant data
  participants: Participant[];
  ratings: Rating[];
  comments: Comment[];
}

export interface Rating {
  id: string;
  userId: string;
  username: string;
  position: {
    x: number; // 0-1 normalized
    y: number; // 0-1 normalized
  };
  timestamp: Date;
}

export interface Comment {
  id: string;
  userId: string;
  username: string;
  text: string;
  timestamp: Date;
  votes: CommentVote[];
  voteCount: number;
}

export interface CommentVote {
  id: string;
  userId: string;
  username: string;
  timestamp: Date;
}

export interface Participant {
  id: string;
  username: string;
  isConnected: boolean;
  hasSubmitted: boolean;
  joinedAt: Date;
}

// WebSocket event types
export interface WebSocketEvents {
  // User actions
  'submit_rating': { userId: string; position: { x: number; y: number }; timestamp: Date };
  'submit_comment': { userId: string; text: string; timestamp: Date };
  'vote_comment': { userId: string; commentId: string; timestamp: Date };
  'join_activity': { userId: string; username: string };
  'leave_activity': { userId: string };
  
  // Broadcast events
  'rating_added': { rating: Rating };
  'comment_added': { comment: Comment };
  'comment_voted': { comment: Comment };
  'participant_joined': { participant: Participant };
  'participant_left': { participantId: string };
  'activity_updated': { activity: WeAllExplainActivity };
}

// Form interfaces for admin panel
export interface ActivityFormData {
  title: string;
  mapQuestion: string;
  xAxisLabel: string;
  xAxisMin: string;
  xAxisMax: string;
  yAxisLabel: string;
  yAxisMin: string;
  yAxisMax: string;
  commentQuestion: string;
}

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ActivityListResponse {
  activities: WeAllExplainActivity[];
  total: number;
}

// Component props interfaces
export interface MappingGridProps {
  activity: WeAllExplainActivity;
  onRatingSubmit: (position: { x: number; y: number }) => void;
  userRating?: Rating;
  showAllRatings?: boolean;
}

export interface CommentSectionProps {
  activity: WeAllExplainActivity;
  onCommentSubmit: (text: string) => void;
  onCommentVote?: (commentId: string) => void;
  userComment?: Comment;
  showAllComments?: boolean;
  readOnly?: boolean;
  currentUserId?: string;
}

export type CommentSortOrder = 'newest' | 'oldest' | 'votes' | 'quadrant-i' | 'quadrant-ii' | 'quadrant-iii' | 'quadrant-iv';

export interface ResultsViewProps {
  activity: WeAllExplainActivity;
  isVisible: boolean;
  onToggle: () => void;
  onCommentVote?: (commentId: string) => void;
  currentUserId?: string;
}