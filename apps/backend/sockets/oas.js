// On a Spectrum — socket room membership only. All mutations go through
// REST (where account tokens are verified); these handlers just subscribe a
// client to its game's broadcast room `oasgame:<gameId>`, matching the
// vote-via-REST-then-broadcast pattern used by activities and spectrum.
// Map sheets additionally join the generic activity room (join_activity)
// for entry_upserted / entry_voted.
function registerOasHandlers(io, socket) {
  socket.on('oas:join', ({ gameId }) => {
    if (gameId) socket.join(`oasgame:${gameId}`);
  });

  socket.on('oas:leave', ({ gameId }) => {
    if (gameId) socket.leave(`oasgame:${gameId}`);
  });
}

module.exports = { registerOasHandlers };
