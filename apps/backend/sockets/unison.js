// Unison — socket room membership only, mirroring sockets/oas.js. All
// mutations go through REST (where account tokens are verified); these handlers
// just subscribe a client to its community's broadcast room
// `unison:<instanceId>`. The funnel (utils/unisonNodes.js) owns the broadcasts:
//   • node_published { node }        — a thought entered the community feed
//   • reply_upserted { postId, reply } — a public reply landed/changed on a
//                                        post (the live reply map / comments)
// A member's own private map edits stay local + REST — only community-visible
// events (publish, replies) are broadcast, so private drafts never leak over
// the wire.
function registerUnisonHandlers(io, socket) {
  socket.on('unison:join', ({ instanceId }) => {
    if (instanceId) socket.join(`unison:${instanceId}`);
  });

  socket.on('unison:leave', ({ instanceId }) => {
    if (instanceId) socket.leave(`unison:${instanceId}`);
  });
}

module.exports = { registerUnisonHandlers };
