'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { io, type Socket } from 'socket.io-client';

// The wall, alive.
//
// A memorial is often open on a kitchen table while a family adds to it from
// three different phones, and watching it grow is the emotional core of the
// thing. But content must NEVER move under someone who is reading — on a page
// of stories about a person who died, having a paragraph jump mid-sentence is
// worse than a slightly stale wall.
//
// So: new memories are announced, never inserted. A quiet count appears, and
// tapping it refreshes and returns you to the top. The one exception is when
// you're already at the very top with nothing to lose — then it just refreshes,
// and the new memory settles in on its own.
//
// This component renders only the notice. The wall itself stays a Server
// Component; refreshing re-runs it on the server, so there is no second
// rendering path to keep in sync.

const AT_TOP_PX = 24;

export default function LiveWall({
  // The RESOLVED instance id from GET /config — never NEXT_PUBLIC_INSTANCE_ID.
  // That env var holds the slug ("chorus"), while the funnel broadcasts to
  // `memorial:<req.instanceId>`, the short id resolveInstance produced. Joining
  // on the slug subscribes to a room nothing ever publishes to, and the failure
  // is completely silent: the socket connects, the join is accepted, and no
  // event ever arrives.
  instanceId,
  // A single memory's page joins the same room but has nothing to announce —
  // it only wants its own transcript to appear when Deepgram finishes.
  announce = true,
}: { instanceId: string; announce?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(0);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SERVER_URL
      || (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api').replace(/\/api\/?$/, '');

    const socket = io(url, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    const join = () => socket.emit('memorial:join', { instanceId });
    socket.on('connect', join);

    socket.on('memory_created', () => {
      if (!announce) return;
      // Reading at the very top means nothing is under the reader's eye yet,
      // so the memory can simply appear.
      if (window.scrollY <= AT_TOP_PX) router.refresh();
      else setPending(n => n + 1);
    });

    // A curator hiding something, or a transcript arriving, changes the page
    // without adding to it — no announcement, just quietly correct itself.
    socket.on('memory_updated', () => router.refresh());
    socket.on('transcript_ready', () => router.refresh());

    return () => {
      socket.emit('memorial:leave', { instanceId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [router, announce, instanceId]);

  if (pending === 0) return null;

  return (
    <button
      type="button"
      onClick={() => {
        setPending(0);
        router.refresh();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }}
      className="fixed left-1/2 top-4 z-30 -translate-x-1/2 rounded-full bg-dial px-4 py-2
                 text-[0.875rem] font-medium text-card-raised shadow-[var(--shadow-lift)]
                 animate-[settle_320ms_cubic-bezier(0.16,0.84,0.44,1)]"
    >
      {pending === 1 ? '1 new memory' : `${pending} new memories`}
    </button>
  );
}
