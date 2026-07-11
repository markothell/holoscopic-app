import { useEffect } from 'react';

// Make the browser/hardware back button close a state-driven overlay (e.g.
// the map sheet) instead of navigating away from the game. While `open`, a
// throwaway history entry is pushed; pressing back pops it and fires `close`
// rather than leaving /g/[code]. Pair with an explicit close that calls
// `window.history.back()` so the pushed entry is consumed symmetrically.
export function useHistoryBackClose(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    window.history.pushState({ sheet: true }, '');
    const onPop = () => close();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
