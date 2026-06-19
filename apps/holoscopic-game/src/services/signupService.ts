import { apiFetch } from '@/lib/api';

/**
 * General interest capture (notify-me). Distinct from the per-sequence
 * waitlist — this is for prompts like "Start your own".
 */
export const SignupService = {
  create: (email: string, source = 'start-your-own') =>
    apiFetch('/signup', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim(), source }),
    }).then(d => d as { success: boolean }),
};
