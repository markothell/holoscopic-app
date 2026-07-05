const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const SpectrumGame = require('../models/SpectrumGame');
const Entry = require('../models/Entry');
const entryUtils = require('./entries');

// The single funnel for On the Spectrum game-state transitions, mirroring
// the utils/entries.js philosophy: routes and timers are thin wrappers over
// these functions. Content (nominations, rankings, stories) is written via
// utils/entries.js with the game duck-typed as the activity.
//
// Entry addressing scheme:
//   nominations — questionId 'nom',    slotNumber = per-player 1..maxNominations
//   rankings    — questionId 'rank-x'|'rank-y', userId = rater,
//                 slotNumber = subject's roster subjectIndex,
//                 position.x = spectrum score (1 = most, 0 = least),
//                 text = optional story about that subject on that axis

let io = null;
function setIO(ioInstance) { io = ioInstance; }

function emitToGame(gameId, event, payload) {
  if (io) io.to(`game:${gameId}`).emit(event, payload);
}

const SECRET = process.env.GAME_TOKEN_SECRET || process.env.NEXTAUTH_SECRET || null;

// Guest identity: the join/create routes mint a JWT whose sub is the
// player id; middleware/verifyUser.js then enforces it on every mutation
// exactly as it does for account holders.
function signPlayerToken(playerId, gameId) {
  if (!SECRET) return null; // dev without secret: enforceVerifiedUser allows bare ids
  return jwt.sign({ sub: playerId, game: gameId }, SECRET, { expiresIn: '24h' });
}

// Room codes: unambiguous alphabet (no I/O/0/1), 5 chars.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomCode() {
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

async function generateUniqueCode() {
  for (let i = 0; i < 10; i++) {
    const code = randomCode();
    const clash = await SpectrumGame.findOne({ code });
    if (!clash) return code;
  }
  throw new Error('Could not generate a unique room code');
}

const NOM_QUESTION = 'nom';
const AXIS_QUESTION = { x: 'rank-x', y: 'rank-y' };

function toClient(game) {
  return {
    id: game.id,
    code: game.code,
    phase: game.phase,
    phaseDeadline: game.phaseDeadline,
    serverNow: new Date(),
    hostId: game.hostId,
    participants: game.participants.map(p => ({
      id: p.id, name: p.name, joinedAt: p.joinedAt, isHost: p.isHost,
    })),
    roster: game.roster.map(m => ({ id: m.id, name: m.name, subjectIndex: m.subjectIndex })),
    winningAxes: game.winningAxes.map(a => ({ entryId: a.entryId, label: a.label })),
    rankingDone: game.rankingDone.map(d => ({ playerId: d.playerId, axis: d.axis })),
    config: {
      nominateSeconds: game.config.nominateSeconds,
      votesPerUser: game.config.votesPerUser,
      maxNominationsPerPlayer: game.config.maxNominationsPerPlayer,
      maxPlayers: game.config.maxPlayers,
    },
    createdAt: game.createdAt,
  };
}

function newPlayerId() {
  return crypto.randomUUID().substring(0, 8);
}

