// On the Spectrum — socket room membership only. All mutations go through
// REST (where guest JWTs are verified); these handlers just subscribe a
// client to its game's broadcast room `game:<gameId>`, matching the
// vote-via-REST-then-broadcast pattern used by activities.
function registerSpectrumHandlers(io, socket) {
  socket.on('spectrum:join', ({ gameId }) => {
    if (gameId) socket.join(`game:${gameId}`);
  });

  socket.on('spectrum:leave', ({ gameId }) => {
    if (gameId) socket.leave(`game:${gameId}`);
  });
}

module.exports = { registerSpectrumHandlers };
