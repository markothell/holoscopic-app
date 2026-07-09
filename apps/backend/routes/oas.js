const express = require('express');
const games = require('../utils/oasGames');
const entryUtils = require('../utils/entries');
const OasGame = require('../models/OasGame');
const OasNomination = require('../models/OasNomination');
const User = require('../models/User');

// On a Spectrum — REST surface. Thin wrappers over utils/oasGames.js (phase
// machine + token economy + per-map activity machine). Mounted behind
// resolveInstance + attachVerifiedUser + enforceVerifiedUser: every
// identity-bearing mutation must carry a verified account token whose sub
// matches x-user-id.
//
// All broadcasts go to room `oasgame:<gameId>`.
module.exports = function (io) {
  const router = express.Router();

  async function loadGame(req, res) {
    const code = String(req.params.code || '').toUpperCase();
    const game = await OasGame.findOne({ code });
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return null;
    }
    return game;
  }

  // Authenticated account holder making this request (name resolved from the
  // User doc so display names can't be spoofed per-request).
  async function userFrom(req, res) {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      res.status(401).json({ error: 'Sign in to play' });
      return null;
    }
    const user = await User.findOne({ id: userId });
    if (!user) {
      res.status(401).json({ error: 'Sign in to play' });
      return null;
    }
    return { id: user.id, name: (user.name || user.email.split('@')[0]).slice(0, 40) };
  }

  function participantFrom(req, game) {
    const userId = req.headers['x-user-id'];
    if (!userId) return null;
    return game.participants.find(p => p.id === userId) || null;
  }

  function requireHost(req, res, game) {
    const player = participantFrom(req, game);
    if (!player || player.id !== game.hostId) {
      res.status(403).json({ error: 'Only the host can do that' });
      return null;
    }
    return player;
  }

  function requireParticipant(req, res, game) {
    const player = participantFrom(req, game);
    if (!player) {
      res.status(403).json({ error: 'Join the game first' });
      return null;
    }
    return player;
  }

  function fail(res, error, known = []) {
    if (error.message === 'Insufficient Holons') {
      return res.status(402).json({ error: 'Out of tokens' });
    }
    if (known.includes(error.message)) {
      return res.status(400).json({ error: error.message });
    }
    console.error('[oas]', error);
    res.status(500).json({ error: 'Something went wrong' });
  }

  function validThemes(raw) {
    if (raw === undefined) return undefined;
    if (!Array.isArray(raw) || raw.length !== 3) return null;
    const themes = raw.map(t => String(t || '').trim().slice(0, 40));
    return themes.every(Boolean) ? themes : null;
  }

  // Create a game — creator is host and first participant, and gets the
  // room's starting tokens on the spot.
  router.post('/games', async (req, res) => {
    try {
      const user = await userFrom(req, res);
      if (!user) return;
      const topic = String(req.body.topic || '').trim().slice(0, 80);
      if (!topic) return res.status(400).json({ error: 'Topic is required' });
      const themes = validThemes(req.body.themes);
      if (themes === null) {
        return res.status(400).json({ error: 'Themes must be three non-empty labels' });
      }
      const game = await games.createGame({
        parentInstanceId: req.instanceId,
        userId: user.id,
        username: user.name,
        topic,
        themes,
        config: req.body.config || {},
      });
      res.status(201).json({
        game: games.toClient(game),
        balance: await games.balanceFor(user.id, game.instanceId),
      });
    } catch (error) {
      fail(res, error);
    }
  });

  // Full snapshot — the client's source of truth on load/focus/reconnect.
  // Runs the deadline sweep so an expired round resolves even if the
  // in-memory timer died with a restart.
  router.get('/games/:code', async (req, res) => {
    try {
      let game = await loadGame(req, res);
      if (!game) return;
      game = await games.sweepGame(game);
      const nominations = await games.listNominations(game);
      const userId = req.headers['x-user-id'] || null;
      const payload = {
        game: games.toClient(game),
        nominations: nominations.map(games.toClientNomination),
        serverNow: new Date(),
      };
      if (userId && game.participants.some(p => p.id === userId)) {
        payload.balance = await games.balanceFor(userId, game.instanceId);
        // Per-map completion/claim state for the requesting player.
        payload.myMaps = [];
        for (const nom of nominations) {
          if (nom.kind !== 'map' || !nom.mapState) continue;
          const stake = nom.stakes.find(s => s.userId === userId);
          if (!stake) continue;
          payload.myMaps.push({
            nominationId: nom.id,
            stakeReturned: stake.returned,
            completion: await games.mapCompletion({ game, nom, userId }),
          });
        }
      }
      res.json(payload);
    } catch (error) {
      fail(res, error);
    }
  });

  // Join — any phase before complete; late joiners still get their tokens.
  router.post('/games/:code/join', async (req, res) => {
    try {
      const game = await loadGame(req, res);
      if (!game) return;
      const user = await userFrom(req, res);
      if (!user) return;
      await games.joinGame({ game, userId: user.id, username: user.name });
      res.status(201).json({
        game: games.toClient(game),
        balance: await games.balanceFor(user.id, game.instanceId),
      });
    } catch (error) {
      if (['Game is full', 'Game is over'].includes(error.message)) {
        return res.status(409).json({ error: error.message });
      }
      fail(res, error);
    }
  });

  // Host: lobby → round1 (arms the round clock).
  router.post('/games/:code/start', async (req, res) => {
    try {
      const game = await loadGame(req, res);
      if (!game) return;
      if (!requireHost(req, res, game)) return;
      await games.startGame(game);
      res.json({ game: games.toClient(game) });
    } catch (error) {
      fail(res, error, ['Game already started']);
    }
  });

  // Host: end the current round early.
  router.post('/games/:code/advance', async (req, res) => {
    try {
      const game = await loadGame(req, res);
      if (!game) return;
      if (!requireHost(req, res, game)) return;
      const updated = await games.expirePhase(game, { forced: true });
      res.json({ game: games.toClient(updated) });
    } catch (error) {
      fail(res, error);
    }
  });

  // Nominate: round 1 takes {title}; rounds 2–4 take {subtopicId,
  // dimensions: 1|2}. Costs 1 token (the nominator's stake).
  router.post('/games/:code/nominations', async (req, res) => {
    try {
      const game = await loadGame(req, res);
      if (!game) return;
      const player = requireParticipant(req, res, game);
      if (!player) return;

      let nom;
      if (game.phase === 'round1') {
        const title = String(req.body.title || '').trim().slice(0, 80);
        if (!title) return res.status(400).json({ error: 'Subtopic is required' });
        nom = await games.nominateSubtopic({
          game, userId: player.id, username: player.name, title,
        });
      } else {
        const { subtopicId } = req.body;
        const dimensions = Number(req.body.dimensions);
        if (!subtopicId || (dimensions !== 1 && dimensions !== 2)) {
          return res.status(400).json({ error: 'Subtopic and dimensions (1 or 2) are required' });
        }
        nom = await games.nominateMap({
          game, userId: player.id, username: player.name,
          subtopicId, dimensions,
        });
      }
      res.status(201).json({ nomination: games.toClientNomination(nom) });
    } catch (error) {
      fail(res, error, [
        'Not in a nominating round',
        'Only subtopics can be nominated in round 1',
        'Subtopic nominations closed after round 1',
        'That subtopic is already nominated',
        'That subtopic is already nominated this round',
        'Subtopic not found',
        'dimensions must be 1 or 2',
        'Already staked',
      ]);
    }
  });

  // Support a nomination with 1 token; may trigger quorum → map spawn.
  router.post('/games/:code/nominations/:id/stake', async (req, res) => {
    try {
      const game = await loadGame(req, res);
      if (!game) return;
      const player = requireParticipant(req, res, game);
      if (!player) return;
      const nomination = await OasNomination.findOne({ id: req.params.id, gameId: game.id });
      if (!nomination) return res.status(404).json({ error: 'Nomination not found' });
      await games.stakeOn({ game, nomination, userId: player.id });
      res.json({ nomination: games.toClientNomination(nomination) });
    } catch (error) {
      fail(res, error, [
        'That nomination is not in the current round',
        'Nomination expired',
        'Map already live — join it instead',
        'Already confirmed',
        'Already staked',
      ]);
    }
  });

  // Withdraw a pre-quorum support stake (refunds the token).
  router.post('/games/:code/nominations/:id/unstake', async (req, res) => {
    try {
      const game = await loadGame(req, res);
      if (!game) return;
      const player = requireParticipant(req, res, game);
      if (!player) return;
      const nomination = await OasNomination.findOne({ id: req.params.id, gameId: game.id });
      if (!nomination) return res.status(404).json({ error: 'Nomination not found' });
      await games.unstake({ game, nomination, userId: player.id });
      res.json({ nomination: games.toClientNomination(nomination) });
    } catch (error) {
      fail(res, error, [
        'Stakes are locked once confirmed',
        'Nominators cannot withdraw',
        'No stake to withdraw',
      ]);
    }
  });

  // ── Live map surface — each confirmed map nomination runs an
  //    On-the-Spectrum-style activity: gather (items + spectrum ideas +
  //    votes) → rank → done/closed. mapId = the nomination id.

  async function loadMap(req, res, game) {
    const nom = await OasNomination.findOne({
      id: req.params.mapId, gameId: game.id, kind: 'map',
    });
    if (!nom || !nom.mapState) {
      res.status(404).json({ error: 'Map not found' });
      return null;
    }
    return nom;
  }

  const MAP_ERRORS = [
    'Map not found', "That map's round is over", 'Join the map first',
    'Gathering is over', 'Not in the ranking stage', 'Unknown axis',
    'Order must include every item exactly once', 'Entry not found',
    'Cannot vote on your own entry',
  ];

  // Everything a map sheet needs: nomination + items + spectrum ideas
  // (+ my rankings mid-rank, + results once done/closed).
  router.get('/games/:code/maps/:mapId', async (req, res) => {
    try {
      const game = await loadGame(req, res);
      if (!game) return;
      const nom = await loadMap(req, res, game);
      if (!nom) return;
      const userId = req.headers['x-user-id'] || null;
      res.json(await games.mapDetail(game, nom, userId));
    } catch (error) {
      fail(res, error);
    }
  });

  // Late-join a live map (1 token).
  router.post('/games/:code/maps/:mapId/join', async (req, res) => {
    try {
      const game = await loadGame(req, res);
      if (!game) return;
      const player = requireParticipant(req, res, game);
      if (!player) return;
      const nom = await loadMap(req, res, game);
      if (!nom) return;
      await games.joinMap({ game, nomination: nom, userId: player.id });
      res.json({ nomination: games.toClientNomination(nom) });
    } catch (error) {
      fail(res, error, MAP_ERRORS);
    }
  });

  // Gather stage: add an item to be ranked.
  router.post('/games/:code/maps/:mapId/items', async (req, res) => {
    try {
      const game = await loadGame(req, res);
      if (!game) return;
      const player = requireParticipant(req, res, game);
      if (!player) return;
      const nom = await loadMap(req, res, game);
      if (!nom) return;
      const text = String(req.body.text || '').trim().slice(0, 80);
      if (!text) return res.status(400).json({ error: 'Item text is required' });
      const entry = await games.submitMapItem({
        game, nom, userId: player.id, username: player.name, text,
      });
      res.status(201).json({ entry: entryUtils.toClient(entry) });
    } catch (error) {
      if (error.message.startsWith('You can add')) {
        return res.status(400).json({ error: error.message });
      }
      fail(res, error, MAP_ERRORS);
    }
  });

  // Gather stage: suggest a spectrum to rank along.
  router.post('/games/:code/maps/:mapId/axes', async (req, res) => {
    try {
      const game = await loadGame(req, res);
      if (!game) return;
      const player = requireParticipant(req, res, game);
      if (!player) return;
      const nom = await loadMap(req, res, game);
      if (!nom) return;
      const label = String(req.body.label || '').trim().slice(0, 60);
      if (!label) return res.status(400).json({ error: 'Spectrum label is required' });
      const entry = await games.nominateMapAxis({
        game, nom, userId: player.id, username: player.name, label,
      });
      res.status(201).json({ entry: entryUtils.toClient(entry) });
    } catch (error) {
      if (error.message.startsWith('You can suggest')) {
        return res.status(400).json({ error: error.message });
      }
      fail(res, error, MAP_ERRORS);
    }
  });

  // Gather stage: toggle a vote on a spectrum idea (budget = votesPerUser).
  router.post('/games/:code/maps/:mapId/axes/:entryId/vote', async (req, res) => {
    try {
      const game = await loadGame(req, res);
      if (!game) return;
      const player = requireParticipant(req, res, game);
      if (!player) return;
      const nom = await loadMap(req, res, game);
      if (!nom) return;
      const entry = await games.voteMapAxis({
        game, nom, entryId: req.params.entryId, userId: player.id,
      });
      res.json({ entry: entryUtils.toClient(entry) });
    } catch (error) {
      if (error.message.startsWith('Vote limit')) {
        return res.status(400).json({ error: error.message });
      }
      fail(res, error, MAP_ERRORS);
    }
  });

  // Nominator (or game host): end gathering early and start ranking.
  router.post('/games/:code/maps/:mapId/advance', async (req, res) => {
    try {
      const game = await loadGame(req, res);
      if (!game) return;
      const player = requireParticipant(req, res, game);
      if (!player) return;
      const nom = await loadMap(req, res, game);
      if (!nom) return;
      if (player.id !== nom.nominatedBy && player.id !== game.hostId) {
        return res.status(403).json({ error: 'Only the map nominator or host can do that' });
      }
      const updated = await games.closeGather(game, nom, { forced: true });
      res.json({ nomination: games.toClientNomination(updated) });
    } catch (error) {
      fail(res, error, MAP_ERRORS);
    }
  });

  // Rank stage: submit a full ordering for one axis; done:true marks that
  // axis complete for this player.
  router.put('/games/:code/maps/:mapId/rankings/:axis', async (req, res) => {
    try {
      const game = await loadGame(req, res);
      if (!game) return;
      const player = requireParticipant(req, res, game);
      if (!player) return;
      const nom = await loadMap(req, res, game);
      if (!nom) return;
      const order = req.body.order;
      if (!Array.isArray(order)) {
        return res.status(400).json({ error: 'order must be an array of item entry ids' });
      }
      await games.submitMapRanking({
        game, nom, userId: player.id, username: player.name,
        axis: req.params.axis, order,
      });
      if (req.body.done) {
        await games.markMapRankingDone(game, nom, player.id, req.params.axis);
      }
      res.json({ nomination: games.toClientNomination(nom) });
    } catch (error) {
      fail(res, error, MAP_ERRORS);
    }
  });

  // Claim the stake back after completing a map (server-verified).
  router.post('/games/:code/maps/:mapId/claim', async (req, res) => {
    try {
      const game = await loadGame(req, res);
      if (!game) return;
      const player = requireParticipant(req, res, game);
      if (!player) return;
      const nom = await loadMap(req, res, game);
      if (!nom) return;
      const result = await games.claimMapStake({ game, nom, userId: player.id });
      res.json({
        nomination: games.toClientNomination(result.nomination),
        balance: await games.balanceFor(player.id, game.instanceId),
      });
    } catch (error) {
      if (error.message === 'Map not complete') {
        return res.status(400).json({ error: error.message, completion: error.completion });
      }
      fail(res, error, ['Map not found', 'No stake on this map']);
    }
  });

  // Revise phase: submit an alternate game structure.
  router.post('/games/:code/proposals', async (req, res) => {
    try {
      const game = await loadGame(req, res);
      if (!game) return;
      const player = requireParticipant(req, res, game);
      if (!player) return;
      const topic = String(req.body.topic || '').trim().slice(0, 80);
      const themes = validThemes(req.body.themes);
      if (!topic || !themes) {
        return res.status(400).json({ error: 'Topic and three themes are required' });
      }
      const proposal = await games.submitProposal({
        game, userId: player.id, username: player.name, topic, themes,
      });
      res.status(201).json({ proposal });
    } catch (error) {
      fail(res, error, ['Revisions open after the last round']);
    }
  });

  // Final screen: join a proposed variation — lazily creates its lobby
  // (host = proposer) and returns the child room code to navigate to.
  router.post('/games/:code/proposals/:id/join', async (req, res) => {
    try {
      const game = await loadGame(req, res);
      if (!game) return;
      const user = await userFrom(req, res);
      if (!user) return;
      const child = await games.joinProposal({
        game, proposalId: req.params.id, userId: user.id, username: user.name,
      });
      res.json({ code: child.code, game: games.toClient(child) });
    } catch (error) {
      if (error.message === 'Game is full') {
        return res.status(409).json({ error: error.message });
      }
      fail(res, error, ['Proposal not found']);
    }
  });

  return router;
};
