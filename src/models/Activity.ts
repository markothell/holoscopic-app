// TypeScript interfaces for We All Explain data models

export interface WeAllExplainActivity {
  id: string;
  title: string;
  urlName: string; // URL-friendly name for routing (e.g., "gratitude")
  
  // Map configuration
  mapQuestion: string;
  mapQuestion2: string;
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
  
  // Quadrant labels
  quadrants: {
    q1: string; // Top-right: high X, high Y
    q2: string; // Top-left: low X, high Y  
    q3: string; // Bottom-left: low X, low Y
    q4: string; // Bottom-right: high X, low Y
  };
  
  // Activity state
  status: 'active' | 'completed';
  isDraft: boolean;
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
  quadrantName?: string;
  quadrant?: 'q1' | 'q2' | 'q3' | 'q4';
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
  'comment_updated': { comment: Comment };
  'comment_voted': { comment: Comment };
  'participant_joined': { participant: Participant };
  'participant_left': { participantId: string };
  'activity_updated': { activity: WeAllExplainActivity };
}

// Form interfaces for admin panel
export interface ActivityFormData {
  title: string;
  urlName?: string; // Optional - will be generated from title if not provided
  mapQuestion: string;
  mapQuestion2: string;
  xAxisLabel: string;
  xAxisMin: string;
  xAxisMax: string;
  yAxisLabel: string;
  yAxisMin: string;
  yAxisMax: string;
  commentQuestion: string;
  q1Label: string;
  q2Label: string;
  q3Label: string;
  q4Label: string;
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
  hoveredCommentId?: string | null;
  onDotClick?: (userId: string) => void;
  visibleCommentIds?: string[];
}

export interface CommentSectionProps {
  activity: WeAllExplainActivity;
  onCommentSubmit: (text: string) => void;
  onCommentVote?: (commentId: string) => void;
  userComment?: Comment;
  showAllComments?: boolean;
  readOnly?: boolean;
  currentUserId?: string;
  onCommentHover?: (commentId: string | null) => void;
  selectedCommentId?: string | null;
  onSelectedCommentChange?: (commentId: string | null) => void;
  onVisibleCommentsChange?: (commentIds: string[]) => void;
}

export type CommentSortOrder = 'newest' | 'oldest' | 'votes' | 'quadrant-i' | 'quadrant-ii' | 'quadrant-iii' | 'quadrant-iv';

export interface ResultsViewProps {
  activity: WeAllExplainActivity;
  isVisible: boolean;
  onToggle: () => void;
  onCommentVote?: (commentId: string) => void;
  currentUserId?: string;
}