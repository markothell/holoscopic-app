const OasGame = require('../models/OasGame');
const OasNomination = require('../models/OasNomination');
const OasFrame = require('../models/OasFrame');
const Instance = require('../models/Instance');
const Entry = require('../models/Entry');
const { computeMapResults, frameKey } = require('./oasGames');

// Cross-game aggregation for On a Spectrum: the self-only /me history and
// the public instance pulse (conversations + spectrums). Reads only — the
// one write is the immutable per-game summary, computed exactly once when a
// completed game is first read (the same lazy pattern as sweep-on-read),
// which also serves as the backfill path for games that finished before
// summaries existed.
//
// Privacy: pulse payloads carry no user ids or names — topics, themes,
// codes, and counts only. Per-participant numbers live inside game.summary
// and are only ever sliced out for the requesting user by userGames().

const ITEM_QUESTION = 'item';

// ---------------------------------------------------------------------------
// Lazy backfill — games/frames created before the lineage fields existed
// get them on the first aggregate read per process. Bounded: the query
// only matches docs still missing fields, so steady state is a no-op.

let backfillDone = false;

async function ensureBackfill() {
  if (backfillDone) return;
  backfillDone = true;

  const games = await OasGame.find({
    $or: [{ parentInstanceId: null }, { rootGameId: null }],
  });
  const byId = new Map(games.map(g => [g.id, g]));

  async function rootOf(game, hops = 0) {
    if (game.rootGameId) return game.rootGameId;
    if (!game.parentGameId || hops > 20) return game.id;
    const parent = byId.get(game.parentGameId)
      || await OasGame.findOne({ id: game.parentGameId });
    if (!parent) return game.id;
    return rootOf(parent, hops + 1);
  }

  for (const game of games) {
    if (!game.parentInstanceId) {
      const room = await Instance.findOne({ id: game.instanceId });
      if (room && room.parentInstanceId) game.parentInstanceId = room.parentInstanceId;
    }
    if (!game.rootGameId) game.rootGameId = await rootOf(game);
    await game.save();
  }

  const frames = await OasFrame.find({
    $or: [{ parentInstanceId: null }, { key: null }],
  });
  for (const frame of frames) {
    if (!frame.key) frame.key = frameKey(frame.poleA, frame.poleB);
    if (!frame.parentInstanceId) {
      const game = byId.get(frame.gameId) || await OasGame.findOne({ id: frame.gameId });
      if (game && game.parentInstanceId) frame.parentInstanceId = game.parentInstanceId;
    }
    await frame.save();
  }
}

// ---------------------------------------------------------------------------
// Per-game summary — computed once, when a completed game is first read.

async function ensureSummary(game) {
  if (game.phase !== 'complete' || (game.summary && game.summary.computedAt)) {
    return game;
  }

  const noms = await OasNomination.find({ gameId: game.id });
  const subtopics = noms.filter(n => n.kind === 'subtopic');
  const maps = noms.filter(n => n.kind === 'map');

  const per = new Map(); // userId -> participantSummary
  const slot = (userId) => {
    if (!per.has(userId)) {
      per.set(userId, {
        userId, items: 0, axesRanked: 0, mapsCompleted: 0,
        framesProposed: 0, hosted: userId === game.hostId,
      });
    }
    return per.get(userId);
  };
  for (const p of game.participants) slot(p.id);

  const frameIds = new Set();
  let items = 0;
  let mapsRevealed = 0;
  const spreads = [];

  for (const nom of maps) {
    for (const f of nom.frameSlate || []) {
      frameIds.add(f.frameId);
      slot(f.proposedBy).framesProposed += 1;
    }
    if (!nom.mapState) continue;

    const itemEntries = await Entry.find({
      activityId: nom.id, questionId: ITEM_QUESTION, text: { $ne: '' },
    });
    items += itemEntries.length;
    const itemAuthors = new Set(itemEntries.map(e => e.userId));

    const axes = nom.dimensions === 2 ? ['x', 'y'] : ['x'];
    const rankedAxesByUser = new Map();
    for (const d of nom.mapState.rankingDone || []) {
      slot(d.userId).axesRanked += 1;
      rankedAxesByUser.set(d.userId, (rankedAxesByUser.get(d.userId) || 0) + 1);
    }
    for (const [userId, ranked] of rankedAxesByUser) {
      if (ranked === axes.length && itemAuthors.has(userId)) {
        slot(userId).mapsCompleted += 1;
      }
    }

    if ((nom.mapState.stage === 'done' || nom.mapState.stage === 'closed')
        && nom.mapState.items.length) {
      const results = await computeMapResults(nom);
      const ranked = results.filter(r => r.count > 0);
      if (ranked.length) {
        mapsRevealed += 1;
        spreads.push(ranked.reduce((s, r) => s + r.spread, 0) / ranked.length);
      }
    }
    for (const e of itemEntries) slot(e.userId).items += 1;
  }

  game.summary = {
    computedAt: new Date(),
    players: game.participants.length,
    subtopicsNominated: subtopics.length,
    subtopicsConfirmed: subtopics.filter(n => n.status === 'confirmed').length,
    mapsProposed: maps.length,
    mapsRevealed,
    items,
    spectrums: frameIds.size,
    spread: spreads.length
      ? spreads.reduce((a, b) => a + b, 0) / spreads.length
      : null,
    perParticipant: [...per.values()],
  };
  await game.save();
  return game;
}

