// TypeScript interfaces for Holoscopic data models

export interface HoloscopicActivity {
  id: string;
  title: string;
  urlName: string; // URL-friendly name for routing (e.g., "gratitude")
  
  // Map configuration
  mapQuestion: string;
  mapQuestion2: string;
  objectNameQuestion: string; // Question asking user to name their object
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

  // Activity description and wiki link
  preamble?: string; // Optional paragraph description for the activity
  wikiLink?: string; // Optional link to wiki page

  // Starter data for seeding the activity
  starterData?: string; // JSON string of initial ratings/comments

  // Vote configuration
  votesPerUser?: number | null; // null/undefined = unlimited votes

  // Multi-entry configuration
  maxEntries?: number; // 1, 2, or 4 entry slots per user

  // Public/Private access
  isPublic?: boolean; // If true, no authentication required

  // Profile links
  showProfileLinks?: boolean; // If true, show profile icons in results

  // Activity state
  status: 'active' | 'completed';
  isDraft: boolean;
  createdAt: Date;
  updatedAt: Date;

  // Access control
  requiresEnrollment?: boolean;
  enrollmentDescription?: string;
  maxParticipants?: number | null;
  enrolledUsers?: {
    userId: string;
    enrolledAt: Date;
  }[];
  
  // Participant data
  participants: Participant[];
  ratings: Rating[];
  comments: Comment[];
}

export interface Rating {
  id: string;
  userId: string;
  username: string;
  objectName?: string; // User's named object
  slotNumber?: number; // Entry slot (1-4)
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
  objectName?: string; // User's named object replaces quadrant name
  slotNumber?: number; // Entry slot (1-4)
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
  objectName?: string; // Store participant's named object
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
  'activity_updated': { activity: HoloscopicActivity };
}

// Form interfaces for admin panel
export interface ActivityFormData {
  title: string;
  urlName?: string; // Optional - will be generated from title if not provided
  mapQuestion: string;
  mapQuestion2: string;
  objectNameQuestion: string;
  xAxisLabel: string;
  xAxisMin: string;
  xAxisMax: string;
  yAxisLabel: string;
  yAxisMin: string;
  yAxisMax: string;
  commentQuestion: string;
  preamble?: string; // Optional paragraph description
  wikiLink?: string; // Optional link to wiki page
  starterData?: string; // JSON string of initial data
  votesPerUser?: number | null; // Vote limit configuration
  maxEntries?: number; // Multi-entry configuration (1, 2, or 4)
  isPublic?: boolean; // Public/Private access
  showProfileLinks?: boolean; // Show profile icons in results
}

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ActivityListResponse {
  activities: HoloscopicActivity[];
  total: number;
}

// Component props interfaces
export interface MappingGridProps {
  activity: HoloscopicActivity;
  onRatingSubmit: (position: { x: number; y: number }) => void;
  userRating?: Rating;
  showAllRatings?: boolean;
  hoveredCommentId?: string | null;
  onDotClick?: (commentId: string) => void;
  visibleCommentIds?: string[];
  hoveredSlotNumber?: number | null;
  currentUserId?: string;
}

export interface CommentSectionProps {
  activity: HoloscopicActivity;
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

export type CommentSortOrder = 'newest' | 'oldest' | 'votes';

export interface ResultsViewProps {
  activity: HoloscopicActivity;
  isVisible: boolean;
  onToggle: () => void;
  onCommentVote?: (commentId: string) => void;
  currentUserId?: string;
  hoveredSlotNumber?: number | null;
}