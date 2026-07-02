// TypeScript interfaces for Holoscopic data models

// Activity types supported by the app
export type ActivityType = 'dissolve' | 'resolve' | 'snapshot';

export interface SnapshotQuestion {
  id: string;
  topic: string;  // Short label used in legend, question header, dot tooltips
  label: string;  // Full question text shown as the name prompt ("Name an experience...")
  color: string;
  order: number;
}

export interface SnapshotAnswer {
  questionId: string;
  objectName: string;
  position: { x: number; y: number };
  comment: string;
}

// The atomic unit of participation: one (user, slot, question) contribution —
// a named position on the grid plus its comment text and received votes.
// Mirrors the backend Entry collection (the storage source of truth).
export interface ActivityEntry {
  id: string;
  userId: string;
  username: string;
  slotNumber: number;
  questionId?: string | null; // Snapshot: which question this belongs to
  objectName?: string;
  position?: { x: number; y: number } | null; // 0-1 normalized
  text?: string;
  voterIds: string[];
  voteCount: number;
  isSeed?: boolean; // sample data seeded from starterData
  createdAt: Date | string;
  updatedAt: Date | string;
}

// An entry that has been placed on the map
export type PositionedEntry = ActivityEntry & { position: { x: number; y: number } };

// Entries that render in the comments panel (have text)
export function commentEntries(activity: Pick<HoloscopicActivity, 'entries'>): ActivityEntry[] {
  return (activity.entries || []).filter(e => e.text && e.text.trim());
}

// Entries that render on the map (have a position)
export function positionedEntries(activity: Pick<HoloscopicActivity, 'entries'>): PositionedEntry[] {
  return (activity.entries || []).filter((e): e is PositionedEntry => !!e.position);
}

export function entryTimestamp(entry: ActivityEntry): Date {
  return new Date(entry.updatedAt || entry.createdAt);
}

export interface HoloscopicActivity {
  id: string;
  instanceId?: string; // the game this map belongs to
  title: string;
  urlName: string; // URL-friendly name for routing (e.g., "gratitude")
  activityType: ActivityType; // Determines UI/flow behavior

  // Author (optional - for participant-created activities)
  author?: {
    userId: string;
    name: string;
  };

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

  // Snapshot-specific
  snapshotQuestions?: SnapshotQuestion[];
  xAxisPoints?: 2 | 4;
  yAxisPoints?: 2 | 4;
  xAxisLabels?: string[];
  yAxisLabels?: string[];

  // Comment configuration
  commentQuestion: string;

  // Activity description and reference link
  preamble?: string; // Optional paragraph description for the activity
  wikiLink?: string; // Optional reference link for the activity

  // Starter data for seeding the activity
  starterData?: string; // JSON string materialized as isSeed entries

  // Vote configuration
  votesPerUser?: number | null; // null/undefined = unlimited votes

  // Multi-entry configuration
  // 0 = unlimited entries (solo tracker mode - only creator can add entries)
  // 1, 2, 4 = standard entry slots per user
  maxEntries?: number;

  // Public/Private access
  isPublic?: boolean; // If true, no authentication required

  // Profile links
  showProfileLinks?: boolean; // If true, show profile icons in results

  // Axis labels
  showAxisLabels?: boolean; // If true, show center axis labels on the map

  // Activity state
  status: 'active' | 'completed';
  isDraft: boolean;
  createdAt: Date;
  updatedAt: Date;
  closesAt?: Date | string | null; // when this map settles (window from creation)

  // Frame / topic context
  frameId?: string | null;
  topicId?: string | null;

  // Membership (presence is socket state, not data)
  participants: Participant[];

  // Participation content — present on single-activity payloads
  entries: ActivityEntry[];

  // Present on list payloads instead of full entries
  entryCount?: number;
}

export interface Participant {
  id: string;
  username: string;
  joinedAt: Date;
}