// ---------------------------------------------------------------------------
// Wire shapes

function gameCard(game) {
  const s = game.summary;
  return {
    id: game.id,
    code: game.code,
    topic: game.topic,
    themes: [...game.themes],
    phase: game.phase,
    phaseDeadline: game.phaseDeadline,
    players: game.participants.length,
    rootGameId: game.rootGameId,
    parentGameId: game.parentGameId,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
    summary: s ? {
      players: s.players,
      subtopicsConfirmed: s.subtopicsConfirmed,
      mapsProposed: s.mapsProposed,
      mapsRevealed: s.mapsRevealed,
      items: s.items,
      spectrums: s.spectrums,
      spread: s.spread,
    } : null,
  };
}

// ---------------------------------------------------------------------------
// /me — the requesting player's own games and spectrums. Self-only.

async function userGames(parentInstanceId, userId) {
  await ensureBackfill();
  const games = await OasGame.find({
    parentInstanceId,
    'participants.id': userId,
  }).sort({ updatedAt: -1 }).limit(200);

  const active = [];
  const history = [];
  for (const game of games) {
    if (game.phase === 'complete') {
      await ensureSummary(game);
      const mine = (game.summary?.perParticipant || [])
        .find(p => p.userId === userId) || null;
      history.push({
        ...gameCard(game),
        my: mine ? {
          hosted: mine.hosted,
          items: mine.items,
          axesRanked: mine.axesRanked,
          mapsCompleted: mine.mapsCompleted,
          framesProposed: mine.framesProposed,
        } : { hosted: game.hostId === userId, items: 0, axesRanked: 0, mapsCompleted: 0, framesProposed: 0 },
      });
    } else {
      active.push({ ...gameCard(game), hostedByMe: game.hostId === userId });
    }
  }

  // My spectrums: every lens I've coined here, with anonymous cross-game
  // usage (count of games whose slates carried the same key — no names).
  const mine = await OasFrame.find({ parentInstanceId, createdBy: userId });
  const spectrums = [];
  const seen = new Set();
  for (const frame of mine) {
    if (seen.has(frame.key)) continue;
    seen.add(frame.key);
    const gamesUsed = await OasFrame.distinct('gameId', { parentInstanceId, key: frame.key });
    spectrums.push({
      key: frame.key,
      poleA: frame.poleA,
      poleB: frame.poleB,
      games: gamesUsed.length,
      firstUsedAt: frame.createdAt,
    });
  }
  spectrums.sort((a, b) => b.games - a.games);

  return { active, history, spectrums, serverNow: new Date() };
}

// ---------------------------------------------------------------------------
// /pulse — the public instance view: which conversations and spectrums are
// moving. No user identity anywhere in the payload.

