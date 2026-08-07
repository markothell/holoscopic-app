'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { io } from 'socket.io-client';

// One memory, watching for its own transcript.
//
// THE WALL NO LONGER MOUNTS THIS, and that is the point of the current shape.
//
// It used to. Every visitor to /c/<slug> opened a socket so that a memory
// added from another phone could be announced — "a memorial is often open on a
// kitchen table while a family adds to it from three different phones" — and
// the announcement was carefully built never to move content under a reader.
// The design was right and the arithmetic was not:
//
//   • `memory_updated` and `transcript_ready` called router.refresh() on EVERY
//     connected client, unconditionally. router.refresh() is a full server
//     re-render, so one transcript completing with three hundred people on the
//     wall was three hundred simultaneous renders — all inside the same couple
//     of hundred milliseconds, because they were all reacting to one broadcast.
//     memorialReadLimiter allows 600/min AGGREGATE across every memorial (a
//     server-rendered wall arrives from a handful of Vercel egress IPs, so a
//     per-visitor allowance would mean nothing), and half that budget went in a
//     fraction of a second. The next reader got "This memorial is very busy"
//     while doing nothing but reading.
//   • Almost nobody was ever there to see the payoff. Most people arrive from
//     a text message, read for ninety seconds, and leave. Nothing changes while
//     they are there, so the connection bought a moment they never reached.
//
// So the wall is plain server-rendered HTML again, and this component keeps
// only the case where live genuinely earns its keep: you recorded a memory,
// you are looking at it, and Deepgram is about to hand back the words. One
// reader, one memory, one thing that will visibly change within seconds.
//
// IF THE WALL EVER GOES LIVE AGAIN, the shape that scales is: announce, never
// refresh (a counter costs no request at all), and never react to an event
// about something that is not on this page. Both rules are applied below.
//
// Not renamed to something like LiveTranscript only because the tree is
// shared and a rename is a worse diff than a comment right now.

export default function LiveWall({
  // The RESOLVED instance id from GET /config — never the /c/<slug> slug.
  // That env var holds the slug ("chorus"), while the funnel broadcasts to
  // `memorial:<req.instanceId>`, the short id resolveInstance produced. Joining
  // on the slug subscribes to a room nothing ever publishes to, and the failure
  // is completely silent: the socket connects, the join is accepted, and no
  // event ever arrives.
  instanceId,
  // The memory this page is showing. Events name an id; anything that is not
  // this one is somebody else's memory changing somewhere else on the
  // memorial, and re-rendering this page for it is pure cost.
  memoryId,
}: { instanceId: string; memoryId: string }) {
  const router = useRouter();

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SERVER_URL
      || (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api').replace(/\/api\/?$/, '');

    const socket = io(url, { transports: ['websocket', 'polling'] });
    const join = () => socket.emit('memorial:join', { instanceId });
    socket.on('connect', join);

    // Spread the herd. A single memory can be shared widely enough that many
    // people have it open at once, and a broadcast reaches all of them in the
    // same instant. Up to a second and a half of jitter is imperceptible on a
    // transcript that took twenty seconds to arrive, and it turns a spike into
    // a trickle. Cleared on unmount so a refresh cannot fire after navigation.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refreshSoon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), Math.random() * 1500);
    };

    // Deepgram came back. The one thing this component exists for.
    socket.on('transcript_ready', ({ id }: { id?: string }) => {
      if (id === memoryId) refreshSoon();
    });

    // A curator hid or restored this memory. Refreshing is what turns a hidden
    // memory's page into the 404 it is supposed to be.
    socket.on('memory_updated', ({ id }: { id?: string }) => {
      if (id === memoryId) refreshSoon();
    });

    return () => {
      clearTimeout(timer);
      socket.emit('memorial:leave', { instanceId });
      socket.disconnect();
    };
  }, [router, instanceId, memoryId]);

  return null;
}
