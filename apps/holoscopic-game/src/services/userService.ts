import { apiFetch } from '@/lib/api';
import type { UserSettings, UpdateUserSettingsData } from '@/models/User';

export type { UserSettings, UpdateUserSettingsData };

// One row of a player's cross-game history
export interface PlayerGame {
  instanceId: string;
  name: string;
  slug: string;
  gameNumber: number | null;
  active: boolean;
  startDate: string | null;
  endDate: string | null;
  joinedAt: string | null;
  stats: {
    entries: number;
    activities: number;
    topics: number;
    votesCast: number;
    frames: number;
    patterns: number;
  };
}

export interface PlayerGamesResponse {
  user: { id: string; name: string };
  games: PlayerGame[];
}

// Redacted personal map for one game. ownEntries carry the viewed player's
// authorship; votedEntries arrive author-stripped from the server.
export interface GameMapEntry {
  id: string;
  activityId: string;
  slotNumber: number;
  questionId?: string | null;
  objectName?: string;
  position?: { x: number; y: number } | null;
  text?: string;
  voteCount: number;
  isSeed?: boolean;
  userId?: string;
  username?: string;
}

export interface GameMapResponse {
  user: { id: string; name: string };
  instance: { id: string; name: string; slug: string; gameNumber: number | null } | null;
  topics: { id: string; title: string; status: string }[];
  activities: {
    id: string; title: string; urlName: string; activityType: string;
    topicId?: string | null; frameId?: string | null;
    xAxis?: { label: string }; yAxis?: { label: string };
    status: string;
  }[];
  ownEntries: GameMapEntry[];
  votedEntries: GameMapEntry[];
  frames: { id: string; xLabel: string; xMin: string; xMax: string; yLabel: string; yMin: string; yMax: string }[];
  patterns: { id: string; title: string; thesis?: string; publishedAt?: string }[];
}

export const UserService = {
  getSettings: (userId: string): Promise<UserSettings> =>
    apiFetch(`/users/${userId}/settings`),

  updateSettings: (userId: string, updates: UpdateUserSettingsData): Promise<UserSettings> =>
    apiFetch(`/users/${userId}/settings`, { method: 'PUT', body: JSON.stringify(updates) }),

  // Player history across games (viewer sees shared games only)
  getGames: (userId: string, viewerId: string): Promise<PlayerGamesResponse> =>
    apiFetch(`/users/${userId}/games`, { userId: viewerId }),

  // Redacted personal map for one game; `game` is an instance slug or id and
  // must override the ambient instance header (profile pages have no slug in
  // their path)
  getGameMap: (userId: string, viewerId: string, game: string): Promise<GameMapResponse> =>
    apiFetch(`/users/${userId}/game-map`, {
      userId: viewerId,
      headers: { 'x-instance-id': game },
    }),
};
