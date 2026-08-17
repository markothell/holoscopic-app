// Deepgram transcription for gather responses (the builder's single-round
// circle activities, PRIMITIVES.md §9).
//
// Third sibling over the same utils/transcribe.js core, after
// memorialTranscribe and thresholdTranscribe. Still ~30 lines because the only
// genuinely app-specific facts are where the audio URL lives, which route
// answers the callback, and which ids that route needs.
//
// Optional by design, like the others: with no DEEPGRAM_API_KEY this is a
// no-op and responses stay 'skipped'. A story-shape reveal is a wall of
// voices; a transcript lets the wall be read as well as played, and is still
// never allowed to gate anything.

const transcribe = require('./transcribe');

const CALLBACK_PATH = '/circles/hooks/deepgram';

/**
 * Ask Deepgram to transcribe one response's audio.
 *
 * The callback carries `s=` (the share) and is authenticated by `t=` alone.
 * It must NOT rely on req.instanceId: Deepgram sends none of our headers, so
 * resolveInstance would fall through to the default interView edition — the
 * same trap the memorial and threshold hooks exist to avoid. A share id is
 * globally unique, so the row carries its own instance and nothing needs to
 * be passed.
 */
async function requestTranscript({ share, fetchImpl = globalThis.fetch, markPending = null }) {
  return transcribe.requestTranscript({
    id: share?.id,
    audioUrl: share?.audio?.url,
    callbackPath: CALLBACK_PATH,
    params: { s: share?.id },
    label: 'gatherTranscribe',
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
