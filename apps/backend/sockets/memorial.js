// Chorus — socket room membership only, mirroring sockets/synthesis.js and
// sockets/oas.js. Every mutation goes through REST; these handlers just
// subscribe a client to one memorial's broadcast room `memorial:<instanceId>`.
//
// The funnel (utils/memories.js) owns the broadcasts:
//   • memory_created  { memory }            — a new memory reached the wall
//   • memory_updated  { id, status }        — a curator hid or restored one
//   • transcript_ready { id }               — Deepgram came back
//
// Only ever LIVE, already-public content crosses this wire, and the payload is
// the same toClient projection the REST reads use — so contributorId, ipHash
// and flaggerIds stay server-side here exactly as they do everywhere else.
//
// Joining takes no identity because a memorial wall is public: anyone with the
// link can already read every memory over REST, so a room that mirrors it
// grants nothing extra. The instanceId is a room key, not a permission.
function registerMemorialHandlers(io, socket) {
  socket.on('memorial:join', ({ instanceId }) => {
    if (instanceId) socket.join(`memorial:${instanceId}`);
  });

  socket.on('memorial:leave', ({ instanceId }) => {
    if (instanceId) socket.leave(`memorial:${instanceId}`);
  });
}

module.exports = { registerMemorialHandlers };
