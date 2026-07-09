const crypto = require('crypto');
const OasGame = require('../models/OasGame');
const OasNomination = require('../models/OasNomination');
const Instance = require('../models/Instance');
const InstanceMembership = require('../models/InstanceMembership');
const Activity = require('../models/Activity');
const Entry = require('../models/Entry');
const { transact, spend } = require('./holons');

// The single funnel for On a Spectrum game-state transitions, mirroring the
// utils/entries.js philosophy: routes and timers are thin wrappers over
// these functions.
//
// Economy: each game room owns a dedicated Instance whose
// config.holons.startingStake is the game's token grant, so
// InstanceMembership.getOrCreate seeds every player on first touch and all
// token movement goes through utils/holons.js against the room instance.
// Tokens lock on stake (oas_stake) and return (oas_stake_return) on map
// completion, no-quorum expiry, or the round-end sweep — never destroyed.
//
// Map content is NOT written here: confirmed map nominations spawn real
// Activity documents and players use the generic /api/activities entry/vote
// surface (utils/entries.js) with the room's x-instance-id. This funnel
// never touches Activity.stakes[], so activity stake settlement can never
// redistribute game tokens.

let io = null;
function setIO(ioInstance) { io = ioInstance; }

function emitToGame(gameId, event, payload) {
  if (io) io.to(`oasgame:${gameId}`).emit(event, payload);
}

const STAKE_TYPE = 'oas_stake';
const RETURN_TYPE = 'oas_stake_return';

const TIMED_PHASES = ['round1', 'round2', 'round3', 'round4', 'revise'];
const PHASE_ORDER = ['lobby', 'round1', 'round2', 'round3', 'round4', 'revise', 'complete'];

function nextPhase(phase) {
  const i = PHASE_ORDER.indexOf(phase);
  return i >= 0 && i < PHASE_ORDER.length - 1 ? PHASE_ORDER[i + 1] : null;
}

// Which round nominates in a phase (round2 nominates maps for themes[0], etc.)
function roundNumber(phase) {
  return /^round[1-4]$/.test(phase) ? Number(phase.slice(5)) : null;
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
    const clash = await OasGame.findOne({ code });
    if (!clash) return code;
  }
  throw new Error('Could not generate a unique room code');
}

function newId() {
  return crypto.randomUUID().substring(0, 8);
}

// ---------------------------------------------------------------------------
// Serializers

function toClientNomination(nom) {
  return {
    id: nom.id,
    kind: nom.kind,
    round: nom.round,
    themeIndex: nom.themeIndex,
    title: nom.title,
    subtopicId: nom.subtopicId,
    axes: nom.axes ? {
      x: { min: nom.axes.x.min, max: nom.axes.x.max },
      y: { min: nom.axes.y.min, max: nom.axes.y.max },
    } : null,
    nominatedBy: nom.nominatedBy,
    nominatedByName: nom.nominatedByName,
    stakes: nom.stakes.map(s => ({ userId: s.userId, returned: s.returned })),
    quorumThreshold: nom.quorumThreshold,
    status: nom.status,
    activityId: nom.activityId,
    createdAt: nom.createdAt,
  };
}

function toClient(game) {
  return {
    id: game.id,
    instanceId: game.instanceId,
    code: game.code,
    phase: game.phase,
    phaseDeadline: game.phaseDeadline,
    serverNow: new Date(),
    hostId: game.hostId,
    topic: game.topic,
    themes: [...game.themes],
    participants: game.participants.map(p => ({
      id: p.id, name: p.name, joinedAt: p.joinedAt, isHost: p.isHost,
    })),
    config: {
      roundSeconds: {
        round1: game.config.roundSeconds.round1,
        round2: game.config.roundSeconds.round2,
        round3: game.config.roundSeconds.round3,
        round4: game.config.roundSeconds.round4,
        revise: game.config.roundSeconds.revise,
      },
      startingTokens: game.config.startingTokens,
      quorum: game.config.quorum,
      votesPerUser: game.config.votesPerUser,
      maxPlayers: game.config.maxPlayers,
    },
    maps: game.maps.map(m => ({
      activityId: m.activityId,
      nominationId: m.nominationId,
      subtopicId: m.subtopicId,
      round: m.round,
      themeIndex: m.themeIndex,
    })),
    proposals: game.proposals.map(p => ({
      id: p.id,
      proposedBy: p.proposedBy,
      proposedByName: p.proposedByName,
      topic: p.topic,
      themes: [...p.themes],
      childGameId: p.childGameId,
      createdAt: p.createdAt,
    })),
    parentGameId: game.parentGameId,
    createdAt: game.createdAt,
  };
}

