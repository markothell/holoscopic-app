// TypeScript types for Sequence model

export interface SequenceHost {
  userId: string;
  name: string;
}

export interface SequenceRound {
  number: number;
  hidden: boolean;
}

export interface SequenceActivity {
  activityId: string;
  order: number;
  autoClose: boolean;
  duration: number | null;
  openedAt: Date | null;
  closedAt: Date | null;
  parentActivityIds?: string[];
  round?: number | null;
  openOnCreate?: boolean;
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
  username?: string;
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
  createdBy?: string;
  host?: SequenceHost;
  updates?: string;
  welcomePage?: WelcomePage;
  activities: SequenceActivity[];
  rounds?: SequenceRound[];
  members: SequenceMember[];
  invitedEmails?: string[];
  requireInvitation?: boolean;
  status: 'draft' | 'waitlist' | 'active' | 'completed';
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
  createdBy?: string;
  welcomePage?: WelcomePage;
  activities?: Array<{
    activityId: string;
    order: number;
    autoClose: boolean;
    duration: number | null;
    parentActivityIds?: string[];
    round?: number | null;
    openOnCreate?: boolean;
  }>;
  requireInvitation?: boolean;
  invitedEmails?: string[];
}

export interface UpdateSequenceData {
  title?: string;
  urlName?: string;
  description?: string;
  updates?: string;
  welcomePage?: WelcomePage;
  activities?: Array<{
    activityId: string;
    order: number;
    autoClose: boolean;
    duration: number | null;
    openedAt?: Date | string | null;
    closedAt?: Date | string | null;
    parentActivityIds?: string[];
    round?: number | null;
    openOnCreate?: boolean;
  }>;
  invitedEmails?: string[];
  requireInvitation?: boolean;
  status?: 'draft' | 'waitlist' | 'active' | 'completed';
}