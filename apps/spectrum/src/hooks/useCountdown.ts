'use client';

import { useEffect, useRef, useState } from 'react';

// Renders a server-authoritative deadline. serverNow (from the same payload
// as the deadline) calibrates a clock offset once, so phones with skewed
// clocks still count down in sync with the room.
export function useCountdown(deadline: string | null, serverNow: string | null) {
  const offsetRef = useRef(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (serverNow) {
      offsetRef.current = new Date(serverNow).getTime() - Date.now();
    }
  }, [serverNow]);

  useEffect(() => {
    if (!deadline) {
      setSecondsLeft(null);
      return;
    }
    const end = new Date(deadline).getTime();
    const tick = () => {
      const now = Date.now() + offsetRef.current;
      setSecondsLeft(Math.max(0, Math.ceil((end - now) / 1000)));
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [deadline]);

  return secondsLeft;
}
