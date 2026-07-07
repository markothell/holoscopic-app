'use client';

import { createContext, useContext, ReactNode, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { instanceSlugFromPath } from '@/lib/instanceSlug';

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
  // 'explore' switches the holon economy off: no costs, no rewards, instant
  // creation. Balances render as ∞ rather than a number.
  mode?: 'normal' | 'explore';
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

  // The active game is the one in the URL. This context only loads that game's
  // display config (name, holon costs, dates) — it does NOT decide request
  // routing; that is derived from the URL per-request in lib/api. Re-fetch
  // whenever the slug changes so a client-side game switch loads the new config.
  const instanceSlug = instanceSlugFromPath(usePathname()) ?? '';

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    const headers: Record<string, string> = {};
    if (instanceSlug) headers['x-instance-id'] = instanceSlug;

    let cancelled = false;
    setIsLoading(true);
    fetch(`${apiUrl}/instances/current`, { headers })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (cancelled) return;
        if (data?.instance) setInstance(data.instance);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoading(false); });

    // A stale in-flight response must not overwrite a newer navigation.
    return () => { cancelled = true; };
  }, [instanceSlug]);

  return (
    <InstanceContext.Provider value={{ instance, config: instance?.config ?? null, isLoading, ended: computeEnded(instance) }}>
      {children}
    </InstanceContext.Provider>
  );
}

export function useInstance() {
  return useContext(InstanceContext);
}
