const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api';

/**
 * The slug of the default interView edition, or null.
 *
 * The backend can be mid cold-boot (Render spins the service down when idle,
 * then spends several seconds reconnecting Mongo before routes are live) — one
 * attempt during that window reads as a network error or a non-2xx. Two
 * attempts absorb that blip without resorting to guessing a slug on a real
 * outage.
 *
 * Server-side only: every caller is a Server Component redirect.
 */
export async function fetchDefaultGameSlug(): Promise<string | null> {
  const attempt = async (n: number): Promise<string | null> => {
    try {
      const res = await fetch(`${API_URL}/instances/current`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        console.error(`instances/current returned ${res.status} (attempt ${n})`);
        return null;
      }
      const data = await res.json();
      return data?.instance?.slug ?? null;
    } catch (err) {
      console.error(`instances/current fetch failed (attempt ${n})`, err);
      return null;
    }
  };

  const first = await attempt(1);
  if (first) return first;
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return attempt(2);
}
