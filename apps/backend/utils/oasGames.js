const crypto = require('crypto');
const OasGame = require('../models/OasGame');
const OasNomination = require('../models/OasNomination');
const OasFrame = require('../models/OasFrame');
const Instance = require('../models/Instance');
const InstanceMembership = require('../models/InstanceMembership');
const Entry = require('../models/Entry');
const entryUtils = require('./entries');
const { transact, spend } = require('./holons');

// The single funnel for On a Spectrum game-state transitions, mirroring the
// utils/entries.js philosophy: routes and timers are thin wrappers over
// these functions.
//
// Economy: each game room owns a dedicated Instance whose
// config.holons.startingStake is the game's token grant, so
// InstanceMembership.getOrCreate seeds every player on first touch and all
// token movement goes through utils/holons.js against the room instance.
// Tokens lock on stake (oas_stake) and always return (oas_stake_return) —
// on map completion, no-quorum expiry, or the round-end sweep. Never burned.
//
// Frames (the spectrums maps rank along) are first-class: an OasFrame doc
// per distinct pole pair in the game, proposed and contested on each map
// nomination's frameSlate while it gathers quorum, resolved into
// mapState.winningAxes at confirmation. The lens is locked before gather
// opens, so the gather stage is items-only.
//
// A confirmed map nomination runs an On-the-Spectrum-style activity with
// the nomination duck-typed as the entries.js "activity". Entry addressing:
//   items      — questionId 'item', slotNumber = per-player 1..MAX_ITEMS
//   rankings   — questionId 'rank-x'|'rank-y', userId = rater,
//                slotNumber = the item's frozen mapState index,
//                position.x = spectrum score (1 = most poleA, 0 = least)

let io = null;
function setIO(ioInstance) { io = ioInstance; }

function emitToGame(gameId, event, payload) {
  if (io) io.to(`oasgame:${gameId}`).emit(event, payload);
}

const STAKE_TYPE = 'oas_stake';
const RETURN_TYPE = 'oas_stake_return';

const ITEM_QUESTION = 'item';
const RANK_QUESTION = { x: 'rank-x', y: 'rank-y' };
const MAX_ITEMS_PER_PLAYER = 3;
const POLE_MAX = 40;

const TIMED_PHASES = ['round1', 'round2', 'round3', 'round4', 'revise'];
const PHASE_ORDER = ['lobby', 'round1', 'round2', 'round3', 'round4', 'revise', 'complete'];

function nextPhase(phase) {
  const i = PHASE_ORDER.indexOf(phase);
  return i >= 0 && i < PHASE_ORDER.length - 1 ? PHASE_ORDER[i + 1] : null;
}

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

// What entries.js needs an "activity" to be, for a map nomination.
function duckActivity(game, nom) {
  return {
    id: nom.id,
    topicId: nom.subtopicId,
    votesPerUser: game.config.votesPerUser,
    // maxEntries deliberately absent (undefined !== 0, so solo-tracker mode
    // never triggers).
  };
}

// ---------------------------------------------------------------------------
// Serializers

function toClientFrameSlate(nom) {
  return (nom.frameSlate || []).map(f => ({
    frameId: f.frameId,
    poleA: f.poleA,
    poleB: f.poleB,
    proposedBy: f.proposedBy,
    proposedByName: f.proposedByName,
    voterIds: [...f.voterIds],
  }));
}

function toClientWinningAxes(mapState) {
  return mapState.winningAxes.map(a => ({
    frameId: a.frameId, poleA: a.poleA, poleB: a.poleB,
  }));
}

