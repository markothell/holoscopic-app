// Synthesis — socket room membership only, mirroring sockets/oas.js. All
// mutations go through REST (where account tokens are verified); these handlers
// just subscribe a client to its community's broadcast room
// `syn:<instanceId>`. The funnel (utils/synNodes.js) owns the broadcasts:
//   • node_published { node }        — a thought entered the community feed
//   • reply_upserted { postId, reply } — a public reply landed/changed on a
//                                        post (the live reply map / comments)
// A member's own private map edits stay local + REST — only community-visible
// events (publish, replies) are broadcast, so private drafts never leak over
// the wire.
function registerSynthesisHandlers(io, socket) {
  socket.on('syn:join', ({ instanceId }) => {
    if (instanceId) socket.join(`syn:${instanceId}`);
  });

  socket.on('syn:leave', ({ instanceId }) => {
    if (instanceId) socket.leave(`syn:${instanceId}`);
  });
}

module.exports = { registerSynthesisHandlers };
