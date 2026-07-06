import { apiFetch } from '@/lib/api';

// Balance is per-instance; apiFetch injects the ambient x-instance-id set by
// InstanceContext, so callers always read the balance for the game they're in.
export const HolonService = {
  getBalance: (userId: string): Promise<number> =>
    apiFetch('/holons/balance', { userId }).then(d => d.balance as number),
};