// WebSocket event types
export interface WebSocketEvents {
  // User actions
  'submit_entry': { userId: string; position?: { x: number; y: number }; text?: string; objectName?: string; slotNumber?: number; questionId?: string | null };
  'join_activity': { userId: string; username: string };
  'leave_activity': { userId: string };

  // Broadcast events
  'entry_upserted': { entry: ActivityEntry };
  'entry_voted': { entry: ActivityEntry };
  'entry_removed': { entryId: string };
  'entries_cleared': { userId: string; slotNumber: number };
  'participant_joined': { participant: Participant };
  'participant_left': { participantId: string };
  'activity_updated': { activity: HoloscopicActivity };
}

// Form interfaces for admin panel
export interface ActivityFormData {
  title: string;
  urlName?: string; // Optional - will be generated from title if not provided
  activityType: ActivityType; // Activity type selection
  mapQuestion: string;
  mapQuestion2: string; // Used by dissolve type, empty for resolve
  objectNameQuestion: string;
  xAxisLabel: string;
  xAxisMin: string;
  xAxisMax: string;
  yAxisLabel: string;
  yAxisMin: string;
  yAxisMax: string;
  commentQuestion: string;
  preamble?: string; // Optional paragraph description
  wikiLink?: string; // Optional reference link for the activity
  starterData?: string; // JSON string of initial data
  votesPerUser?: number | null; // Vote limit configuration
  maxEntries?: number; // 0 = unlimited/solo tracker, 1/2/4 = standard entry slots
  isPublic?: boolean; // Public/Private access
  showProfileLinks?: boolean; // Show profile icons in results
  showAxisLabels?: boolean; // Show center axis labels on the map
  // Snapshot-specific
  snapshotQuestions?: SnapshotQuestion[];
  xAxisPoints?: 2 | 4;
  yAxisPoints?: 2 | 4;
  xAxisLabels?: string[];
  yAxisLabels?: string[];
}

export interface ActivityListResponse {
  activities: HoloscopicActivity[];
  total: number;
}

// Component props interfaces
export interface MappingGridProps {
  activity: HoloscopicActivity;
  onRatingSubmit: (position: { x: number; y: number }) => void;
  userRating?: ActivityEntry;
  showAllRatings?: boolean;
  hoveredCommentId?: string | null;
  onDotClick?: (entryId: string) => void;
  visibleCommentIds?: string[];
  hoveredSlotNumber?: number | null;
  currentUserId?: string;
}

export interface CommentSectionProps {
  activity: HoloscopicActivity;
  onCommentSubmit: (text: string) => void;
  onCommentVote?: (entryId: string) => void;
  userComment?: ActivityEntry;
  showAllComments?: boolean;
  readOnly?: boolean;
  currentUserId?: string;
  onCommentHover?: (entryId: string | null) => void;
  selectedCommentId?: string | null;
  onSelectedCommentChange?: (entryId: string | null) => void;
  onVisibleCommentsChange?: (entryIds: string[]) => void;
  // Game slug for profile links — when set (and the activity allows it),
  // each comment links to its author's game-scoped profile
  gameSlug?: string;
  // When set, only comments whose ID appears in this list are shown (used for quadrant filtering)
  filterCommentIds?: string[] | null;
}

export type CommentSortOrder = 'newest' | 'oldest' | 'votes';

export interface ResultsViewProps {
  activity: HoloscopicActivity;
  isVisible: boolean;
  onToggle: () => void;
  onCommentVote?: (entryId: string) => void;
  onVoteComment?: (activityId: string, entryId: string, userId: string) => Promise<void>;
  currentUserId?: string;
  hoveredSlotNumber?: number | null;
  gameSlug?: string;
  hideCommentsPanel?: boolean; // Hide the internal comments panel on lg screens
  onDotClick?: (entryId: string) => void; // External dot-click handler (for when panel is hidden)
  externalHoveredCommentId?: string | null; // External hover state (for when panel is hidden)
  // Snapshot: called when a quadrant cell is clicked; passes filtered comment IDs (null = clear filter)
  onActiveCellChange?: (filteredCommentIds: string[] | null) => void;
}
