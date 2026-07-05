#!/usr/bin/env node
// End-to-end bot driver for On the Spectrum. Pure REST against a running
// backend; doubles as a regression test for the phase machine and the
// rank→grid aggregation math.
//
//   node scripts/simulate-spectrum.js [http://localhost:4001]

const BASE = (process.argv[2] || 'http://localhost:4001').replace(/\/$/, '');
const API = `${BASE}/api/spectrum`;

let failures = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}`);
  }
}

async function call(method, path, { body, player } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (player) {
    headers['x-user-id'] = player.id;
    if (player.token) headers['Authorization'] = `Bearer ${player.token}`;
  }
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function main() {
  console.log(`Simulating against ${API}\n`);

  // --- Create + join -------------------------------------------------------
  console.log('Create & join');
  const created = await call('POST', '/games', { body: { hostName: 'Host' } });
  assert(created.status === 201, 'host creates game');
  const code = created.json.game.code;
  const host = { ...created.json.player, token: created.json.token };
  assert(/^[A-Z2-9]{5}$/.test(code), `room code looks right (${code})`);

  const bots = [host];
  for (const name of ['Ada', 'Bo', 'Cy']) {
    const j = await call('POST', `/games/${code}/join`, { body: { name } });
    assert(j.status === 201, `${name} joins`);
    bots.push({ ...j.json.player, token: j.json.token });
  }

  // --- Auth smoke: mismatched identity must 401 ----------------------------
  const forged = await call('POST', `/games/${code}/nominations`, {
    body: { text: 'forged' },
    player: { id: host.id, token: bots[1].token }, // Ada's token, host's id
  });
  assert(forged.status === 401, `identity mismatch rejected (${forged.status})`);

  // --- Start + nominate ----------------------------------------------------
  console.log('\nNominate & vote');
  const started = await call('POST', `/games/${code}/start`, { player: host });
  assert(started.status === 200 && started.json.game.phase === 'nominate', 'host starts → nominate');
  assert(!!started.json.game.phaseDeadline, 'countdown deadline set');

  const ideas = ['funniness', 'calmness', 'boldness', 'mystery'];
  const noms = [];
  for (let i = 0; i < 4; i++) {
    const n = await call('POST', `/games/${code}/nominations`, {
      body: { text: ideas[i] }, player: bots[i],
    });
    assert(n.status === 201, `${bots[i].name} nominates "${ideas[i]}"`);
    noms.push(n.json.entry);
  }

  // Votes: funniness gets 3 (everyone but author), calmness 2, boldness 1.
  const votePlan = [
    [1, 0], [2, 0], [3, 0],
    [0, 1], [2, 1],
    [0, 2],
  ];
  for (const [voter, target] of votePlan) {
    const v = await call('POST', `/games/${code}/nominations/${noms[target].id}/vote`, {
      player: bots[voter],
    });
    assert(v.status === 200, `${bots[voter].name} votes "${ideas[target]}"`);
  }

  const selfVote = await call('POST', `/games/${code}/nominations/${noms[0].id}/vote`, { player: bots[0] });
  assert(selfVote.status === 400, 'self-vote blocked');
  // Budget check needs a 5th idea: Ada (1 vote used) fills her budget of 3,
  // then a 4th distinct vote must be rejected.
  const extra = await call('POST', `/games/${code}/nominations`, {
    body: { text: 'humility' }, player: bots[3],
  });
  await call('POST', `/games/${code}/nominations/${noms[3].id}/vote`, { player: bots[1] });
  await call('POST', `/games/${code}/nominations/${extra.json.entry.id}/vote`, { player: bots[1] });
  const overBudget = await call('POST', `/games/${code}/nominations/${noms[2].id}/vote`, { player: bots[1] });
  assert(overBudget.status === 400, `vote budget enforced (${overBudget.status})`);
  // Undo Ada's extra votes so the planned tally stands.
  await call('POST', `/games/${code}/nominations/${noms[3].id}/vote`, { player: bots[1] });
  await call('POST', `/games/${code}/nominations/${extra.json.entry.id}/vote`, { player: bots[1] });

  // --- Advance to rank -----------------------------------------------------
  console.log('\nRank');
  const adv = await call('POST', `/games/${code}/advance`, { player: host });
  assert(adv.status === 200 && adv.json.game.phase === 'rank', 'host force-advances → rank');
  const axes = adv.json.game.winningAxes.map(a => a.label);
  assert(axes[0] === 'funniness' && axes[1] === 'calmness', `top-2 win (${axes.join(' × ')})`);
  const roster = adv.json.game.roster;
  assert(roster.length === 4, 'roster frozen with 4 players');

  // Every bot ranks both axes with a random order; remember for recompute.
  const orders = { x: {}, y: {} }; // axis -> raterId -> [playerIds]
  for (const axis of ['x', 'y']) {
    for (const bot of bots) {
      const order = shuffled(roster.map(m => m.id));
      orders[axis][bot.id] = order;
      const r = await call('PUT', `/games/${code}/rankings/${axis}`, {
        body: { order, done: true }, player: bot,
      });
      assert(r.status === 200, `${bot.name} ranks axis ${axis}`);
    }
  }

  // Stories on a couple of placements.
  const subject = roster.find(m => m.id !== host.id);
  const story = await call('PUT', `/games/${code}/stories/x/${subject.subjectIndex}`, {
    body: { text: `That time ${subject.name} broke the karaoke machine.` }, player: host,
  });
  assert(story.status === 200, 'story saved');

  // --- Reveal + aggregation check ------------------------------------------
  console.log('\nReveal');
  const snap = await call('GET', `/games/${code}`);
  assert(snap.json.game.phase === 'reveal', 'all rankings done → auto-reveal');
  const results = snap.json.results || [];
  assert(results.length === 4, 'results include all 4 players');

  const n = roster.length;
  let mathOk = true;
  for (const r of results) {
    for (const axis of ['x', 'y']) {
      const scores = bots.map(b => {
        const rank = orders[axis][b.id].indexOf(r.playerId); // 0 = MOST
        return 1 - rank / (n - 1);
      });
      const expected = scores.reduce((a, b) => a + b, 0) / scores.length;
      if (Math.abs(r[axis] - expected) > 1e-9) {
        mathOk = false;
        console.error(`  ✗ ${r.name} ${axis}: got ${r[axis]}, expected ${expected}`);
      }
    }
  }
  assert(mathOk, 'every dot equals the recomputed mean normalized rank');

  const revealed = results.find(r => r.playerId === subject.id);
  assert(
    revealed && revealed.stories.some(s => s.text.includes('karaoke') && s.raterName === 'Host'),
    'story appears on the right person, attributed'
  );

  // --- Rematch --------------------------------------------------------------
  const re = await call('POST', `/games/${code}/rematch`, { player: host });
  assert(re.status === 201 && re.json.game.phase === 'lobby', 'rematch creates fresh lobby');
  assert(re.json.game.participants.length === 4, 'rematch carries the whole room');

  console.log(failures === 0 ? '\n✅ ALL CHECKS PASSED' : `\n❌ ${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('Simulation crashed:', err);
  process.exit(1);
});
