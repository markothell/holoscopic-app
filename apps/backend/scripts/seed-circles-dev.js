#!/usr/bin/env node
// Three dev circles that exercise every surface of the circles app (the
// product at apps/circles) at once, built through the same funnels the REST
// surface drives — never by direct writes:
//
//   /c/harbor  9 members, the richest circle-home map: shared explorations at
//              9/9, 5/9 and 2/9 participation, two solo spurs, a live topic
//              mid-rank, a queue. The map demo.
//   /c/quay    3 members, live topic mid-SHARE with Mara not yet in — the
//              telling flow (typed or recorded) from a clean start.
//   /c/inlet   invitation-only, Mara invited and NOT a member — the
//              take-a-seat card and the email gate.
//
//   node scripts/seed-circles-dev.js            create/refresh all three
//   node scripts/seed-circles-dev.js --clear    remove them
//
// Reuses seed-threshold-dev.js's instance and sign-ins (run that first);
// members beyond the three real accounts exist only as circle membership
// rows, deliberately — they need no sign-in, and carrying no email keeps
// every transition unmailed (see seed-threshold-dev.js's note on Resend).
// Dev only, by database name and NODE_ENV.

require('dotenv').config({ path: `${__dirname}/../.env.local` });

const mongoose = require('mongoose');

const Instance = require('../models/Instance');
const Circle = require('../models/Circle');
const ThresholdShare = require('../models/ThresholdShare');
const ThresholdRanking = require('../models/ThresholdRanking');
const circles = require('../utils/circles');
const threshold = require('../utils/threshold');

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('No MONGODB_URI'); process.exit(1); }
const dbName = (uri.match(/\/([^/?]+)\?/) || [])[1];
if (dbName !== 'holoscopic-dev' || process.env.NODE_ENV === 'production') {
  console.error(`REFUSING: this writes fixture data. Expected holoscopic-dev, got ${dbName}.`);
  process.exit(1);
}

const URL_NAMES = ['harbor', 'quay', 'inlet'];
const PEOPLE = [
  { id: 'thr-dev-1', name: 'Mara' },
  { id: 'thr-dev-2', name: 'Ivo' },
  { id: 'thr-dev-3', name: 'Nell' },
  { id: 'thr-dev-4', name: 'Tomas' },
  { id: 'thr-dev-5', name: 'June' },
  { id: 'thr-dev-6', name: 'Priya' },
  { id: 'thr-dev-7', name: 'Owen' },
  { id: 'thr-dev-8', name: 'Sana' },
  { id: 'thr-dev-9', name: 'Felix' },
];
const by = Object.fromEntries(PEOPLE.map(p => [p.name, p]));

const store = { ...threshold.mongoStore, async sendEmail() {}, async notify() {} };

async function clearCircles(instanceId) {
  const mine = await Circle.find({ instanceId, urlName: { $in: URL_NAMES } }).lean();
  const seedIds = mine.flatMap(c => c.seeds.map(s => s.id));
  await Promise.all([
    Circle.deleteMany({ instanceId, urlName: { $in: URL_NAMES } }),
    ThresholdShare.deleteMany({ seedId: { $in: seedIds } }),
    ThresholdRanking.deleteMany({ seedId: { $in: seedIds } }),
  ]);
}

