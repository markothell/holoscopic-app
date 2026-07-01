'use client';

import { createContext, useContext, ReactNode, useEffect, useState } from 'react';
import { setCurrentInstanceId } from '@/lib/api';

// Top-level Next.js page routes that are not instance slugs.
export const SYSTEM_PATHS = new Set([
  '', 'a', 'dashboard', 'admin', 'create', 'profile', 'login', 'signup',
  'settings', 'start', 'waitlist', 'essays', 'manifesto', 'sequence',
  'patterns', 'frame', 'play', 'topics', 'inquiry', 'algorithms', 'api',
  'interview',
]);

interface HolonConfig {
  startingStake: number;
  nominationCost: number;
  supportCost: number;
  algorithmPublishCost: number;
  sessionHostReward: number;
  sessionParticipantReward: number;
  topicQuorumReward: number;
  algorithmRoyaltyPercent: number;
  forkRoyaltyDecayPercent: number;
  forkDepthCap: number;
  // Activity stake model
  activityStakeAmount: number;
  frameUseReward: number;
  entrySeedReward: number;
  patternActivityReward: number;
}

interface QuorumConfig {
  topicSupportThreshold: number;
  topicWindowHours: number;
  inquiryMinParticipants: number;
  frameVoteThreshold: number;
  algorithmSessionQuorum: number;
  algorithmProposalWindowHours: number;
}

interface InstanceConfig {
  holons: HolonConfig;
  quorum: QuorumConfig;
}

interface InstanceData {
  id: string;
  name: string;
  slug: string;
  config: InstanceConfig;
  access: { mode: string; inviteCodes: string[] };
  active: boolean;
  startDate: string | null;
  endDate: string | null;
  gameVersion: string | null;
  gameNumber: number | null;
}

interface InstanceContextType {
  instance: InstanceData | null;
  config: InstanceConfig | null;
  isLoading: boolean;
  ended: boolean;
}

const InstanceContext = createContext<InstanceContextType>({
  instance: null,
  config: null,
  isLoading: true,
  ended: false,
});

function computeEnded(instance: InstanceData | null): boolean {
  if (!instance) return false;
  if (instance.active === false) return true;
  return !!(instance.endDate && new Date(instance.endDate) < new Date());
}

export function InstanceProvider({ children }: { children: ReactNode }) {
  const [instance, setInstance] = useState<InstanceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    const segments = window.location.pathname.split('/');
    // /interview/[session]/... → session is the instance slug
    const pathSlug = segments[1] === 'interview' ? segments[2] : segments[1];
    const headers: Record<string, string> = {};
    if (pathSlug && !SYSTEM_PATHS.has(pathSlug)) headers['x-instance-id'] = pathSlug;

    fetch(`${apiUrl}/instances/current`, { headers })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.instance) {
          setInstance(data.instance);
          setCurrentInstanceId(data.instance.id);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <InstanceContext.Provider value={{ instance, config: instance?.config ?? null, isLoading, ended: computeEnded(instance) }}>
      {children}
    </InstanceContext.Provider>
  );
}

export function useInstance() {
  return useContext(InstanceContext);
}
