const express = require('express');
const games = require('../utils/oasGames');
const stats = require('../utils/oasStats');
const entryUtils = require('../utils/entries');
const OasGame = require('../models/OasGame');
const OasNomination = require('../models/OasNomination');
const User = require('../models/User');
const requireEmailVerified = require('../middleware/requireEmailVerified');

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

  // ── Aggregate reads (scoped to the resolved deployment instance) ──────

  // The requesting player's own games: active rooms to jump back into,
  // completed history with their per-game slice, and the spectrums they've
  // coined (anonymous cross-game usage counts). Identity comes from the
  // verified bearer token — never from a bare header — so this stays
  // strictly self-only.
  router.get('/me/games', async (req, res) => {
    try {
      if (!req.authedUserId) {
        return res.status(401).json({ error: 'Sign in to see your games' });
      }
      res.json(await stats.userGames(req.instanceId, req.authedUserId));
    } catch (error) {
      fail(res, error);
    }
  });

  // The public pulse: which conversations (game threads) and spectrums are
  // moving across the whole deployment. Carries no user ids or names.
  router.get('/pulse', async (req, res) => {
    try {
      res.json(await stats.pulse(req.instanceId));
    } catch (error) {
      fail(res, error);
    }
  });

  // Create a game — creator is host and first participant, and gets the
  // room's starting tokens on the spot.
  //
  // Confirmed address required, and ONLY here: the host names the room, runs
  // its phases, and is the person the room belongs to. Joining one is
  // deliberately left open — On a Spectrum is played by people in a room
  // together passing a code around, and a confirmation email sitting unopened
  // must not be what stops somebody joining the game in front of them.
  router.post('/games', requireEmailVerified, async (req, res) => {
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

  // One frame spec from a request body: {frameId} borrows a lens already in
  // this game, {poleA, poleB} coins a new one.
  function frameSpec(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.frameId) return { frameId: String(raw.frameId) };
    const poleA = String(raw.poleA || '').trim();
    const poleB = String(raw.poleB || '').trim();
    return poleA && poleB ? { poleA, poleB } : null;
  }

  const FRAME_ERRORS = [
    'Propose one spectrum or two',
    'A spectrum needs both poles',
    'The poles must differ',
    'The two spectrums must differ',
    'Spectrum not found',
    'That spectrum is already mapping this subtopic — bring a different one',
    'That spectrum is already on the slate',
    'The spectrums are locked once the map confirms',
    'That nomination is not in the current round',
    'Only the nominator can change the spectrums',
    'This map already has its spectrum(s)',
    'Join the map first',
  ];

  // Nominate: round 1 takes {title}; rounds 2–4 take {subtopicId, frames:
  // [1–2 frame specs]} — the lens rides the proposal. Costs 1 token (the
  // nominator's stake).
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
        const parentSubtopicId = req.body.parentSubtopicId
          ? String(req.body.parentSubtopicId) : null;
        nom = await games.nominateSubtopic({
          game, userId: player.id, username: player.name, title, parentSubtopicId,
        });
      } else {
        // Round 2 seeds a subject from the subtopic tree; rounds 3–4 carry a
        // previous-round item forward via sourceEntryId. Frames ride either.
        const subtopicId = req.body.subtopicId ? String(req.body.subtopicId) : null;
        const sourceEntryId = req.body.sourceEntryId ? String(req.body.sourceEntryId) : null;
        const frames = Array.isArray(req.body.frames)
          ? req.body.frames.map(frameSpec) : null;
        if ((!subtopicId && !sourceEntryId) || !frames || frames.some(f => !f)) {
          return res.status(400).json({ error: 'A subject and 1–2 frames are required' });
        }
        nom = await games.nominateMap({
          game, userId: player.id, username: player.name,
          subtopicId, sourceEntryId, frames,
        });
      }
      res.status(201).json({ nomination: games.toClientNomination(nom) });
    } catch (error) {
      fail(res, error, [
        'Not in a nominating round',
        'Only subtopics can be nominated in round 1',
        'Subtopic nominations closed after round 1',
        'That subtopic is already nominated',
        'Only confirmed subtopics can branch',
        'Subtopic not found',
        'Source item not found',
        'Can only carry items from the previous round',
        'That map has not revealed yet',
        'Already staked',
        ...FRAME_ERRORS,
      ]);
    }
  });

  // Nominator only: fill an open slot in their own slate (the initial pick,
  // or a replacement after the DELETE below).
  router.post('/games/:code/nominations/:id/frames', async (req, res) => {
    try {
      const game = await loadGame(req, res);
      if (!game) return;
      const player = requireParticipant(req, res, game);
      if (!player) return;
      const nomination = await OasNomination.findOne({ id: req.params.id, gameId: game.id });
      if (!nomination) return res.status(404).json({ error: 'Nomination not found' });
      const frame = frameSpec(req.body);
      if (!frame) return res.status(400).json({ error: 'A spectrum needs both poles' });
      await games.proposeSlateFrame({
        game, nomination, userId: player.id, username: player.name, frame,
      });
      res.status(201).json({ nomination: games.toClientNomination(nomination) });
    } catch (error) {
      fail(res, error, ['Nomination not found', ...FRAME_ERRORS]);
    }
  });

  // Nominator only: pull one of their own spectrums pre-confirmation, so
  // they can swap it for a different one via the POST above.
  router.delete('/games/:code/nominations/:id/frames/:frameId', async (req, res) => {
    try {
      const game = await loadGame(req, res);
      if (!game) return;
      const player = requireParticipant(req, res, game);
      if (!player) return;
      const nomination = await OasNomination.findOne({ id: req.params.id, gameId: game.id });
      if (!nomination) return res.status(404).json({ error: 'Nomination not found' });
      await games.removeSlateFrame({
        game, nomination, userId: player.id, frameId: req.params.frameId,
      });
      res.json({ nomination: games.toClientNomination(nomination) });
    } catch (error) {
      fail(res, error, ['Nomination not found', ...FRAME_ERRORS]);
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
        'No stake to withdraw',
      ]);
    }
  });

  // ── Live map surface — each confirmed map nomination runs an
  //    On-the-Spectrum-style activity: gather (items, against the frames
  //    locked at confirmation) → rank → done/closed. mapId = the
  //    nomination id.

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
  ];

  // Everything a map sheet needs: nomination (frames included) + items
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
      // A map item is a comment: a short label (the rankable handle) plus an
      // optional comment body. `text` accepted as a fallback for the label.
      const label = String(req.body.label || req.body.text || '').trim().slice(0, 80);
      const comment = String(req.body.comment || '').trim().slice(0, 500);
      if (!label) return res.status(400).json({ error: 'Item label is required' });
      const entry = await games.submitMapItem({
        game, nom, userId: player.id, username: player.name, label, comment,
      });
      res.status(201).json({ entry: entryUtils.toClient(entry) });
    } catch (error) {
      if (error.message.startsWith('You can add')) {
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