async function main() {
  // Scripts connect with autoIndex:false, always (apps/backend/CLAUDE.md).
  await mongoose.connect(uri, { autoIndex: false });
  const instance = await Instance.findOne({ slug: 'threshold' });
  if (!instance) {
    console.error('No threshold instance — run scripts/seed-threshold-dev.js first.');
    return mongoose.disconnect();
  }

  await clearCircles(instance.id);
  if (process.argv.includes('--clear')) {
    console.log('harbor, quay and inlet removed.');
    return mongoose.disconnect();
  }

  // ── shared helpers, all through the funnels ───────────────────────────────

  const makeCircle = async ({ title, urlName, createdBy, invitedEmails = [], requireInvitation = false, memberNames }) => {
    const circle = await circles.createCircle({
      store, instanceId: instance.id, activity: 'threshold',
      title, urlName, createdBy: by[createdBy].id, creatorName: createdBy,
      invitedEmails, requireInvitation,
    });
    for (const n of memberNames.filter(n => n !== createdBy)) {
      await circles.joinCircle({ store, circleId: circle.id, userId: by[n].id, username: n });
    }
    await circles.startCircle({ store, circleId: circle.id, userId: by[createdBy].id });
    return circle;
  };
  const topic = async (circle, who, t, a, b) => {
    const { circle: doc } = await circles.addSeed({
      store, circleId: circle.id, userId: by[who].id, payload: { topic: t, poleA: a, poleB: b },
    });
    return doc.seeds[doc.seeds.length - 1];
  };
  const tell = async (circle, seed, names, pole = 'A') => {
    for (const n of names) {
      await threshold.submitShare({
        store, circleId: circle.id, seedId: seed.id, userId: by[n].id, username: n,
        pole, text: `A short story from around the table, about a time this cut one way.`,
      });
    }
  };
  const rankAll = async (circle, seed, names) => {
    const ids = (await store.listShares(seed.id)).map(s => s.id);
    for (const n of names) {
      await threshold.submitRanking({
        store, circleId: circle.id, seedId: seed.id, userId: by[n].id,
        placements: ids.map((id, i) => ({ shareId: id, pole: i % 3 === 0 ? 'B' : 'A' })),
      });
    }
  };
  const advance = (circle) => circles.advanceCircle({ store, circleId: circle.id, userId: circle.createdBy });
  // share → (advance) → rank → some rankings → advance → revealed.
  const runTopic = async (circle, who, title, a, b, tellers, rankers) => {
    const seed = await topic(circle, who, title, a, b);
    await tell(circle, seed, tellers);
    let fresh = await Circle.findOne({ id: circle.id });
    if (circles.activeSeed(fresh)?.phase === 'share') await advance(fresh);
    if (rankers.length) await rankAll(circle, seed, rankers);
    fresh = await Circle.findOne({ id: circle.id });
    if (circles.activeSeed(fresh)?.id === seed.id) await advance(fresh);
    return seed;
  };

  // ── harbor: the map demo ──────────────────────────────────────────────────

  const harbor = await makeCircle({
    title: 'Harbor circle', urlName: 'harbor', createdBy: 'Mara',
    memberNames: PEOPLE.map(p => p.name),
  });
  const all = PEOPLE.map(p => p.name);
  await runTopic(harbor, 'Mara', 'Being needed', 'Nourishing', 'Draining', all, ['Mara', 'Ivo', 'June', 'Sana']);
  await runTopic(harbor, 'Ivo', 'Arriving late', 'Human', 'Careless', ['Ivo', 'Nell', 'Tomas', 'June', 'Mara'], ['Ivo', 'Nell']);
  await runTopic(harbor, 'Priya', 'Lending money', 'Generous', 'Foolish', ['Priya', 'Owen'], ['Priya']);
  await runTopic(harbor, 'Nell', 'Walking out of a job', 'Brave', 'Reckless', ['Nell'], []);
  await runTopic(harbor, 'Sana', 'Keeping a secret', 'Loyal', 'Corrosive', ['Sana'], []);
  const live = await topic(harbor, 'Ivo', 'Being watched at work', 'Steadying', 'Suffocating');
  await tell(harbor, live, ['Mara', 'Ivo', 'Tomas', 'June', 'Priya', 'Felix']);
  await advance(harbor); // sits at rank, mid-sort
  const q1 = await topic(harbor, 'Owen', 'Family dinners', 'Anchoring', 'Obligatory');
  await circles.supportSeed({ store, circleId: harbor.id, seedId: q1.id, userId: by.June.id });
  await topic(harbor, 'Felix', 'Old friendships', 'Effortless', 'Expired');

  // ── quay: mid-share, Mara not yet in ─────────────────────────────────────

  const quay = await makeCircle({
    title: 'Quay circle', urlName: 'quay', createdBy: 'Mara',
    memberNames: ['Mara', 'Ivo', 'Nell'],
  });
  const quaySeed = await topic(quay, 'Ivo', 'Asking for help', 'Strong', 'Exposed');
  await tell(quay, quaySeed, ['Ivo']);

  // ── inlet: the take-a-seat card ───────────────────────────────────────────

  const inlet = await makeCircle({
    title: 'Inlet circle', urlName: 'inlet', createdBy: 'Nell',
    invitedEmails: ['mara@threshold.dev'], requireInvitation: true,
    memberNames: ['Nell'],
  });
  await topic(inlet, 'Nell', 'Being new somewhere', 'Opening', 'Unmooring');

  for (const u of URL_NAMES) {
    const c = await Circle.findOne({ instanceId: instance.id, urlName: u });
    const liveSeed = circles.activeSeed(c);
    console.log(`/c/${u}  members=${c.members.length}  phase=${c.phase}` +
      (liveSeed ? `  live="${liveSeed.payload.topic}" (${liveSeed.phase})` : ''));
  }
  console.log('\nsign in: mara@threshold.dev / threshold123 (also ivo@, nell@ — from seed-threshold-dev.js)');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\nFAILED:', err.message);
  await mongoose.disconnect();
  process.exit(1);
});