function toClientNomination(nom) {
  return {
    id: nom.id,
    kind: nom.kind,
    round: nom.round,
    themeIndex: nom.themeIndex,
    title: nom.title,
    parentSubtopicId: nom.kind === 'subtopic' ? nom.parentSubtopicId : null,
    subtopicId: nom.subtopicId,
    sourceEntryId: nom.sourceEntryId || null,
    sourceMapId: nom.sourceMapId || null,
    dimensions: nom.kind === 'map' ? nom.dimensions : null,
    frameSlate: nom.kind === 'map' ? toClientFrameSlate(nom) : null,
    mapState: nom.mapState ? {
      stage: nom.mapState.stage,
      stageDeadline: nom.mapState.stageDeadline,
      winningAxes: toClientWinningAxes(nom.mapState),
      items: nom.mapState.items.map(m => ({
        entryId: m.entryId, index: m.index, label: m.label,
        comment: m.comment || '', authorId: m.authorId,
      })),
      rankingDone: nom.mapState.rankingDone.map(d => ({ userId: d.userId, axis: d.axis })),
    } : null,
    nominatedBy: nom.nominatedBy,
    nominatedByName: nom.nominatedByName,
    stakes: nom.stakes.map(s => ({ userId: s.userId, returned: s.returned })),
    quorumThreshold: nom.quorumThreshold,
    status: nom.status,
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
      roundMode: game.config.roundMode,
      startingTokens: game.config.startingTokens,
      quorum: game.config.quorum,
      votesPerUser: game.config.votesPerUser,
      maxPlayers: game.config.maxPlayers,
    },
    maps: game.maps.map(m => ({
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

function mapStagePayload(nom, extra = {}) {
  return {
    mapId: nom.id,
    stage: nom.mapState.stage,
    stageDeadline: nom.mapState.stageDeadline,
    serverNow: new Date(),
    winningAxes: toClientWinningAxes(nom.mapState),
    items: nom.mapState.items.map(m => ({
      entryId: m.entryId, index: m.index, label: m.label,
      comment: m.comment || '', authorId: m.authorId,
    })),
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Game creation / membership

// Every room gets its own Instance: per-room token ledger (startingStake =
// startingTokens grants on first membership touch) and per-room entry
// scoping in the shared collections.
async function createRoomInstance({ parentInstanceId, topic, code, startingTokens }) {
  return Instance.create({
    id: newId(),
    name: topic.slice(0, 80),
    slug: `oas-${code.toLowerCase()}`,
    domains: [],
    access: { mode: 'public', inviteCodes: [] },
    parentInstanceId,
    gameNumber: null,
    // Rooms never resolve activityWindowHours (no Activity documents; OaS
    // is fully duck-typed), so only the token grant is worth mirroring here.
    config: {
      holons: { startingStake: startingTokens, dailyBonus: 0 },
    },
  });
}

// Platform-configured defaults (Instance.config.oas on the `spectrum`
// parent) for whichever of startingTokens/quorum/votesPerUser/maxPlayers
// the room-creation request doesn't explicitly set.
async function oasDefaults(parentInstanceId) {
  if (!parentInstanceId) return {};
  const parent = await Instance.findOne({ id: parentInstanceId });
  return parent?.config?.oas || {};
}

async function createGame({ parentInstanceId, userId, username, topic, themes, config = {}, parentGameId = null }) {
  const code = await generateUniqueCode();
  const defaults = await oasDefaults(parentInstanceId);
  const startingTokens = config.startingTokens ?? defaults.startingTokens ?? 4;
  const roomInstance = await createRoomInstance({
    parentInstanceId, topic, code, startingTokens,
  });

  // Thread lineage: a child joins its parent's thread; a fresh game roots
  // its own (rootGameId = its own id, set below once the id exists).
  let rootGameId = null;
  if (parentGameId) {
    const parent = await OasGame.findOne({ id: parentGameId });
    rootGameId = parent ? (parent.rootGameId || parent.id) : null;
  }

  const game = new OasGame({
    instanceId: roomInstance.id,
    parentInstanceId: parentInstanceId || null,
    code,
    hostId: userId,
    topic,
    participants: [{ id: userId, name: username, isHost: true }],
    parentGameId,
  });
  game.rootGameId = rootGameId || game.id;
  if (Array.isArray(themes) && themes.length === 3) game.themes = themes;
  if (config.roundSeconds) {
    for (const key of TIMED_PHASES) {
      if (config.roundSeconds[key] !== undefined) {
        game.config.roundSeconds[key] = config.roundSeconds[key];
      }
    }
  }
  game.config.startingTokens = startingTokens;
  game.config.quorum = config.quorum ?? defaults.quorum ?? game.config.quorum;
  game.config.votesPerUser = config.votesPerUser ?? defaults.votesPerUser ?? game.config.votesPerUser;
  game.config.maxPlayers = config.maxPlayers ?? defaults.maxPlayers ?? game.config.maxPlayers;
  if (config.roundMode === 'manual' || config.roundMode === 'timed') {
    game.config.roundMode = config.roundMode;
  }
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

// In-memory timers for round deadlines and map gather stages. Lost on
// restart; sweepGame() on read is the durable fallback (same lazy pattern
// as activityWindowHours / the old spectrum game).
const timers = new Map(); // key: gameId | `map:<nominationId>` -> Timeout

function armTimer(key, deadline, fn) {
  clearTimer(key);
  if (!deadline) return;
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return;
  const t = setTimeout(async () => {
    timers.delete(key);
    try {
      await fn();
    } catch (err) {
      console.error(`[oas] timer ${key} failed:`, err.message);
    }
  }, ms + 250); // small grace so client countdowns visibly reach zero
  if (t.unref) t.unref();
  timers.set(key, t);
}

function clearTimer(key) {
  const t = timers.get(key);
  if (t) clearTimeout(t);
  timers.delete(key);
}

function armPhaseTimer(game) {
  armTimer(game.id, game.phaseDeadline, async () => {
    const fresh = await OasGame.findOne({ id: game.id });
    if (fresh) await expirePhase(fresh);
  });
}

async function startGame(game) {
  if (game.phase !== 'lobby') throw new Error('Game already started');
  await enterPhase(game, 'round1');
  return game;
}

async function enterPhase(game, phase) {
  game.phase = phase;
  game.phaseDeadline = TIMED_PHASES.includes(phase) && game.config.roundMode !== 'manual'
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
//   - confirmed subtopics were already refunded at confirmation; the refund
//     here is an idempotent safety net (returned stakes are skipped)
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
      } else if (nom.kind === 'map' && nom.mapState) {
        if (nom.mapState.stage !== 'closed') {
          nom.mapState.stage = 'closed';
          nom.mapState.stageDeadline = null;
          clearTimer(`map:${nom.id}`);
        }
        await refundStakes(game, nom);
        await nom.save();
        emitToGame(game.id, 'oas_map_stage', mapStagePayload(nom));
      }
    }
  }
}

// Atomically flip one of a user's unreturned stakes to returned, straight in
// the DB. Returns true only for the caller that actually made the flip — so
// even when two triggers refund the same nomination concurrently (the phase
// timer racing a sweep-on-read), the token is credited exactly once. The
// in-memory `stake.returned` guard alone can't see a concurrent loader's
// write, which is what minted extra tokens at round close.
async function claimStakeReturn(nomId, userId) {
  const res = await OasNomination.updateOne(
    { id: nomId, stakes: { $elemMatch: { userId, returned: false } } },
    { $set: { 'stakes.$.returned': true, 'stakes.$.returnedAt': new Date() } },
  );
  return res.modifiedCount === 1;
}

async function refundStakes(game, nom) {
  for (const stake of nom.stakes) {
    if (stake.returned) continue;
    // Only credit if THIS call won the atomic flip; a racing refund of the
    // same stake loses and skips, so no double-return.
    const won = await claimStakeReturn(nom.id, stake.userId);
    stake.returned = true;
    stake.returnedAt = new Date();
    if (!won) continue;
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

// Durable fallback for the in-memory timers — call before serving any read.
async function sweepGame(game) {
  if (TIMED_PHASES.includes(game.phase) && game.phaseDeadline &&
      new Date(game.phaseDeadline).getTime() <= Date.now()) {
    return expirePhase(game);
  }
  // Map gather stages inside the current round.
  const round = roundNumber(game.phase);
  if (round) {
    const gathering = await OasNomination.find({
      gameId: game.id, round, kind: 'map', status: 'confirmed',
      'mapState.stage': 'gather',
      'mapState.stageDeadline': { $lte: new Date() },
    });
    for (const nom of gathering) {
      await closeGather(game, nom);
    }
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

async function nominateSubtopic({ game, userId, username, title, parentSubtopicId = null }) {
  const round = requirePhaseRound(game, 'subtopic');

  // A branch must hang off a CONFIRMED subtopic in this game; null = a
  // top-level facet of the game topic. Depth is unlimited.
  if (parentSubtopicId) {
    const parent = await OasNomination.findOne({
      id: parentSubtopicId, gameId: game.id, kind: 'subtopic', status: 'confirmed',
    });
    if (!parent) throw new Error('Only confirmed subtopics can branch');
  }

  // Titles are unique among siblings, so the same label can recur on
  // different branches of the web.
  const clash = await OasNomination.findOne({
    gameId: game.id, kind: 'subtopic',
    parentSubtopicId: parentSubtopicId || null,
    title: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
  });
  if (clash) throw new Error('That subtopic is already nominated');

  const nom = new OasNomination({
    instanceId: game.instanceId,
    gameId: game.id,
    kind: 'subtopic',
    round,
    title,
    parentSubtopicId: parentSubtopicId || null,
    nominatedBy: userId,
    nominatedByName: username,
    quorumThreshold: game.config.quorum,
    stakes: [],
  });
  await addStake(game, nom, userId);
  emitToGame(game.id, 'oas_nomination_upserted', { nomination: toClientNomination(nom) });
  return nom;
}

// ---------------------------------------------------------------------------
// Frames — the spectrums maps rank along. Each distinct pole pair in a game
// is one OasFrame doc (the room's reusable lens vocabulary); each map
// nomination contests a frameSlate of them while it gathers quorum.

function normPole(raw) {
  return String(raw || '').trim().slice(0, POLE_MAX);
}

function samePoles(a, b, c, d) {
  return a.toLowerCase() === c.toLowerCase() && b.toLowerCase() === d.toLowerCase();
}

// Orientation-free cross-game identity: the same rule the in-game dedupe
// applies, frozen into a queryable key.
function frameKey(poleA, poleB) {
  return JSON.stringify([poleA, poleB].map(p => p.toLowerCase().trim()).sort());
}

// Resolve one frame spec — {frameId} borrows an existing lens, {poleA,
// poleB} coins one. Coining dedupes against the game's frames in either
// orientation, so "calm—heated" can't sneak in beside "heated—calm" as a
// nominally different lens.
async function resolveFrameSpec(game, spec, userId, username) {
  if (spec && spec.frameId) {
    const frame = await OasFrame.findOne({ id: spec.frameId, gameId: game.id });
    if (!frame) throw new Error('Spectrum not found');
    return frame;
  }
  const poleA = normPole(spec && spec.poleA);
  const poleB = normPole(spec && spec.poleB);
  if (!poleA || !poleB) throw new Error('A spectrum needs both poles');
  if (poleA.toLowerCase() === poleB.toLowerCase()) {
    throw new Error('The poles must differ');
  }
  const existing = (await OasFrame.find({ gameId: game.id })).find(f =>
    samePoles(f.poleA, f.poleB, poleA, poleB) || samePoles(f.poleA, f.poleB, poleB, poleA));
  if (existing) return existing;
  return OasFrame.create({
    instanceId: game.instanceId,
    gameId: game.id,
    parentInstanceId: game.parentInstanceId || null,
    poleA,
    poleB,
    key: frameKey(poleA, poleB),
    createdBy: userId,
    createdByName: username,
  });
}

// A map's identity is subtopic × frame: the same subtopic can carry several
// maps in a round as long as each looks through a different lens. This
// collects the frameIds already claimed on a subtopic this round so rivals
// must genuinely differ. A still-contested nomination claims its whole
// slate (any of them might win); a confirmed map claims only the axes it
// actually locked — a frame that lost the vote is fair game for a rival.
async function frameIdsOnSubtopic(game, subtopicId, round, excludeNomId = null) {
  const rivals = await OasNomination.find({
    gameId: game.id, kind: 'map', round, subtopicId,
    status: { $in: ['nominated', 'confirmed'] },
  });
  const used = new Set();
  for (const rival of rivals) {
    if (excludeNomId && rival.id === excludeNomId) continue;
    const claimed = rival.status === 'confirmed' && rival.mapState
      ? rival.mapState.winningAxes
      : rival.frameSlate || [];
    for (const f of claimed) used.add(f.frameId);
  }
  return used;
}

// The slate is just the nominator's chosen frames, in the order they
// currently sit — first is the x axis, second (if any) is y.
function resolveSlate(nom) {
  return nom.frameSlate.map(f => ({
    frameId: f.frameId, poleA: f.poleA, poleB: f.poleB,
  }));
}

// A map can only confirm once its slate is complete — guards the window
// where the nominator has removed a frame and not yet replaced it.
function mapReadyToConfirm(nom) {
  return nom.kind !== 'map' || nom.frameSlate.length === nom.dimensions;
}

// Frames already claimed on a carried entry this round — the (sourceEntry ×
// frame) analog of frameIdsOnSubtopic, so the same item can be re-mapped under
// several lenses but never the same lens twice.
async function frameIdsOnSource(game, sourceEntryId, round, excludeNomId = null) {
  const rivals = await OasNomination.find({
    gameId: game.id, kind: 'map', round, sourceEntryId,
    status: { $in: ['nominated', 'confirmed'] },
  });
  const used = new Set();
  for (const rival of rivals) {
    if (excludeNomId && rival.id === excludeNomId) continue;
    const claimed = rival.status === 'confirmed' && rival.mapState
      ? rival.mapState.winningAxes
      : rival.frameSlate || [];
    for (const f of claimed) used.add(f.frameId);
  }
  return used;
}

// Resolve the map's subject. Round 2 seeds from the round-1 subtopic tree;
// rounds 3–4 carry forward a revealed previous-round map item (sourceEntryId),
// inheriting that map's subtopic so the new map still hangs in the right
// branch. Returns { title, subtopicId, sourceEntryId, sourceMapId } plus the
// set of frameIds already claimed on this subject this round.
async function resolveMapSubject({ game, round, subtopicId, sourceEntryId }) {
  if (sourceEntryId) {
    const entry = await Entry.findOne({ id: sourceEntryId, questionId: ITEM_QUESTION });
    if (!entry) throw new Error('Source item not found');
    const sourceMap = await OasNomination.findOne({
      id: entry.activityId, gameId: game.id, kind: 'map',
    });
    if (!sourceMap || sourceMap.round !== round - 1) {
      throw new Error('Can only carry items from the previous round');
    }
    const stage = sourceMap.mapState && sourceMap.mapState.stage;
    if (stage !== 'done' && stage !== 'closed') {
      throw new Error('That map has not revealed yet');
    }
    return {
      title: (entry.objectName || entry.text || 'item').slice(0, 80),
      subtopicId: sourceMap.subtopicId,
      sourceEntryId,
      sourceMapId: sourceMap.id,
      taken: await frameIdsOnSource(game, sourceEntryId, round),
    };
  }
  const subtopic = await OasNomination.findOne({
    id: subtopicId, gameId: game.id, kind: 'subtopic', status: 'confirmed',
  });
  if (!subtopic) throw new Error('Subtopic not found');
  return {
    title: subtopic.title,
    subtopicId,
    sourceEntryId: null,
    sourceMapId: null,
    taken: await frameIdsOnSubtopic(game, subtopicId, round),
  };
}

// Rounds 2–4: propose a map through this round's theme, with the lens up front
// — 1 frame = a ranked line, 2 = a 2×2 map. Round 2's subject is a confirmed
// subtopic; rounds 3–4 carry a previous-round item forward (sourceEntryId).
// Supporters see (and stake on) the slate; rivals join it pre-quorum.
async function nominateMap({ game, userId, username, subtopicId, sourceEntryId, frames }) {
  const round = requirePhaseRound(game, 'map');
  if (!Array.isArray(frames) || frames.length < 1 || frames.length > 2) {
    throw new Error('Propose one spectrum or two');
  }
  const subject = await resolveMapSubject({ game, round, subtopicId, sourceEntryId });

  const resolved = [];
  for (const spec of frames) {
    resolved.push(await resolveFrameSpec(game, spec, userId, username));
  }
  if (resolved.length === 2 && resolved[0].id === resolved[1].id) {
    throw new Error('The two spectrums must differ');
  }
  if (resolved.some(f => subject.taken.has(f.id))) {
    throw new Error('That spectrum is already mapping this subtopic — bring a different one');
  }

  const nom = new OasNomination({
    instanceId: game.instanceId,
    gameId: game.id,
    kind: 'map',
    round,
    themeIndex: round - 2,
    title: subject.title,
    subtopicId: subject.subtopicId,
    sourceEntryId: subject.sourceEntryId,
    sourceMapId: subject.sourceMapId,
    dimensions: resolved.length,
    frameSlate: resolved.map(f => ({
      frameId: f.id,
      poleA: f.poleA,
      poleB: f.poleB,
      proposedBy: userId,
      proposedByName: username,
      voterIds: [],
    })),
    nominatedBy: userId,
    nominatedByName: username,
    quorumThreshold: game.config.quorum,
    stakes: [],
  });
  await addStake(game, nom, userId);
  emitToGame(game.id, 'oas_nomination_upserted', { nomination: toClientNomination(nom) });
  return nom;
}

// The nominator's own edit to their slate — add a spectrum once a slot is
// open (the initial pick, or a replacement after removeSlateFrame). Others
// just support the proposal as staked; only the nominator shapes the lens.
async function proposeSlateFrame({ game, nomination, userId, username, frame }) {
  if (nomination.kind !== 'map') throw new Error('Nomination not found');
  if (nomination.round !== roundNumber(game.phase)) {
    throw new Error('That nomination is not in the current round');
  }
  if (nomination.status !== 'nominated') {
    throw new Error('The spectrums are locked once the map confirms');
  }
  if (userId !== nomination.nominatedBy) {
    throw new Error('Only the nominator can change the spectrums');
  }
  if (nomination.frameSlate.length >= nomination.dimensions) {
    throw new Error('This map already has its spectrum(s)');
  }
  const resolved = await resolveFrameSpec(game, frame, userId, username);
  if (nomination.frameSlate.some(f => f.frameId === resolved.id)) {
    throw new Error('That spectrum is already on the slate');
  }
  const taken = nomination.sourceEntryId
    ? await frameIdsOnSource(game, nomination.sourceEntryId, nomination.round, nomination.id)
    : await frameIdsOnSubtopic(game, nomination.subtopicId, nomination.round, nomination.id);
  if (taken.has(resolved.id)) {
    throw new Error('That spectrum is already mapping this subtopic — bring a different one');
  }
  nomination.frameSlate.push({
    frameId: resolved.id,
    poleA: resolved.poleA,
    poleB: resolved.poleB,
    proposedBy: userId,
    proposedByName: username,
  });
  // Completing the slate can itself cross quorum, if stakers already met it
  // while a slot sat open.
  if (mapReadyToConfirm(nomination) &&
      nomination.stakes.filter(s => !s.returned).length >= nomination.quorumThreshold) {
    nomination.status = 'confirmed';
    await nomination.save();
    await openMap(game, nomination);
  } else {
    await nomination.save();
    emitToGame(game.id, 'oas_nomination_upserted', { nomination: toClientNomination(nomination) });
  }
  return nomination;
}

// Nominator pulls one of their own slate frames pre-confirmation, opening a
// slot that proposeSlateFrame can fill with a replacement.
async function removeSlateFrame({ game, nomination, userId, frameId }) {
  if (nomination.kind !== 'map') throw new Error('Nomination not found');
  if (nomination.round !== roundNumber(game.phase)) {
    throw new Error('That nomination is not in the current round');
  }
  if (nomination.status !== 'nominated') {
    throw new Error('The spectrums are locked once the map confirms');
  }
  if (userId !== nomination.nominatedBy) {
    throw new Error('Only the nominator can change the spectrums');
  }
  const idx = nomination.frameSlate.findIndex(f => f.frameId === frameId);
  if (idx === -1) throw new Error('Spectrum not found');
  nomination.frameSlate.splice(idx, 1);
  await nomination.save();
  emitToGame(game.id, 'oas_nomination_upserted', { nomination: toClientNomination(nomination) });
  return nomination;
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
  if (nom.status === 'nominated' && mapReadyToConfirm(nom) &&
      nom.stakes.filter(s => !s.returned).length >= nom.quorumThreshold) {
    nom.status = 'confirmed';
    // Persist the new stake + confirmed status BEFORE any refund: refundStakes
    // claims each stake with an atomic DB update, so the just-pushed stake must
    // already be in the DB or its return is silently skipped (a lost token).
    await nom.save();
    if (nom.kind === 'map') {
      await openMap(game, nom);
    } else {
      // Subtopic confirmed: its job is done, so return every staked token
      // now — players keep the liquidity to branch it and to map later.
      await refundStakes(game, nom);
    }
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
  // player enters the live activity.
  if (nomination.status === 'confirmed' && nomination.kind === 'map') {
    throw new Error('Map already live — join it instead');
  }
  if (nomination.status === 'confirmed') throw new Error('Already confirmed');
  await addStake(game, nomination, userId);
  emitToGame(game.id, 'oas_nomination_staked', { nomination: toClientNomination(nomination) });
  return nomination;
}

// Withdraw a stake from a still-unconfirmed nomination — anyone who staked,
// the nominator included. If that empties the nomination, it expires (an
// idea with zero backers leaves the board rather than lingering un-quorumed).
async function unstake({ game, nomination, userId }) {
  if (nomination.status !== 'nominated') throw new Error('Stakes are locked once confirmed');
  const idx = nomination.stakes.findIndex(s => s.userId === userId && !s.returned);
  if (idx === -1) throw new Error('No stake to withdraw');
  // Claim the return atomically so a concurrent round-close refund can't also
  // credit it. Losing the flip means it was already returned elsewhere.
  const won = await claimStakeReturn(nomination.id, userId);
  if (!won) throw new Error('No stake to withdraw');
  nomination.stakes.splice(idx, 1);
  if (nomination.stakes.length === 0) nomination.status = 'expired';
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
// Live maps — an On-the-Spectrum-style activity per confirmed nomination:
// gather (items, ranked along the already-locked frames) → rank (drag-order
// the frozen items along the winning frames) → done (everyone ranked) /
// closed (round over).

// The gather stage gets a proportional slice of the time left in the round
// (floored so even late spawns get a usable window; capped by round end).
function gatherDeadline(game) {
  const roundEnd = game.phaseDeadline ? new Date(game.phaseDeadline).getTime() : null;
  if (!roundEnd) return null;
  const remaining = Math.max(0, roundEnd - Date.now());
  const slice = Math.min(remaining, Math.max(90 * 1000, remaining * 0.25));
  return new Date(Date.now() + slice);
}

async function openMap(game, nom) {
  nom.mapState = {
    stage: 'gather',
    stageDeadline: gatherDeadline(game),
    // The frame contest ends here: the slate's tally becomes the map's axes,
    // so everyone gathers items against a lens they can already see.
    winningAxes: resolveSlate(nom),
    items: [],
    rankingDone: [],
  };
  await nom.save();
  armMapTimer(game, nom);
  game.maps.push({
    nominationId: nom.id,
    subtopicId: nom.subtopicId,
    round: nom.round,
    themeIndex: nom.themeIndex,
  });
  await game.save();
  emitToGame(game.id, 'oas_map_opened', {
    map: game.maps[game.maps.length - 1].toObject
      ? game.maps[game.maps.length - 1].toObject()
      : game.maps[game.maps.length - 1],
    nomination: toClientNomination(nom),
  });
}

function armMapTimer(game, nom) {
  armTimer(`map:${nom.id}`, nom.mapState && nom.mapState.stageDeadline, async () => {
    const freshGame = await OasGame.findOne({ id: game.id });
    const freshNom = await OasNomination.findOne({ id: nom.id });
    if (freshGame && freshNom) await closeGather(freshGame, freshNom);
  });
}

function requireLiveMap(game, nom, stage = null) {
  if (!nom || nom.kind !== 'map' || nom.status !== 'confirmed' || !nom.mapState) {
    throw new Error('Map not found');
  }
  if (nom.round !== roundNumber(game.phase)) throw new Error("That map's round is over");
  if (stage && nom.mapState.stage !== stage) {
    throw new Error(stage === 'gather' ? 'Gathering is over' : 'Not in the ranking stage');
  }
}

function requireMapMember(nom, userId) {
  if (!nom.stakes.some(s => s.userId === userId)) {
    throw new Error('Join the map first');
  }
}

// Late join on a live map: same 1-token lock as a support stake.
async function joinMap({ game, nomination, userId }) {
  requireLiveMap(game, nomination);
  if (nomination.stakes.some(s => s.userId === userId && !s.returned)) {
    return nomination; // already in — idempotent
  }
  await spend({
    userId,
    instanceId: game.instanceId,
    type: STAKE_TYPE,
    amount: 1,
    refType: 'oas_nomination',
    refId: nomination.id,
  });
  nomination.stakes.push({ userId, amount: 1 });
  await nomination.save();
  emitToGame(game.id, 'oas_nomination_staked', { nomination: toClientNomination(nomination) });
  return nomination;
}

async function listMapEntries(nom) {
  return Entry.find({ activityId: nom.id }).sort({ createdAt: 1 });
}

// A map item is a comment: a short `label` (Entry.objectName, the rankable
// handle) plus an optional `comment` body (Entry.text, the substance the map
// ranks). Label carries the item; comment is encouraged but not required.
async function submitMapItem({ game, nom, userId, username, label, comment }) {
  requireLiveMap(game, nom, 'gather');
  requireMapMember(nom, userId);
  const mine = await Entry.find({
    activityId: nom.id, userId, questionId: ITEM_QUESTION,
  });
  if (mine.length >= MAX_ITEMS_PER_PLAYER) {
    throw new Error(`You can add up to ${MAX_ITEMS_PER_PLAYER} items`);
  }
  const entry = await entryUtils.upsertEntry({
    activity: duckActivity(game, nom),
    instanceId: game.instanceId,
    userId,
    username,
    slotNumber: mine.length + 1,
    questionId: ITEM_QUESTION,
    objectName: label,
    text: comment || '',
  });
  const wire = entryUtils.toClient(entry);
  emitToGame(game.id, 'oas_map_entry', { mapId: nom.id, kind: 'item', entry: wire });
  return entry;
}

// Gather expiry (timer, sweep, or nominator/host force). Freezes the item
// roster; the axes were locked at confirmation. Too few items extends the
// clock instead of producing an unrankable map.
async function closeGather(game, nom, { forced = false } = {}) {
  if (!nom.mapState || nom.mapState.stage !== 'gather') return nom;
  if (!forced && nom.mapState.stageDeadline &&
      new Date(nom.mapState.stageDeadline).getTime() > Date.now()) {
    return nom;
  }

  const entries = await listMapEntries(nom);
  // An item counts if it has a label (objectName); the comment is optional.
  const items = entries.filter(
    e => e.questionId === ITEM_QUESTION && e.objectName && e.objectName.trim());

  if (items.length < 2) {
    // Not enough to rank: extend one minute, bounded by the round itself.
    const roundEnd = game.phaseDeadline ? new Date(game.phaseDeadline).getTime() : Date.now();
    const next = Math.min(Date.now() + 60 * 1000, roundEnd);
    if (next > Date.now()) {
      nom.mapState.stageDeadline = new Date(next);
      await nom.save();
      armMapTimer(game, nom);
      emitToGame(game.id, 'oas_map_stage', mapStagePayload(nom, { reason: 'need_material' }));
    }
    return nom;
  }

  nom.mapState.items = items.map((e, i) => ({
    entryId: e.id, index: i + 1,
    label: e.objectName.slice(0, 80),
    comment: e.text || '',
    authorId: e.userId,
  }));
  nom.mapState.stage = 'rank';
  nom.mapState.stageDeadline = null;
  await nom.save();
  clearTimer(`map:${nom.id}`);
  emitToGame(game.id, 'oas_map_stage', mapStagePayload(nom));
  return nom;
}

// order: array of item entryIds, index 0 = MOST <axis label>. Scores are
// rank-normalized so "most" plots at 1.0 (the OtS convention).
async function submitMapRanking({ game, nom, userId, username, axis, order }) {
  requireLiveMap(game, nom, 'rank');
  requireMapMember(nom, userId);
  if (!RANK_QUESTION[axis]) throw new Error('Unknown axis');
  if (axis === 'y' && nom.dimensions === 1) throw new Error('Unknown axis');

  const itemIds = nom.mapState.items.map(m => m.entryId).sort();
  const orderIds = [...order].sort();
  if (itemIds.length !== orderIds.length ||
      itemIds.some((id, i) => id !== orderIds[i])) {
    throw new Error('Order must include every item exactly once');
  }

  const byEntryId = new Map(nom.mapState.items.map(m => [m.entryId, m]));
  const n = order.length;
  for (let r = 0; r < n; r++) {
    const item = byEntryId.get(order[r]);
    const score = n === 1 ? 0.5 : 1 - r / (n - 1);
    await entryUtils.upsertEntry({
      activity: duckActivity(game, nom),
      instanceId: game.instanceId,
      userId,
      username,
      slotNumber: item.index,
      questionId: RANK_QUESTION[axis],
      position: { x: score, y: 0.5 },
      objectName: item.label.slice(0, 25),
    });
  }
  return nom;
}

async function markMapRankingDone(game, nom, userId, axis) {
  if (!nom.mapState.rankingDone.some(d => d.userId === userId && d.axis === axis)) {
    nom.mapState.rankingDone.push({ userId, axis });
  }
  const axes = nom.dimensions === 2 ? ['x', 'y'] : ['x'];
  const done = new Set(nom.mapState.rankingDone.map(d => `${d.userId}:${d.axis}`));
  const stakerIds = [...new Set(nom.stakes.map(s => s.userId))];
  const allDone = stakerIds.every(id => axes.every(a => done.has(`${id}:${a}`)));
  if (allDone) {
    nom.mapState.stage = 'done';
  }
  await nom.save();
  emitToGame(game.id, 'oas_map_ranked', {
    mapId: nom.id,
    userId,
    axis,
    allDone,
    rankingDone: nom.mapState.rankingDone.map(d => ({ userId: d.userId, axis: d.axis })),
  });
  if (allDone) emitToGame(game.id, 'oas_map_stage', mapStagePayload(nom));
  return nom;
}

// Aggregate view: per item per axis, the mean spectrum score plus how much
// the raters disagreed (population std dev, 0 = consensus) over everyone who
// ranked that axis. Partial rankings simply contribute nothing. `spread`
// drives the 1D reveal's bar heights.
async function computeMapResults(nom) {
  const rankEntries = await Entry.find({
    activityId: nom.id,
    questionId: { $in: [RANK_QUESTION.x, RANK_QUESTION.y] },
  });
  return nom.mapState.items.map(item => {
    const forItem = rankEntries.filter(e => e.slotNumber === item.index);
    const axisStats = (qid) => {
      const scores = forItem
        .filter(e => e.questionId === qid && e.position)
        .map(e => e.position.x);
      if (!scores.length) return { mean: 0.5, spread: 0, count: 0 };
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
      return { mean, spread: Math.sqrt(variance), count: scores.length };
    };
    const xs = axisStats(RANK_QUESTION.x);
    const ys = nom.dimensions === 2 ? axisStats(RANK_QUESTION.y) : null;
    // 2D: combine both axes (root-mean-square, so a max split on either axis
    // still reads as max disagreement) — a dot sitting at the dead center
    // isn't automatically "consensus" if raters split hard on just one axis.
    const spread = ys ? Math.sqrt((xs.spread ** 2 + ys.spread ** 2) / 2) : xs.spread;
    const count = ys ? Math.min(xs.count, ys.count) : xs.count;
    return {
      entryId: item.entryId,
      label: item.label,
      comment: item.comment || '',
      authorId: item.authorId,
      x: xs.mean,
      y: ys ? ys.mean : 0.5,
      spread,
      count,
    };
  });
}

// Everything a player's map sheet needs, in one payload.
async function mapDetail(game, nom, userId = null) {
  const entries = await listMapEntries(nom);
  const detail = {
    nomination: toClientNomination(nom),
    items: entries.filter(e => e.questionId === ITEM_QUESTION).map(entryUtils.toClient),
    serverNow: new Date(),
  };
  if (nom.mapState && (nom.mapState.stage === 'done' || nom.mapState.stage === 'closed')) {
    detail.results = await computeMapResults(nom);
  }
  if (userId && nom.mapState && nom.mapState.stage === 'rank') {
    // The rater's current orderings, so a reload resumes where they left off.
    detail.myRankings = {};
    for (const axis of nom.dimensions === 2 ? ['x', 'y'] : ['x']) {
      const mine = entries
        .filter(e => e.questionId === RANK_QUESTION[axis] && e.userId === userId && e.position)
        .sort((a, b) => b.position.x - a.position.x);
      if (mine.length) {
        const byIndex = new Map(nom.mapState.items.map(m => [m.index, m.entryId]));
        detail.myRankings[axis] = mine.map(e => byIndex.get(e.slotNumber)).filter(Boolean);
      }
    }
  }
  return detail;
}

// A player has "completed" a map when they contributed an item and ranked
// every axis. Computed server-side, never client-asserted.
async function mapCompletion({ game, nom, userId }) {
  const axes = nom.dimensions === 2 ? ['x', 'y'] : ['x'];
  const done = new Set((nom.mapState ? nom.mapState.rankingDone : []).map(d => `${d.userId}:${d.axis}`));
  const hasItem = await Entry.exists({
    activityId: nom.id, userId, questionId: ITEM_QUESTION, objectName: { $ne: '' },
  });
  const rankedAxes = axes.filter(a => done.has(`${userId}:${a}`)).length;
  return {
    hasItem: !!hasItem,
    rankedAxes,
    axesRequired: axes.length,
    complete: !!hasItem && rankedAxes === axes.length,
  };
}

// Completion claim: verify against Entries, then return the caller's stake.
// Idempotent via stake.returned.
async function claimMapStake({ game, nom, userId }) {
  if (!nom || nom.kind !== 'map') throw new Error('Map not found');
  const stake = nom.stakes.find(s => s.userId === userId);
  if (!stake) throw new Error('No stake on this map');
  if (stake.returned) return { nomination: nom, alreadyReturned: true };

  const completion = await mapCompletion({ game, nom, userId });
  if (!completion.complete) {
    const err = new Error('Map not complete');
    err.completion = completion;
    throw err;
  }
  // Claim atomically so a concurrent round-close refund can't also credit it.
  const won = await claimStakeReturn(nom.id, userId);
  stake.returned = true;
  stake.returnedAt = new Date();
  if (!won) return { nomination: nom, alreadyReturned: true };
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
        roundMode: game.config.roundMode,
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
  proposeSlateFrame,
  removeSlateFrame,
  stakeOn,
  unstake,
  joinMap,
  submitMapItem,
  closeGather,
  submitMapRanking,
  markMapRankingDone,
  computeMapResults,
  mapDetail,
  mapCompletion,
  claimMapStake,
  submitProposal,
  joinProposal,
  roundNumber,
  frameKey,
  STAKE_TYPE,
  RETURN_TYPE,
};
