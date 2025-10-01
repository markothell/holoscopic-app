// TypeScript types for Sequence model

export interface SequenceActivity {
  activityId: string;
  order: number;
  duration: number; // days
  openedAt: Date | null;
  closedAt: Date | null;
  // Populated from Activity
  activity?: {
    id: string;
    title: string;
    urlName: string;
    status: string;
    isDraft?: boolean;
    participants?: number;
    completedMappings?: number;
  };
  hasParticipated?: boolean;
}

export interface SequenceMember {
  userId: string;
  joinedAt: Date;
}

export interface Sequence {
  id: string;
  title: string;
  urlName: string;
  description: string;
  activities: SequenceActivity[];
  members: SequenceMember[];
  status: 'draft' | 'active' | 'completed';
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // Virtuals
  memberCount?: number;
  activityCount?: number;
  completionStatus?: {
    total: number;
    opened: number;
    closed: number;
    percentComplete: number;
  };
}

export interface CreateSequenceData {
  title: string;
  urlName: string;
  description?: string;
  activities?: Array<{
    activityId: string;
    order: number;
    duration: number;
  }>;
}

export interface UpdateSequenceData {
  title?: string;
  urlName?: string;
  description?: string;
  activities?: Array<{
    activityId: string;
    order: number;
    duration: number;
  }>;
  status?: 'draft' | 'active' | 'completed';
}