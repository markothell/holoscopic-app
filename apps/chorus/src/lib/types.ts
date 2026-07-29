// Wire types — these mirror utils/memories.js#toClient and the /config route
// exactly. If a field is missing here that exists on the server model, that is
// almost always deliberate: contributorId, ipHash, flaggerIds and curatorKey
// never cross the wire.

export type TagSet = 'role' | 'experience';

export interface Tag {
  id: string;
  set: TagSet;
  label: string;
  useCount: number;
  origin: 'seeded' | 'contributed';
}

export interface Memorial {
  instanceId: string;
  subjectName: string;
  subjectPhotoUrl: string;
  blurb: string;
  lifespan: string;
  /** Placeholders {name} / {role} / {experience}; {role} appears twice. */
  promptTemplate: string;
  allowCustomTags: boolean;
  audioMaxSeconds: number;
  accent: string;
}

export interface MemoryAudio {
  url: string;
  mimeType: string;
  durationMs: number;
  peaks: number[];
  transcript: { text: string; status: 'pending' | 'ready' | 'failed' | 'skipped' };
}

export interface Memory {
  id: string;
  title: string;
  sharerName: string;
  anonymous: boolean;
  subjectTags: Tag[];
  selfTags: Tag[];
  experienceTags: Tag[];
  body: {
    kind: 'text' | 'audio' | 'both';
    text: string;
    audio: MemoryAudio | null;
  };
  threadId: string;
  replyToId: string | null;
  /** The memory this was added to — enough of it to name, without a second fetch. */
  replyTo: { id: string; title: string; sharerName: string; anonymous: boolean } | null;
  /** How many memories sit in this one's thread, including itself. */
  threadCount: number;
  status: 'live' | 'hidden' | 'removed';
  flagCount: number;
  isMine: boolean;
  createdAt: string;
}

export interface ConfigResponse {
  memorial: Memorial;
  tags: { role: Tag[]; experience: Tag[] };
}

export interface WallResponse {
  memories: Memory[];
  nextCursor: string | null;
  /** Every memory matching the current filter, not just this page. */
  total: number;
  /** The ordering actually used — an unknown one falls back to the default. */
  sort: string;
}

/** What the compose sheet holds. Tags are LABELS — see memorialApi.create. */
export interface ComposeDraft {
  title: string;
  sharerName: string;
  subjectTags: string[];
  selfTags: string[];
  experienceTags: string[];
  text: string;
  /** Set once the recording has landed in Blob. The server validates the host. */
  audio?: {
    url: string;
    pathname: string;
    mimeType: string;
    durationMs: number;
    peaks: number[];
  } | null;
  replyToId?: string | null;
}

/** The memory an "Add to this memory" compose is attached to. */
export interface AddTarget {
  id: string;
  title: string;
  subjectTags: string[];
  selfTags: string[];
  experienceTags: string[];
}

export interface MemoryDetail {
  memory: Memory;
  /** The rest of the thread — everything added to this memory, or alongside it. */
  thread: Memory[];
}
