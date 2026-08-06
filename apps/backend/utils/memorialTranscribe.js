// Deepgram transcription for Chorus recorded memories.
//
// Everything general moved to utils/transcribe.js when Threshold became the
// second consumer — the Deepgram call, the callback base derivation, the
// timeout, the envelope parsing, and the HMAC that keeps a stranger from
// rewriting what somebody said. What is left here is the only part that was
// ever about memorials: where the audio URL lives on a Memory, which route
// answers the callback, and which ids that route needs to find the row again.
//
// The module's exported surface is UNCHANGED, so routes/memorial.js,
// websocket-server.js and utils/memories.js#setTranscriber need no edits.
//
// Transcripts earn their keep three times over: accessibility, a "read it
// instead" affordance for someone who can't play audio where they are, and
// full-text search later.

const transcribe = require('./transcribe');

const CALLBACK_PATH = '/memorial/hooks/deepgram';

/**
 * Ask Deepgram to transcribe a memory's audio.
 *
 * The callback carries `i=` (the instance) as well as `m=` because the hook
 * cannot use req.instanceId: Deepgram sends none of our headers, so
 * resolveInstance would fall through to the default interView edition and the
 * transcript would land in the wrong memorial.
 */
async function requestTranscript({ memory, fetchImpl = globalThis.fetch, markPending = null }) {
  return transcribe.requestTranscript({
    id: memory?.id,
    audioUrl: memory?.body?.audio?.url,
    callbackPath: CALLBACK_PATH,
    params: { m: memory?.id, i: memory?.instanceId },
    label: 'memorialTranscribe',
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
