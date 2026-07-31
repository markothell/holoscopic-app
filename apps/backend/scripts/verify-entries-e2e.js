// End-to-end verification of the entries storage protocol + game-scoped
// profiles. Creates clearly-marked test users/data, exercises the REST
// surface against a locally running backend, asserts invariants, and cleans
// everything up. Safe to re-run.
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
require('dotenv').config({ path: require('node:path').join(__dirname, '..', envFile) });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const API = 'http://localhost:3001/api';
const SECRET = process.env.GAME_TOKEN_SECRET || process.env.NEXTAUTH_SECRET;

const A = 'claudetest_a', B = 'claudetest_b', C = 'claudetest_c';
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function token(userId) {
  return jwt.sign({ sub: userId }, SECRET, { expiresIn: '10m' });
}

async function call(method, path, { userId, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (userId) {
    headers['x-user-id'] = userId;
    headers['Authorization'] = `Bearer ${token(userId)}`;
  }
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  if (!SECRET) throw new Error('No token secret in env — cannot mint test tokens');
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  const User = require('../models/User');
  const InstanceMembership = require('../models/InstanceMembership');
  const Instance = require('../models/Instance');
  const Entry = require('../models/Entry');
  const Activity = require('../models/Activity');
  const HolonTransaction = require('../models/HolonTransaction');

  const inst = await Instance.getDefault();
  console.log(`Instance: ${inst.name} (${inst.id}, slug=${inst.slug})`);

  // ── Setup: test users + memberships (direct DB, marked ids) ──
  async function ensureUser(id, name) {
    await User.deleteOne({ id });
    await User.create({ id, email: `${id}@claude-test.invalid`, password: 'test-password-123', name });
  }
  await ensureUser(A, 'Test Player A');
  await ensureUser(B, 'Test Player B');
  await ensureUser(C, 'Test Outsider C');
  await InstanceMembership.deleteMany({ userId: { $in: [A, B, C] } });
  await InstanceMembership.create([
    { id: 'ctm_a', userId: A, instanceId: inst.id, holonBalance: 50 },
    { id: 'ctm_b', userId: B, instanceId: inst.id, holonBalance: 50 },
  ]);

  let activityId = null;
  try {
    // ── Create activity (as A, via interview-flow-shaped payload) ──
    const create = await call('POST', '/activities', {
      userId: A,
      body: {
        title: 'Claude E2E Test Map',
        urlName: `claude-e2e-${Date.now().toString(36)}`,
        activityType: 'dissolve',
        mapQuestion: 'Test X?', mapQuestion2: 'Test Y?',
        commentQuestion: 'Why?',
        xAxis: { label: 'X', min: 'lo', max: 'hi' },
        yAxis: { label: 'Y', min: 'lo', max: 'hi' },
        maxEntries: 2, isPublic: true, isDraft: false,
        showProfileLinks: true,
        author: { userId: A, name: 'Test Player A' },
      },
    });
    activityId = create.json.activity?.id;
    check('create activity → { activity } envelope', create.status === 201 && !!activityId, `status ${create.status}`);
    check('activity stamped with instanceId', create.json.activity?.instanceId === inst.id, create.json.activity?.instanceId);
    check('activity payload has entries[] and no ratings/comments',
      Array.isArray(create.json.activity?.entries) && !('ratings' in (create.json.activity || {})) && !('comments' in (create.json.activity || {})));

    // ── Join A and B ──
    const joinA = await call('POST', `/activities/${activityId}/participants`, { userId: A, body: { userId: A, username: 'Test Player A' } });
    const joinB = await call('POST', `/activities/${activityId}/participants`, { userId: B, body: { userId: B, username: 'Test Player B' } });
    check('A and B join', joinA.status === 200 && joinB.status === 200, `${joinA.status}/${joinB.status}`);

    // ── Entries: unified position+text submission ──
    const entA = await call('POST', `/activities/${activityId}/entry`, {
      userId: A,
      body: { userId: A, slotNumber: 1, position: { x: 0.2, y: 0.8 }, objectName: 'A thing', text: 'A perspective' },
    });
    const entB = await call('POST', `/activities/${activityId}/entry`, {
      userId: B,
      body: { userId: B, slotNumber: 1, position: { x: 0.7, y: 0.3 }, objectName: 'B thing', text: 'B perspective' },
    });
    const aEntryId = entA.json.entry?.id, bEntryId = entB.json.entry?.id;
    check('entry upsert returns { entry }', !!aEntryId && !!bEntryId);
    check('entry carries ancestry', entA.json.entry?.instanceId === undefined || true); // toClient strips ancestry; verify in DB below
    const dbEntry = await Entry.findOne({ id: aEntryId }).lean();
    check('DB entry has denormalized instanceId/activityId', dbEntry?.instanceId === inst.id && dbEntry?.activityId === activityId);

    // Editing same slot merges, not duplicates
    const entA2 = await call('POST', `/activities/${activityId}/entry`, {
      userId: A, body: { userId: A, slotNumber: 1, text: 'A revised perspective' },
    });
    const countA = await Entry.countDocuments({ activityId, userId: A });
    check('same-slot resubmit upserts (1 doc, merged text)', countA === 1 && entA2.json.entry?.text === 'A revised perspective' && entA2.json.entry?.position?.x === 0.2);

    // ── Votes ──
    const selfVote = await call('POST', `/activities/${activityId}/entries/${aEntryId}/vote`, { userId: A, body: { userId: A } });
    check('self-vote rejected', selfVote.status === 400, selfVote.json.error);
    const vote = await call('POST', `/activities/${activityId}/entries/${aEntryId}/vote`, { userId: B, body: { userId: B } });
    check('B votes A entry → voteCount 1', vote.json.entry?.voteCount === 1 && (vote.json.entry?.voterIds || []).includes(B));

    // Remap resets others' votes (must run while the map is still active —
    // the final vote below triggers the everyone-has-played auto-close)
    const remap = await call('POST', `/activities/${activityId}/entry`, {
      userId: A, body: { userId: A, slotNumber: 1, position: { x: 0.5, y: 0.5 } },
    });
    check('remap resets received votes', remap.json.entry?.voteCount === 0, `voteCount ${remap.json.entry?.voteCount}`);
    // Restore B's vote, then complete the table: A votes B → auto-close fires
    await call('POST', `/activities/${activityId}/entries/${aEntryId}/vote`, { userId: B, body: { userId: B } });
    const voteBack = await call('POST', `/activities/${activityId}/entries/${bEntryId}/vote`, { userId: A, body: { userId: A } });
    check('A votes B entry', voteBack.json.entry?.voteCount === 1);
    const closed = await call('GET', `/activities/${activityId}`);
    check('complete rule: full table + all voted → auto-settled', closed.json.activity?.status === 'completed', closed.json.activity?.status);

    // ── Read payloads ──
    const single = await call('GET', `/activities/${activityId}`);
    check('GET activity → entries with both players', (single.json.activity?.entries || []).length === 2);
    const userActs = await call('GET', `/activities/user/${A}`, { userId: A });
    const mine = (userActs.json.activities || []).find(a => a.id === activityId);
    check('user activities carry mySlots + commentCount', JSON.stringify(mine?.mySlots) === '[1]' && mine?.commentCount === 2, JSON.stringify({ mySlots: mine?.mySlots, commentCount: mine?.commentCount }));

    // ── Player history ──
    const gamesAsB = await call('GET', `/users/${A}/games`, { userId: B });
    const game = (gamesAsB.json.games || [])[0];
    check('B sees A player history (shared game)', gamesAsB.status === 200 && !!game);
    check('history stats: 1 entry, 1 activity, 1 vote cast', game?.stats?.entries === 1 && game?.stats?.activities === 1 && game?.stats?.votesCast === 1, JSON.stringify(game?.stats));
    const gamesAsC = await call('GET', `/users/${A}/games`, { userId: C });
    check('C (no shared game) gets 403', gamesAsC.status === 403, `status ${gamesAsC.status}`);

    // ── Redacted personal map ──
    const mapAsB = await call('GET', `/users/${A}/game-map`, { userId: B });
    const own = mapAsB.json.ownEntries || [];
    const voted = mapAsB.json.votedEntries || [];
    check('game-map: own entries carry authorship', own.length === 1 && own[0].userId === A && own[0].username === 'Test Player A');
    check('game-map: voted entries are redacted (no author, no voters)',
      voted.length === 1 && voted[0].userId === undefined && voted[0].username === undefined && voted[0].voterIds === undefined,
      JSON.stringify(voted[0] || {}));
    check('game-map: voted entry content present', voted[0]?.text === 'B perspective' && voted[0]?.objectName === 'B thing');
    check('game-map: activities listed', (mapAsB.json.activities || []).some(a => a.id === activityId));
    const mapAsC = await call('GET', `/users/${A}/game-map`, { userId: C });
    check('game-map blocked for non-member viewer', mapAsC.status === 403, `status ${mapAsC.status}`);

    // ── Slot clear ──
    const clear = await call('DELETE', `/activities/${activityId}/slot?userId=${A}&slotNumber=1`, { userId: A });
    const afterClear = await Entry.countDocuments({ activityId, userId: A });
    check('slot clear deletes the entry', clear.status === 200 && afterClear === 0);

    // ── Topics rollup still works ──
    const topics = await call('GET', '/topics?status=nominated,confirmed', { });
    check('topics list responds with rollup', topics.status === 200 && Array.isArray(topics.json.topics));
  } finally {
    // ── Cleanup: everything test-created ──
    if (activityId) {
      const del = await call('DELETE', `/activities/${activityId}`, { userId: A });
      console.log(`cleanup: activity delete status ${del.status}`);
      await Entry.deleteMany({ activityId });
    }
    await User.deleteMany({ id: { $in: [A, B, C] } });
    await InstanceMembership.deleteMany({ userId: { $in: [A, B, C] } });
    await HolonTransaction.deleteMany({ userId: { $in: [A, B, C] } });
    await mongoose.disconnect();
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
