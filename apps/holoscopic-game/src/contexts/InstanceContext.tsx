'use client';

import { createContext, useContext, ReactNode, useEffect, useState } from 'react';

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
  topicsActivityId: string | null;
  holons: HolonConfig;
  quorum: QuorumConfig;
}

interface InstanceData {
  id: string;
  name: string;
  slug: string;
  gameType: string;
  config: InstanceConfig;
  access: { mode: string; inviteCodes: string[] };
  startDate: string | null;
  endDate: string | null;
  gameVersion: string | null;
  gameNumber: number | null;
}

interface InstanceContextType {
  instance: InstanceData | null;
  config: InstanceConfig | null;
  isLoading: boolean;
}

const InstanceContext = createContext<InstanceContextType>({
  instance: null,
  config: null,
  isLoading: true,
});

export function InstanceProvider({ children }: { children: ReactNode }) {
  const [instance, setInstance] = useState<InstanceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    fetch(`${apiUrl}/instances/current`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.instance) setInstance(data.instance);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <InstanceContext.Provider value={{ instance, config: instance?.config ?? null, isLoading }}>
      {children}
    </InstanceContext.Provider>
  );
}

export function useInstance() {
  return useContext(InstanceContext);
}
