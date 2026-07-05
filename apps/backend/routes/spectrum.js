const express = require('express');
const entryUtils = require('../utils/entries');
const games = require('../utils/spectrumGames');
const SpectrumGame = require('../models/SpectrumGame');

// On the Spectrum — REST surface. Thin wrappers over utils/spectrumGames.js
// (phase machine) and utils/entries.js (content). Mounted behind
// resolveInstance + attachVerifiedUser + enforceVerifiedUser, so mutations
// that claim a player id must carry a guest JWT whose sub matches.
// All broadcasts go to room `game:<gameId>`.
module.exports = function(io) {
  const router = express.Router();

  async function loadGame(req, res) {
    const code = String(req.params.code || '').toUpperCase();
    const game = await SpectrumGame.findOne({ code });
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return null;
    }
    return game;
  }

  function playerFrom(req, game) {
    const playerId = req.headers['x-user-id'] || (req.body && req.body.userId);
    if (!playerId) return null;
    return game.participants.find(p => p.id === playerId) || null;
  }

  function requireHost(req, res, game) {
    const player = playerFrom(req, game);
    if (!player || player.id !== game.hostId) {
      res.status(403).json({ error: 'Only the host can do that' });
      return null;
    }
    return player;
  }

  // Create a game — creator is the host and first participant.
  router.post('/games', async (req, res) => {
    try {
      const hostName = String(req.body.hostName || '').trim().slice(0, 20);
      if (!hostName) return res.status(400).json({ error: 'Name is required' });
      const { game, player, token } = await games.createGame({
        instanceId: req.instanceId,
        hostName,
      });
      res.status(201).json({ game: games.toClient(game), player, token });
    } catch (error) {
      console.error('Error creating spectrum game:', error);
      res.status(500).json({ error: 'Failed to create game' });
    }
  });

  // Full snapshot — the client's source of truth on load/focus/reconnect.
  // Runs the deadline sweep so an expired countdown resolves even if the
  // in-memory timer died with a restart.
  router.get('/games/:code', async (req, res) => {
    try {
      let game = await loadGame(req, res);
      if (!game) return;
      game = await games.sweepDeadline(game);
      const nominations = await games.listNominations(game);
      const payload = {
        game: games.toClient(game),
        nominations: nominations.map(entryUtils.toClient),
      };
      if (game.phase === 'reveal') {
        payload.results = await games.computeResults(game);
      }
      res.json(payload);
    } catch (error) {
      console.error('Error fetching spectrum game:', error);
      res.status(500).json({ error: 'Failed to fetch game' });
    }
  });

  // Join — name only. Identity-free request; the response mints the guest
  // identity (player + JWT) the client uses from then on.
  router.post('/games/:code/join', async (req, res) => {
    try {
      const game = await loadGame(req, res);
      if (!game) return;
      const name = String(req.body.name || '').trim().slice(0, 20);
      if (!name) return res.status(400).json({ error: 'Name is required' });
      const result = await games.joinGame({ game, name });
      if (result.spectator) {
        return res.json({ spectator: true, game: games.toClient(game) });
      }
      res.status(201).json({
        game: games.toClient(game),
        player: result.player,
        token: result.token,
      });
    } catch (error) {
      const known = ['Game is full', 'Name unavailable'];
      if (known.includes(error.message)) {
        return res.status(409).json({ error: error.message });
      }
      console.error('Error joining spectrum game:', error);
      res.status(500).json({ error: 'Failed to join game' });
    }
  });

  // Host: lobby → nominate (arms the countdown).
  router.post('/games/:code/start', async (req, res) => {
    try {
      const game = await loadGame(req, res);
      if (!game) return;
      if (!requireHost(req, res, game)) return;
      await games.startGame(game);
      res.json({ game: games.toClient(game) });
    } catch (error) {
      const known = ['Game already started', 'Need at least 2 players'];
      if (known.includes(error.message)) {
        return res.status(400).json({ error: error.message });
      }
      console.error('Error starting spectrum game:', error);
      res.status(500).json({ error: 'Failed to start game' });
    }
  });

  // Throw a characteristic onto the tally.
  router.post('/games/:code/nominations', async (req, res) => {
    try {
      const game = await loadGame(req, res);
      if (!game) return;
      if (game.phase !== 'nominate') {
        return res.status(400).json({ error: 'Nominations are closed' });
      }
      const player = playerFrom(req, game);
      if (!player) return res.status(403).json({ error: 'Join the game first' });
      const text = String(req.body.text || '').trim().slice(0, 60);
      if (!text) return res.status(400).json({ error: 'Idea text is required' });

      const mine = (await games.listNominations(game))
        .filter(e => e.userId === player.id);
      if (mine.length >= game.config.maxNominationsPerPlayer) {
        return res.status(400).json({
          error: `You can suggest up to ${game.config.maxNominationsPerPlayer} ideas`,
        });
      }
      const entry = await entryUtils.upsertEntry({
        activity: game,
        instanceId: game.instanceId,
        userId: player.id,
        username: player.name,
        slotNumber: mine.length + 1,
        questionId: games.NOM_QUESTION,
        text,
      });
      const wire = entryUtils.toClient(entry);
      io.to(`game:${game.id}`).emit('nomination_upserted', { entry: wire });
      res.status(201).json({ entry: wire });
    } catch (error) {
      console.error('Error nominating:', error);
      res.status(500).json({ error: 'Failed to add idea' });
    }
  });

  // Toggle a vote on a nomination (budget = config.votesPerUser).
  router.post('/games/:code/nominations/:entryId/vote', async (req, res) => {
    try {
      const game = await loadGame(req, res);
      if (!game) return;
      if (game.phase !== 'nominate') {
        return res.status(400).json({ error: 'Voting is closed' });
      }
      const player = playerFrom(req, game);
      if (!player) return res.status(403).json({ error: 'Join the game first' });
      const entry = await entryUtils.voteEntry({
        activity: game,
        entryId: req.params.entryId,
        userId: player.id,
      });
      const wire = entryUtils.toClient(entry);
      io.to(`game:${game.id}`).emit('nomination_voted', { entry: wire });
      res.json({ entry: wire });
    } catch (error) {
      if (error.message === 'Entry not found') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.startsWith('Vote limit') ||
          error.message === 'Cannot vote on your own entry') {
        return res.status(400).json({ error: error.message });
      }
      console.error('Error voting on nomination:', error);
      res.status(500).json({ error: 'Failed to vote' });
    }
  });

  // Host: end the countdown early (needs at least 2 ideas to resolve).
  router.post('/games/:code/advance', async (req, res) => {
    try {
      const game = await loadGame(req, res);
      if (!game) return;
      if (!requireHost(req, res, game)) return;
      if (game.phase !== 'nominate') {
        return res.status(400).json({ error: 'Not in the idea round' });
      }
      const nominations = await games.listNominations(game);
      if (nominations.length < 2) {
        return res.status(400).json({ error: 'Need at least 2 ideas first' });
      }
      const updated = await games.expireNominate(game, { forced: true });
      res.json({ game: games.toClient(updated) });
    } catch (error) {
      console.error('Error advancing spectrum game:', error);
      res.status(500).json({ error: 'Failed to advance' });
    }
  });

  // Submit a full ordering for one axis; `done: true` marks that axis
  // complete for this player (all players × both axes → auto-reveal).
  router.put('/games/:code/rankings/:axis', async (req, res) => {
    try {
      const game = await loadGame(req, res);
      if (!game) return;
      const player = playerFrom(req, game);
      if (!player) return res.status(403).json({ error: 'Join the game first' });
      const axis = req.params.axis;
      const order = req.body.order;
      if (!Array.isArray(order)) {
        return res.status(400).json({ error: 'order must be an array of player ids' });
      }
      await games.submitRanking({
        game, playerId: player.id, playerName: player.name, axis, order,
      });
      if (req.body.done) {
        await games.markRankingDone(game, player.id, axis);
      } else {
        games.emitToGame(game.id, 'ranking_progress', {
          playerId: player.id, axis, done: false, allDone: false,
        });
      }
      res.json({ game: games.toClient(game) });
    } catch (error) {
      const known = ['Not in ranking phase', 'Unknown axis',
        'Order must include every player exactly once'];
      if (known.includes(error.message)) {
        return res.status(400).json({ error: error.message });
      }
      console.error('Error submitting ranking:', error);
      res.status(500).json({ error: 'Failed to save ranking' });
    }
  });

  // Attach/replace a story on one placement.
  router.put('/games/:code/stories/:axis/:subjectIndex', async (req, res) => {
    try {
      const game = await loadGame(req, res);
      if (!game) return;
      const player = playerFrom(req, game);
      if (!player) return res.status(403).json({ error: 'Join the game first' });
      const text = String(req.body.text || '').trim().slice(0, 500);
      const entry = await games.submitStory({
        game,
        playerId: player.id,
        playerName: player.name,
        axis: req.params.axis,
        subjectIndex: parseInt(req.params.subjectIndex, 10),
        text,
      });
      res.json({ entry: entryUtils.toClient(entry) });
    } catch (error) {
      const known = ['Unknown axis', 'Unknown subject'];
      if (known.includes(error.message)) {
        return res.status(400).json({ error: error.message });
      }
      console.error('Error saving story:', error);
      res.status(500).json({ error: 'Failed to save story' });
    }
  });

  // Host: reveal with whatever rankings exist.
  router.post('/games/:code/reveal', async (req, res) => {
    try {
      const game = await loadGame(req, res);
      if (!game) return;
      if (!requireHost(req, res, game)) return;
      if (game.phase !== 'rank') {
        return res.status(400).json({ error: 'Not in the ranking round' });
      }
      const updated = await games.reveal(game);
      res.json({ game: games.toClient(updated) });
    } catch (error) {
      console.error('Error revealing spectrum game:', error);
      res.status(500).json({ error: 'Failed to reveal' });
    }
  });

  // Aggregated dots + stories (also embedded in the snapshot at reveal).
  router.get('/games/:code/results', async (req, res) => {
    try {
      const game = await loadGame(req, res);
      if (!game) return;
      if (game.phase !== 'reveal') {
        return res.status(400).json({ error: 'Not revealed yet' });
      }
      res.json({ results: await games.computeResults(game) });
    } catch (error) {
      console.error('Error computing results:', error);
      res.status(500).json({ error: 'Failed to compute results' });
    }
  });

  // Host: fresh game, same people, same player ids (tokens keep working).
  router.post('/games/:code/rematch', async (req, res) => {
    try {
      const game = await loadGame(req, res);
      if (!game) return;
      if (!requireHost(req, res, game)) return;
      const next = await games.rematch(game);
      res.status(201).json({ game: games.toClient(next) });
    } catch (error) {
      console.error('Error creating rematch:', error);
      res.status(500).json({ error: 'Failed to start rematch' });
    }
  });

  return router;
};