function phasePayload(game, extra = {}) {
  return {
    phase: game.phase,
    phaseDeadline: game.phaseDeadline,
    serverNow: new Date(),
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Game creation / membership

// Every room gets its own Instance: per-room token ledger (startingStake =
// startingTokens grants on first membership touch), per-room entry scoping,
// and an activityWindowHours long enough that the interView activity sweep
// can never settle an OAS map out from under the round machine.
async function createRoomInstance({ parentInstanceId, topic, code, startingTokens }) {
  return Instance.create({
    id: newId(),
    name: topic.slice(0, 80),
    slug: `oas-${code.toLowerCase()}`,
    domains: [],
    access: { mode: 'public', inviteCodes: [] },
    parentInstanceId,
    gameNumber: null,
    config: {
      holons: { startingStake: startingTokens, dailyBonus: 0 },
      quorum: { activityWindowHours: 8760 },
    },
  });
}

async function createGame({ parentInstanceId, userId, username, topic, themes, config = {}, parentGameId = null }) {
  const code = await generateUniqueCode();
  const startingTokens = config.startingTokens || 4;
  const roomInstance = await createRoomInstance({
    parentInstanceId, topic, code, startingTokens,
  });

  const game = new OasGame({
    instanceId: roomInstance.id,
    code,
    hostId: userId,
    topic,
    participants: [{ id: userId, name: username, isHost: true }],
    parentGameId,
  });
  if (Array.isArray(themes) && themes.length === 3) game.themes = themes;
  if (config.roundSeconds) {
    for (const key of Object.keys(game.config.roundSeconds.toObject ? game.config.roundSeconds.toObject() : game.config.roundSeconds)) {
      if (config.roundSeconds[key] !== undefined) {
        game.config.roundSeconds[key] = config.roundSeconds[key];
      }
    }
  }
  game.config.startingTokens = startingTokens;
  if (config.quorum !== undefined) game.config.quorum = config.quorum;
  if (config.votesPerUser !== undefined) game.config.votesPerUser = config.votesPerUser;
  if (config.maxPlayers !== undefined) game.config.maxPlayers = config.maxPlayers;
  await game.save();

  // First touch grants the host their tokens (join_bonus of startingStake).
  await InstanceMembership.getOrCreate(userId, roomInstance.id);

  return game;
}

async function joinGame({ game, userId, username }) {
  if (game.phase === 'complete') throw new Error('Game is over');
  const existing = game.participants.find(p => p.id === userId);
  if (existing) {
    // Rejoin: refresh the display name, no new grant (getOrCreate is a no-op).
    existing.name = username;
    await game.save();
    return existing;
  }
  if (game.participants.length >= game.config.maxPlayers) {
    throw new Error('Game is full');
  }
  const participant = { id: userId, name: username, isHost: false, joinedAt: new Date() };
  game.participants.push(participant);
  await game.save();
  await InstanceMembership.getOrCreate(userId, game.instanceId);
  emitToGame(game.id, 'oas_player_joined', { participant });
  return participant;
}

async function balanceFor(userId, instanceId) {
  const m = await InstanceMembership.findOne({ userId, instanceId });
  return m ? m.holonBalance : 0;
}

// ---------------------------------------------------------------------------
// Phase machine

// In-memory phase timers. Lost on restart; sweepGame() on read is the
// durable fallback (same lazy pattern as activityWindowHours / spectrum).
const timers = new Map(); // gameId -> Timeout

function armPhaseTimer(game) {
  clearTimer(game.id);
  if (!game.phaseDeadline) return;
  const ms = new Date(game.phaseDeadline).getTime() - Date.now();
  if (ms <= 0) return;
  const t = setTimeout(async () => {
    timers.delete(game.id);
    try {
      const fresh = await OasGame.findOne({ id: game.id });
      if (fresh) await expirePhase(fresh);
    } catch (err) {
      console.error(`[oas] phase timer for ${game.id} failed:`, err.message);
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
  await enterPhase(game, 'round1');
  return game;
}

async function enterPhase(game, phase) {
  game.phase = phase;
  game.phaseDeadline = TIMED_PHASES.includes(phase)
    ? new Date(Date.now() + game.config.roundSeconds[phase] * 1000)
    : null;
  await game.save();
  if (game.phaseDeadline) armPhaseTimer(game);
  else clearTimer(game.id);
  emitToGame(game.id, 'oas_phase_changed', phasePayload(game));
}

// Deadline expiry (timer, sweep-on-read, or host force-advance): close out
// the current phase's economy, then enter the next phase.
async function expirePhase(game, { forced = false } = {}) {
  if (!TIMED_PHASES.includes(game.phase)) return game;
  if (!forced && game.phaseDeadline && new Date(game.phaseDeadline).getTime() > Date.now()) {
    return game;
  }
  const closing = game.phase;
  const round = roundNumber(closing);
  if (round) await closeRound(game, round);
  await enterPhase(game, nextPhase(closing));
  return game;
}

// End-of-round economy sweep. Guarantees no token stays locked past the
// round it was staked in:
//   - un-confirmed nominations expire and refund every stake
//   - round 1 also refunds confirmed-subtopic stakes (their job is done;
//     players need liquidity for the mapping rounds)
//   - rounds 2–4 close the round's live maps and refund whatever map stakes
//     were never claimed through completion
async function closeRound(game, round) {
  const noms = await OasNomination.find({ gameId: game.id, round });

  for (const nom of noms) {
    if (nom.status === 'nominated') {
      nom.status = 'expired';
      await refundStakes(game, nom);
      await nom.save();
      emitToGame(game.id, 'oas_nomination_upserted', { nomination: toClientNomination(nom) });
    } else if (nom.status === 'confirmed') {
      if (nom.kind === 'subtopic') {
        await refundStakes(game, nom);
        await nom.save();
      } else if (nom.kind === 'map' && nom.activityId) {
        const activity = await Activity.findOne({ id: nom.activityId });
        if (activity && activity.status !== 'completed') {
          await activity.complete();
          emitToGame(game.id, 'oas_map_closed', { activityId: activity.id });
        }
        await refundStakes(game, nom);
        await nom.save();
      }
    }
  }
}

async function refundStakes(game, nom) {
  for (const stake of nom.stakes) {
    if (stake.returned) continue;
    stake.returned = true;
    stake.returnedAt = new Date();
    await transact({
      userId: stake.userId,
      instanceId: game.instanceId,
      type: RETURN_TYPE,
      amount: stake.amount,
      refType: 'oas_nomination',
      refId: nom.id,
    });
    emitToGame(game.id, 'oas_stake_returned', { userId: stake.userId, nominationId: nom.id });
  }
}

// Durable fallback for the in-memory timer — call before serving any read.
async function sweepGame(game) {
  if (TIMED_PHASES.includes(game.phase) && game.phaseDeadline &&
      new Date(game.phaseDeadline).getTime() <= Date.now()) {
    return expirePhase(game);
  }
  return game;
}

// ---------------------------------------------------------------------------
// Nominations & stakes

async function listNominations(game) {
  return OasNomination.find({ gameId: game.id }).sort({ createdAt: 1 });
}

function requirePhaseRound(game, expectedKind) {
  const round = roundNumber(game.phase);
  if (!round) throw new Error('Not in a nominating round');
  const kind = round === 1 ? 'subtopic' : 'map';
  if (kind !== expectedKind) {
    throw new Error(round === 1
      ? 'Only subtopics can be nominated in round 1'
      : 'Subtopic nominations closed after round 1');
  }
  return round;
}

async function nominateSubtopic({ game, userId, username, title }) {
  const round = requirePhaseRound(game, 'subtopic');
  const clash = await OasNomination.findOne({
    gameId: game.id, kind: 'subtopic',
    title: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
  });
  if (clash) throw new Error('That subtopic is already nominated');

  const nom = new OasNomination({
    instanceId: game.instanceId,
    gameId: game.id,
    kind: 'subtopic',
    round,
    title,
    nominatedBy: userId,
    nominatedByName: username,
    quorumThreshold: game.config.quorum,
    stakes: [],
  });
  await addStake(game, nom, userId);
  emitToGame(game.id, 'oas_nomination_upserted', { nomination: toClientNomination(nom) });
  return nom;
}

async function nominateMap({ game, userId, username, subtopicId, axes }) {
  const round = requirePhaseRound(game, 'map');
  const subtopic = await OasNomination.findOne({
    id: subtopicId, gameId: game.id, kind: 'subtopic', status: 'confirmed',
  });
  if (!subtopic) throw new Error('Subtopic not found');
  const clash = await OasNomination.findOne({
    gameId: game.id, kind: 'map', round, subtopicId,
    status: { $in: ['nominated', 'confirmed'] },
  });
  if (clash) throw new Error('That subtopic is already nominated this round');

  const nom = new OasNomination({
    instanceId: game.instanceId,
    gameId: game.id,
    kind: 'map',
    round,
    themeIndex: round - 2,
    title: subtopic.title,
    subtopicId,
    axes,
    nominatedBy: userId,
    nominatedByName: username,
    quorumThreshold: game.config.quorum,
    stakes: [],
  });
  await addStake(game, nom, userId);
  emitToGame(game.id, 'oas_nomination_upserted', { nomination: toClientNomination(nom) });
  return nom;
}

// Lock one token behind a nomination; confirm the moment quorum is reached.
// spend() throws 'Insufficient Holons' — the supply throttle (HTTP 402).
async function addStake(game, nom, userId) {
  if (nom.stakes.some(s => s.userId === userId && !s.returned)) {
    throw new Error('Already staked');
  }
  await spend({
    userId,
    instanceId: game.instanceId,
    type: STAKE_TYPE,
    amount: 1,
    refType: 'oas_nomination',
    refId: nom.id,
  });
  nom.stakes.push({ userId, amount: 1 });
  if (nom.status === 'nominated' &&
      nom.stakes.filter(s => !s.returned).length >= nom.quorumThreshold) {
    nom.status = 'confirmed';
    await nom.save();
    if (nom.kind === 'map') await spawnMapActivity(game, nom);
  } else {
    await nom.save();
  }
  return nom;
}

async function stakeOn({ game, nomination, userId }) {
  const round = roundNumber(game.phase);
  if (nomination.round !== round) throw new Error('That nomination is not in the current round');
  if (nomination.status === 'expired') throw new Error('Nomination expired');
  // Post-quorum stakes on maps are joins — route through joinMap so the
  // player also becomes an activity participant.
  if (nomination.status === 'confirmed' && nomination.kind === 'map') {
    throw new Error('Map already live — join it instead');
  }
  if (nomination.status === 'confirmed') throw new Error('Already confirmed');
  await addStake(game, nomination, userId);
  emitToGame(game.id, 'oas_nomination_staked', { nomination: toClientNomination(nomination) });
  return nomination;
}

// Withdraw a pre-quorum support stake. Nominators stay locked in — a
// nomination never outlives its own proposer's commitment silently.
async function unstake({ game, nomination, userId }) {
  if (nomination.status !== 'nominated') throw new Error('Stakes are locked once confirmed');
  if (nomination.nominatedBy === userId) throw new Error('Nominators cannot withdraw');
  const idx = nomination.stakes.findIndex(s => s.userId === userId && !s.returned);
  if (idx === -1) throw new Error('No stake to withdraw');
  nomination.stakes.splice(idx, 1);
  await nomination.save();
  await transact({
    userId,
    instanceId: game.instanceId,
    type: RETURN_TYPE,
    amount: 1,
    refType: 'oas_nomination',
    refId: nomination.id,
  });
  emitToGame(game.id, 'oas_nomination_staked', { nomination: toClientNomination(nomination) });
  return nomination;
}

// ---------------------------------------------------------------------------
// Live maps

// Quorum → a real Activity document. Content then flows through the generic
// /api/activities surface scoped to the room instance. Axis labels double as
// the pole labels; the label field is a compact "min – max" readout.
async function spawnMapActivity(game, nom) {
  const theme = game.themes[nom.themeIndex] || `Round ${nom.round}`;
  const activity = await Activity.create({
    id: newId(),
    instanceId: game.instanceId,
    title: `${theme}: ${nom.title}`.slice(0, 100),
    urlName: `oas-${game.code.toLowerCase()}-${nom.id}`,
    author: { userId: nom.nominatedBy, name: nom.nominatedByName },
    mapQuestion: `Map ${nom.title} — ${theme.toLowerCase()}`.slice(0, 200),
    commentQuestion: `Share your perspective on ${nom.title}`.slice(0, 200),
    objectNameQuestion: 'Name your perspective',
    xAxis: { label: `${nom.axes.x.min} – ${nom.axes.x.max}`.slice(0, 50), min: nom.axes.x.min, max: nom.axes.x.max },
    yAxis: { label: `${nom.axes.y.min} – ${nom.axes.y.max}`.slice(0, 50), min: nom.axes.y.min, max: nom.axes.y.max },
    votesPerUser: game.config.votesPerUser,
    maxEntries: 1,
    activityType: 'dissolve',
    isDraft: false,
    isPublic: true,
    topicId: nom.subtopicId,
    externallyManaged: true, // the OAS round machine closes it, never the generic rules
  });
  for (const stake of nom.stakes) {
    const player = game.participants.find(p => p.id === stake.userId);
    if (player) await activity.addParticipant(player.id, player.name.slice(0, 20));
  }
  nom.activityId = activity.id;
  await nom.save();
  game.maps.push({
    activityId: activity.id,
    nominationId: nom.id,
    subtopicId: nom.subtopicId,
    round: nom.round,
    themeIndex: nom.themeIndex,
  });
  await game.save();
  emitToGame(game.id, 'oas_map_opened', {
    map: game.maps[game.maps.length - 1],
    nomination: toClientNomination(nom),
  });
  return activity;
}

// Late join on a live map: same 1-token lock as a support stake, plus
// activity membership so the generic surface accepts entries.
async function joinMap({ game, activityId, userId, username }) {
  const nom = await OasNomination.findOne({ gameId: game.id, activityId });
  if (!nom || nom.status !== 'confirmed') throw new Error('Map not found');
  if (nom.round !== roundNumber(game.phase)) throw new Error('That map\'s round is over');
  if (nom.stakes.some(s => s.userId === userId && !s.returned)) {
    return nom; // already in — idempotent
  }
  await spend({
    userId,
    instanceId: game.instanceId,
    type: STAKE_TYPE,
    amount: 1,
    refType: 'oas_nomination',
    refId: nom.id,
  });
  nom.stakes.push({ userId, amount: 1 });
  await nom.save();
  const activity = await Activity.findOne({ id: activityId });
  if (activity) await activity.addParticipant(userId, username.slice(0, 20));
  emitToGame(game.id, 'oas_nomination_staked', { nomination: toClientNomination(nom) });
  return nom;
}

// A player has "completed" a map when their slot has a position and a
// comment, and they've spent their votes (or voted every other entry when
// fewer exist). Computed from Entries, never client-asserted.
async function mapCompletion({ game, activityId, userId }) {
  const entries = await Entry.find({ activityId });
  const mine = entries.find(e => e.userId === userId && e.slotNumber === 1 && !e.questionId);
  const hasPosition = !!(mine && mine.position);
  const hasComment = !!(mine && mine.text && mine.text.trim());
  const votable = entries.filter(e => e.userId !== userId && !e.isSeed).length;
  const votesRequired = Math.min(game.config.votesPerUser, votable);
  const votesCast = entries.filter(e => (e.voterIds || []).includes(userId)).length;
  return {
    hasPosition,
    hasComment,
    votesCast,
    votesRequired,
    complete: hasPosition && hasComment && votesCast >= votesRequired,
  };
}

// Completion claim: verify against Entries, then return the caller's stake.
// Idempotent via stake.returned.
async function claimMapStake({ game, activityId, userId }) {
  const nom = await OasNomination.findOne({ gameId: game.id, activityId });
  if (!nom) throw new Error('Map not found');
  const stake = nom.stakes.find(s => s.userId === userId);
  if (!stake) throw new Error('No stake on this map');
  if (stake.returned) return { nomination: nom, alreadyReturned: true };

  const completion = await mapCompletion({ game, activityId, userId });
  if (!completion.complete) {
    const err = new Error('Map not complete');
    err.completion = completion;
    throw err;
  }
  stake.returned = true;
  stake.returnedAt = new Date();
  await nom.save();
  await transact({
    userId,
    instanceId: game.instanceId,
    type: RETURN_TYPE,
    amount: stake.amount,
    refType: 'oas_nomination',
    refId: nom.id,
  });
  emitToGame(game.id, 'oas_stake_returned', { userId, nominationId: nom.id });
  return { nomination: nom, completion };
}

// ---------------------------------------------------------------------------
// Revise & proposals

async function submitProposal({ game, userId, username, topic, themes }) {
  if (game.phase !== 'revise' && game.phase !== 'complete') {
    throw new Error('Revisions open after the last round');
  }
  const proposal = {
    id: newId(),
    proposedBy: userId,
    proposedByName: username,
    topic,
    themes,
    childGameId: null,
    createdAt: new Date(),
  };
  game.proposals.push(proposal);
  await game.save();
  emitToGame(game.id, 'oas_proposal_added', { proposal: game.proposals[game.proposals.length - 1] });
  return proposal;
}

// Joining a proposal lazily creates its lobby (host = proposer, so the
// variation stays theirs to start), then joins the caller into it.
async function joinProposal({ game, proposalId, userId, username }) {
  const proposal = game.proposals.find(p => p.id === proposalId);
  if (!proposal) throw new Error('Proposal not found');

  let child = proposal.childGameId
    ? await OasGame.findOne({ id: proposal.childGameId })
    : null;

  if (!child) {
    const roomInstance = await Instance.findOne({ id: game.instanceId });
    const proposer = game.participants.find(p => p.id === proposal.proposedBy);
    child = await createGame({
      parentInstanceId: roomInstance ? roomInstance.parentInstanceId : null,
      userId: proposal.proposedBy,
      username: proposer ? proposer.name : proposal.proposedByName,
      topic: proposal.topic,
      themes: [...proposal.themes],
      config: {
        roundSeconds: game.config.roundSeconds.toObject
          ? game.config.roundSeconds.toObject()
          : { ...game.config.roundSeconds },
        startingTokens: game.config.startingTokens,
        quorum: game.config.quorum,
        votesPerUser: game.config.votesPerUser,
        maxPlayers: game.config.maxPlayers,
      },
      parentGameId: game.id,
    });
    proposal.childGameId = child.id;
    await game.save();
    emitToGame(game.id, 'oas_proposal_added', {
      proposal: game.proposals.find(p => p.id === proposalId),
    });
  }

  if (userId !== child.hostId) {
    await joinGame({ game: child, userId, username });
  }
  return child;
}

module.exports = {
  setIO,
  emitToGame,
  toClient,
  toClientNomination,
  createGame,
  joinGame,
  balanceFor,
  startGame,
  expirePhase,
  sweepGame,
  listNominations,
  nominateSubtopic,
  nominateMap,
  stakeOn,
  unstake,
  joinMap,
  mapCompletion,
  claimMapStake,
  submitProposal,
  joinProposal,
  STAKE_TYPE,
  RETURN_TYPE,
};
