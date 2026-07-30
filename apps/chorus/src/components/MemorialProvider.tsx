'use client';

import { createContext, useContext, useMemo } from 'react';
import { memorialApiFor, type MemorialApi } from '@/services/api';

// Which memorial the client half of the app is looking at.
//
// Server Components read the `slug` from their route params directly. Client
// components — the compose sheet, the report control, the curate screen — sit
// several levels below any page and would otherwise each need the slug threaded
// down as a prop. They read it from here instead.
//
// `slug` addresses the memorial in URLs and in the `x-instance-id` header;
// `instanceId` is the RESOLVED short id, and the two are not interchangeable.
// The socket room is keyed on the resolved id, and joining on the slug
// subscribes to a room nothing publishes to — silently, with a successful
// connect and a successful join. Both live here so neither has to be guessed.

type Memorial = {
  slug: string;
  instanceId: string;
  subjectName: string;
  api: MemorialApi;
};

const Ctx = createContext<Memorial | null>(null);

export function MemorialProvider({
  slug, instanceId, subjectName, children,
}: {
  slug: string;
  instanceId: string;
  subjectName: string;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({ slug, instanceId, subjectName, api: memorialApiFor(slug) }),
    [slug, instanceId, subjectName],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Throws rather than returning null. A client component that renders outside
// the provider has no memorial to act on, and every fallback available here
// would be worse than a loud failure: guessing a slug writes someone's memory
// into the wrong memorial.
export function useMemorial(): Memorial {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useMemorial must be used inside a MemorialProvider');
  return ctx;
}