// Display-name collisions get a numeric suffix so dots and stories stay
// unambiguous ("Sam", "Sam 2").
function dedupeName(game, name) {
  const taken = new Set(game.participants.map(p => p.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let n = 2; n < 100; n++) {
    const candidate = `${name.slice(0, 17)} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  throw new Error('Name unavailable');
}

async function createGame({ instanceId, hostName, config = {} }) {
  const code = await generateUniqueCode();
  const hostId = newPlayerId();
  const game = new SpectrumGame({
    instanceId,
    code,
    hostId,
    participants: [{ id: hostId, name: hostName, isHost: true }],
    config: { ...config },
  });
  if (config.votesPerUser !== undefined) game.votesPerUser = config.votesPerUser;
  await game.save();
  return {
    game,
    player: { id: hostId, name: hostName, isHost: true },
    token: signPlayerToken(hostId, game.id),
  };
}

async function joinGame({ game, name }) {
  if (game.phase !== 'lobby' && game.phase !== 'nominate') {
    return { spectator: true };
  }
  if (game.participants.length >= game.config.maxPlayers) {
    throw new Error('Game is full');
  }
  const playerId = newPlayerId();
  const finalName = dedupeName(game, name);
  const participant = { id: playerId, name: finalName, isHost: false, joinedAt: new Date() };
  game.participants.push(participant);
  await game.save();
  emitToGame(game.id, 'player_joined', { participant });
  return {
    player: participant,
    token: signPlayerToken(playerId, game.id),
  };
}

// ---------------------------------------------------------------------------
// Phase machine

// In-memory nominate-phase timers. Lost on restart; sweepDeadline() on read
// is the durable fallback (same lazy pattern as activityWindowHours).
const timers = new Map(); // gameId -> Timeout

function armNominateTimer(game) {
  clearTimer(game.id);
  const ms = new Date(game.phaseDeadline).getTime() - Date.now();
  if (ms <= 0) return;
  const t = setTimeout(async () => {
    timers.delete(game.id);
    try {
      const fresh = await SpectrumGame.findOne({ id: game.id });
      if (fresh) await expireNominate(fresh);
    } catch (err) {
      console.error(`[spectrum] nominate timer for ${game.id} failed:`, err.message);
    }
  }, ms + 250); // small grace so client countdowns visibly reach zero
  if (t.unref) t.unref();
  timers.set(game.id, t);
}

function clearTimer(gameId) {
  const t = timers.get(gameId);
  if (t) clearTimeout(t);
  timers.delete(gameId);
}

async function startGame(game) {
  if (game.phase !== 'lobby') throw new Error('Game already started');
  if (game.participants.length < 2) throw new Error('Need at least 2 players');
  game.phase = 'nominate';
  game.phaseDeadline = new Date(Date.now() + game.config.nominateSeconds * 1000);
  await game.save();
  armNominateTimer(game);
  emitToGame(game.id, 'phase_changed', phasePayload(game));
  return game;
}

function phasePayload(game, extra = {}) {
  return {
    phase: game.phase,
    phaseDeadline: game.phaseDeadline,
    serverNow: new Date(),
    winningAxes: game.winningAxes.map(a => ({ entryId: a.entryId, label: a.label })),
    roster: game.roster.map(m => ({ id: m.id, name: m.name, subjectIndex: m.subjectIndex })),
    ...extra,
  };
}

async function listNominations(game) {
  return Entry.find({ activityId: game.id, questionId: NOM_QUESTION }).sort({ createdAt: 1 });
}

// Countdown expiry (timer, sweep-on-read, or host force-advance). Resolves
// the top two nominations into the game's axes and freezes the roster.
// Fewer than two ideas extends the clock instead of stalling the room.
async function expireNominate(game, { forced = false } = {}) {
  if (game.phase !== 'nominate') return game;
  if (!forced && game.phaseDeadline && new Date(game.phaseDeadline).getTime() > Date.now()) {
    return game;
  }

  const nominations = await listNominations(game);
  if (nominations.length < 2) {
    game.phaseDeadline = new Date(Date.now() + 60 * 1000);
    await game.save();
    armNominateTimer(game);
    emitToGame(game.id, 'phase_changed', phasePayload(game, { reason: 'need_ideas' }));
    return game;
  }

  const ranked = [...nominations].sort((a, b) =>
    (b.voteCount || 0) - (a.voteCount || 0) || a.createdAt - b.createdAt
  );
  game.winningAxes = [
    { entryId: ranked[0].id, label: ranked[0].text },
    { entryId: ranked[1].id, label: ranked[1].text },
  ];
  game.roster = game.participants.map((p, i) => ({
    id: p.id, name: p.name, subjectIndex: i + 1,
  }));
  game.phase = 'rank';
  game.phaseDeadline = null;
  await game.save();
  clearTimer(game.id);
  emitToGame(game.id, 'phase_changed', phasePayload(game));
  return game;
}

// Durable fallback for the in-memory timer — call before serving any read.
async function sweepDeadline(game) {
  if (game.phase === 'nominate' && game.phaseDeadline &&
      new Date(game.phaseDeadline).getTime() <= Date.now()) {
    return expireNominate(game);
  }
  return game;
}

// ---------------------------------------------------------------------------
// Rankings

// order: array of roster player ids, index 0 = MOST <label>. Each subject's
// spectrum score is 1 - rank/(N-1)-normalized, so "most" plots at 1.0.
async function submitRanking({ game, playerId, playerName, axis, order }) {
  if (game.phase !== 'rank') throw new Error('Not in ranking phase');
  if (!AXIS_QUESTION[axis]) throw new Error('Unknown axis');

  const rosterIds = game.roster.map(m => m.id).sort();
  const orderIds = [...order].sort();
  if (rosterIds.length !== orderIds.length ||
      rosterIds.some((id, i) => id !== orderIds[i])) {
    throw new Error('Order must include every player exactly once');
  }

  const byId = new Map(game.roster.map(m => [m.id, m]));
  const n = order.length;
  const entries = [];
  for (let r = 0; r < n; r++) {
    const subject = byId.get(order[r]);
    const score = n === 1 ? 0.5 : 1 - r / (n - 1);
    const entry = await entryUtils.upsertEntry({
      activity: game,
      instanceId: game.instanceId,
      userId: playerId,
      username: playerName,
      slotNumber: subject.subjectIndex,
      questionId: AXIS_QUESTION[axis],
      position: { x: score, y: 0.5 },
      objectName: subject.name.slice(0, 25),
    });
    entries.push(entry);
  }
  return entries;
}

async function submitStory({ game, playerId, playerName, axis, subjectIndex, text }) {
  if (!AXIS_QUESTION[axis]) throw new Error('Unknown axis');
  const subject = game.roster.find(m => m.subjectIndex === subjectIndex);
  if (!subject) throw new Error('Unknown subject');
  return entryUtils.upsertEntry({
    activity: game,
    instanceId: game.instanceId,
    userId: playerId,
    username: playerName,
    slotNumber: subjectIndex,
    questionId: AXIS_QUESTION[axis],
    objectName: subject.name.slice(0, 25),
    text,
  });
}

async function markRankingDone(game, playerId, axis) {
  if (!game.rankingDone.some(d => d.playerId === playerId && d.axis === axis)) {
    game.rankingDone.push({ playerId, axis });
    await game.save();
  }
  const done = new Set(game.rankingDone.map(d => `${d.playerId}:${d.axis}`));
  const allDone = game.roster.every(m => done.has(`${m.id}:x`) && done.has(`${m.id}:y`));
  emitToGame(game.id, 'ranking_progress', {
    playerId, axis, done: true, allDone,
    rankingDone: game.rankingDone.map(d => ({ playerId: d.playerId, axis: d.axis })),
  });
  if (allDone) await reveal(game);
  return game;
}

async function reveal(game) {
  if (game.phase !== 'rank') return game;
  game.phase = 'reveal';
  await game.save();
  const results = await computeResults(game);
  emitToGame(game.id, 'phase_changed', phasePayload(game, { results }));
  return game;
}

// ---------------------------------------------------------------------------
// Reveal aggregation

// Per subject per axis: mean spectrum score over every rater who submitted
// that axis. Raters who never finished simply contribute nothing, so a host
// force-reveal works with partial data. Stories are attributed — this is a
// party game among friends; attribution is the payoff.
async function computeResults(game) {
  const rankEntries = await Entry.find({
    activityId: game.id,
    questionId: { $in: [AXIS_QUESTION.x, AXIS_QUESTION.y] },
  });

  const results = game.roster.map(member => {
    const forSubject = rankEntries.filter(e => e.slotNumber === member.subjectIndex);
    const axisMean = (qid) => {
      const scores = forSubject
        .filter(e => e.questionId === qid && e.position)
        .map(e => e.position.x);
      if (!scores.length) return 0.5;
      return scores.reduce((a, b) => a + b, 0) / scores.length;
    };
    const stories = forSubject
      .filter(e => e.text && e.text.trim())
      .map(e => ({
        axis: e.questionId === AXIS_QUESTION.x ? 'x' : 'y',
        raterId: e.userId,
        raterName: e.username,
        text: e.text,
        createdAt: e.createdAt,
      }))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    return {
      playerId: member.id,
      name: member.name,
      x: axisMean(AXIS_QUESTION.x),
      y: axisMean(AXIS_QUESTION.y),
      stories,
    };
  });
  return results;
}

// Rematch: fresh game, same room of people, same player ids — existing
// guest tokens (sub = playerId) keep working, so nobody re-joins.
async function rematch(game) {
  const code = await generateUniqueCode();
  const next = new SpectrumGame({
    instanceId: game.instanceId,
    code,
    hostId: game.hostId,
    participants: game.participants.map(p => ({
      id: p.id, name: p.name, isHost: p.isHost, joinedAt: new Date(),
    })),
    config: game.config,
    votesPerUser: game.votesPerUser,
  });
  await next.save();
  emitToGame(game.id, 'rematch', { code });
  return next;
}

module.exports = {
  setIO,
  emitToGame,
  toClient,
  createGame,
  joinGame,
  startGame,
  expireNominate,
  sweepDeadline,
  listNominations,
  submitRanking,
  submitStory,
  markRankingDone,
  reveal,
  computeResults,
  rematch,
  signPlayerToken,
  NOM_QUESTION,
  AXIS_QUESTION,
};
