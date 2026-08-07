'use client';

// A client boundary for @hs/audio's PlayerProvider.
//
// The root layout is a Server Component, and the provider owns a single
// <audio> element and browser state — so it needs a 'use client' file of its
// own rather than being imported straight into the layout.

import { PlayerProvider } from '@hs/audio';

export default PlayerProvider;
