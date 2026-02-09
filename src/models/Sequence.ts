// TypeScript types for Sequence model

export interface SequenceActivity {
  activityId: string;
  order: number;
  autoClose: boolean; // whether to automatically close after duration
  duration: number | null; // days (null if autoClose is false)
  openedAt: Date | null;
  closedAt: Date | null;
  parentActivityIds?: string[]; // DAG relationships (empty/undefined = root node)
  // Populated from Activity
  activity?: {
    id: string;
    title: string;
    urlName: string;
    activityType?: string;
    status: string;
    isDraft?: boolean;
    participants?: number;
    completedMappings?: number;
    author?: {
      userId: string;
      name: string;
    };
  };
  hasParticipated?: boolean;
}

export interface SequenceMember {
  userId: string;
  email?: string;
  joinedAt: Date;
}

export interface WelcomePage {
  enabled: boolean;
  requestName: boolean;
  welcomeText: string;
  referenceLink: string;
}

export interface Sequence {
  id: string;
  title: string;
  urlName: string;
  description: string;
  welcomePage?: WelcomePage;
  activities: SequenceActivity[];
  members: SequenceMember[];
  invitedEmails?: string[];
  requireInvitation?: boolean;
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
  welcomePage?: WelcomePage;
  activities?: Array<{
    activityId: string;
    order: number;
    autoClose: boolean;
    duration: number | null;
    parentActivityIds?: string[];
  }>;
  requireInvitation?: boolean;
  invitedEmails?: string[];
}

export interface UpdateSequenceData {
  title?: string;
  urlName?: string;
  description?: string;
  welcomePage?: WelcomePage;
  activities?: Array<{
    activityId: string;
    order: number;
    autoClose: boolean;
    duration: number | null;
    openedAt?: Date | string | null;
    closedAt?: Date | string | null;
    parentActivityIds?: string[];
  }>;
  invitedEmails?: string[];
  requireInvitation?: boolean;
  status?: 'draft' | 'active' | 'completed';
}