const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

async function pulse(parentInstanceId) {
  await ensureBackfill();
  const games = await OasGame.find({ parentInstanceId }).sort({ updatedAt: -1 });

  for (const game of games) {
    if (game.phase === 'complete') await ensureSummary(game);
  }

  // Conversations: group by thread, newest movement first.
  const threads = new Map();
  for (const game of games) {
    const key = game.rootGameId || game.id;
    if (!threads.has(key)) threads.set(key, []);
    threads.get(key).push(game);
  }

  function depthOf(thread) {
    const parentOf = new Map(thread.map(g => [g.id, g.parentGameId]));
    let max = 1;
    for (const g of thread) {
      let d = 1;
      let cur = parentOf.get(g.id);
      while (cur && parentOf.has(cur) && d < 50) { d += 1; cur = parentOf.get(cur); }
      if (d > max) max = d;
    }
    return max;
  }

  const conversations = [...threads.values()].map(thread => {
    const root = thread.find(g => g.id === (g.rootGameId || g.id)) || thread[thread.length - 1];
    // Threads arrive sorted by updatedAt desc, so [0] is the freshest game.
    const latest = thread[0];
    const live = thread.filter(g => g.phase !== 'complete').length;
    const revealed = thread.reduce((n, g) => n + (g.summary?.mapsRevealed || 0), 0);
    return {
      rootGameId: root.rootGameId || root.id,
      rootTopic: root.topic,
      latestTopic: latest.topic,
      latestThemes: [...latest.themes],
      latestCode: latest.code,
      latestPhase: latest.phase,
      games: thread.length,
      generations: depthOf(thread),
      live,
      mapsRevealed: revealed,
      lastActiveAt: latest.updatedAt,
      startedAt: thread[thread.length - 1].createdAt,
    };
  }).sort((a, b) => new Date(b.lastActiveAt) - new Date(a.lastActiveAt)).slice(0, 50);

  // Spectrums: lenses grouped across games by key, movement first.
  const frames = await OasFrame.find({ parentInstanceId }).sort({ createdAt: -1 });
  const byKey = new Map();
  for (const frame of frames) {
    if (!byKey.has(frame.key)) {
      byKey.set(frame.key, {
        key: frame.key, poleA: frame.poleA, poleB: frame.poleB,
        gameIds: new Set(), frameIds: [], lastUsedAt: frame.createdAt,
      });
    }
    const s = byKey.get(frame.key);
    s.gameIds.add(frame.gameId);
    s.frameIds.push(frame.id);
    if (frame.createdAt > s.lastUsedAt) s.lastUsedAt = frame.createdAt;
  }

  const spectrumRows = [...byKey.values()]
    .sort((a, b) => (b.gameIds.size - a.gameIds.size)
      || (new Date(b.lastUsedAt) - new Date(a.lastUsedAt)))
    .slice(0, 50);

  // Up to 3 subtopic titles per lens (what it's been pointed at) — titles
  // only, never who.
  const spectrums = [];
  for (const s of spectrumRows) {
    const noms = await OasNomination.find({
      kind: 'map', 'frameSlate.frameId': { $in: s.frameIds },
    }).sort({ createdAt: -1 }).limit(6);
    const subtopics = [...new Set(noms.map(n => n.title))].slice(0, 3);
    spectrums.push({
      key: s.key,
      poleA: s.poleA,
      poleB: s.poleB,
      games: s.gameIds.size,
      recent: new Date(s.lastUsedAt).getTime() > Date.now() - RECENT_WINDOW_MS,
      lastUsedAt: s.lastUsedAt,
      subtopics,
    });
  }

  const stats = {
    games: games.length,
    conversations: threads.size,
    live: games.filter(g => g.phase !== 'complete').length,
    mapsRevealed: games.reduce((n, g) => n + (g.summary?.mapsRevealed || 0), 0),
    spectrums: byKey.size,
  };

  return { stats, conversations, spectrums, serverNow: new Date() };
}

module.exports = { ensureSummary, userGames, pulse };
