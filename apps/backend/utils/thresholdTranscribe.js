// Deepgram transcription for Threshold shares.
//
// Sibling of utils/memorialTranscribe.js over the same utils/transcribe.js
// core. Both are ~30 lines because the only genuinely app-specific facts are
// where the audio URL lives, which route answers the callback, and which ids
// that route needs.
//
// A transcript matters MORE here than in Chorus. The rank phase asks somebody
// to compare up to two dozen stories in one sitting; reading is far faster than
// listening, and a story with no transcript is one that has to be played in
// full before it can be placed. It is still never allowed to gate anything —
// audio records, plays and ranks without it.

const transcribe = require('./transcribe');

const CALLBACK_PATH = '/threshold/hooks/deepgram';

/**
 * Ask Deepgram to transcribe one share's audio.
 *
 * The callback carries `s=` (the share) and is authenticated by `t=` alone.
 * It must NOT rely on req.instanceId: Deepgram sends none of our headers, so
 * resolveInstance would fall through to the default interView edition — the
 * same trap the memorial hook exists to avoid. A share id is globally unique,
 * so the row carries its own instance and nothing needs to be passed.
 */
async function requestTranscript({ share, fetchImpl = globalThis.fetch, markPending = null }) {
  return transcribe.requestTranscript({
    id: share?.id,
    audioUrl: share?.audio?.url,
    callbackPath: CALLBACK_PATH,
    params: { s: share?.id },
    label: 'thresholdTranscribe',
    fetchImpl,
    markPending,
  });
}

module.exports = {
  requestTranscript,
  readiness: transcribe.readiness,
  callbackToken: transcribe.callbackToken,
  verifyCallbackToken: transcribe.verifyCallbackToken,
  extractTranscript: transcribe.extractTranscript,
  CALLBACK_PATH,
};
