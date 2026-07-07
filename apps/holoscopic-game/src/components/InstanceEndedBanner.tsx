'use client';

import { usePathname } from 'next/navigation';
import { useInstance } from '@/contexts/InstanceContext';
import { instanceSlugFromPath } from '@/lib/instanceSlug';
import { mono } from '@/lib/ui';

/** Persistent strip shown across game pages once the current game has ended. */
export default function InstanceEndedBanner() {
  const { ended } = useInstance();
  const pathname = usePathname();

  // Only on a game page (URL carries a slug), and only once that game has ended.
  if (!ended || !instanceSlugFromPath(pathname)) return null;

  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: '0.5rem', padding: '0.5rem 1rem', textAlign: 'center',
        background: 'rgba(200, 59, 80, 0.1)', borderBottom: '1px solid var(--accent)',
        fontFamily: mono, fontSize: 'var(--text-2xs)', letterSpacing: '0.06em',
        textTransform: 'uppercase', color: 'var(--accent)',
      }}
    >
      This game has ended — read only
    </div>
  );
}
