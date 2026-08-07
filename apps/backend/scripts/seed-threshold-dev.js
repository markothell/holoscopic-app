#!/usr/bin/env node
// A Threshold instance and one circle, in a state that exercises every band of
// /t/<urlName> at once: a live cycle mid-sort with stories waiting, a queue
// with uneven support and a promotion, and a record holding one revealed topic
// and one skipped one.
//
//   node scripts/seed-threshold-dev.js            create/refresh
//   node scripts/seed-threshold-dev.js --clear    remove the circle
//
// WHY THIS EXISTS. Every surface in this app renders a state the round machine
// produces, and most of those states take three people and two phase
// transitions to reach. Building one by hand against the collections is how you
// get a circle the machine could never have made — a live seed that is not
// `liveSeedId`, a revealed seed with no result, a ranking that skipped the
// completeness check — and then a day spent debugging the page instead of the
// data. So this drives utils/circles.js and utils/threshold.js, the same
// funnels the REST surface drives, and never writes a collection directly.
//
// Dev only, by database name and by NODE_ENV, and it removes its own circle
// before rebuilding. It leaves the instance and the users alone, because signing
// in again on every run is friction with nothing to show for it.

require('dotenv').config({ path: `${__dirname}/../.env.local` });

const mongoose = require('mongoose');

const Instance = require('../models/Instance');
const User = require('../models/User');
const Circle = require('../models/Circle');
const ThresholdShare = require('../models/ThresholdShare');
const ThresholdRanking = require('../models/ThresholdRanking');
const circles = require('../utils/circles');
const threshold = require('../utils/threshold');

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('No MONGODB_URI'); process.exit(1); }

const dbName = (uri.match(/\/([^/?]+)\?/) || [])[1];
const host = (uri.match(/@([^/?]+)/) || [])[1];

// holoscopic-db means PRODUCTION whatever else the connection string says.
if (dbName !== 'holoscopic-dev' || process.env.NODE_ENV === 'production') {
  console.error(`REFUSING: this writes fixture data. Expected holoscopic-dev, got ${dbName} on ${host}.`);
  process.exit(1);
}

const SLUG = 'threshold';
const URL_NAME = 'tuesday';
const PASSWORD = 'threshold123';
const PEOPLE = [
  { id: 'thr-dev-1', name: 'Mara', email: 'mara@threshold.dev' },
  { id: 'thr-dev-2', name: 'Ivo', email: 'ivo@threshold.dev' },
  { id: 'thr-dev-3', name: 'Nell', email: 'nell@threshold.dev' },
];

// Real Mongo for everything; mail and notifications stubbed, because these
// addresses are invented and nobody should be sending to them.
const store = { ...threshold.mongoStore, async sendEmail() {}, async notify() {} };

// Stories carry NO author name in their text. The ranking surface withholds
// attribution server-side (D9), and fixture text that names its teller makes a
// working redaction look broken every time somebody screenshots the page.
const STORIES = {
  needed: [
    'My sister called at eleven on a Tuesday and talked for an hour, and I put the kettle on and stayed up, and slept badly, and would do it again.',
    'For about four years I was the one everybody rang first. I did not notice what it cost until it stopped.',
    'Being the person who fixes things is lovely right up until nobody asks how you are, because you are the one who asks.',
  ],
  watched: [
    'The week the dashboard went up I stopped guessing whether I was doing enough. I could see it. That turned out to be a relief.',
    'Someone started forwarding the weekly numbers to the whole team. By Friday I was writing emails I did not need to send, so they would land in the log.',
    'My manager watches closely and says so, and it is the only job where I have known where I stand.',
  ],
  saying_no: [
    'I said no to a wedding I could not afford and told the truth about why, and it was over in a sentence.',
  ],
};

async function clearCircle(instanceId) {
  const mine = await Circle.find({ instanceId, urlName: URL_NAME }).lean();
  const seedIds = mine.flatMap(c => c.seeds.map(s => s.id));
  await Promise.all([
    Circle.deleteMany({ instanceId, urlName: URL_NAME }),
    ThresholdShare.deleteMany({ seedId: { $in: seedIds } }),
    ThresholdRanking.deleteMany({ seedId: { $in: seedIds } }),
  ]);
}

async function main() {
  // Scripts connect with autoIndex:false, always — requiring a model otherwise
  // builds every declared index on whatever database this is pointed at.
  await mongoose.connect(uri, { autoIndex: false });
  console.log(`connected: ${host} / ${dbName}`);

  let instance = await Instance.findOne({ slug: SLUG });
  if (!instance) {
    instance = await Instance.create({
      id: 'thr' + Math.random().toString(36).slice(2, 7),
      slug: SLUG,
      name: 'Threshold',
      // Read this field, never infer it — routes/threshold.js 404s anything
      // whose instance is not a threshold one.
      app: 'threshold',
      // No holon economy (D7). And gameNumber MUST stay null: getDefault()
      // picks the lowest-numbered active instance, so a Threshold instance
      // holding a number can start answering interView traffic.
      mode: 'explore',
      gameNumber: null,
      active: true,
    });
    console.log(`created instance ${instance.id} (${instance.slug})`);
  } else {
    console.log(`instance ${instance.id} (${instance.slug}) app=${instance.app}`);
  }

  await clearCircle(instance.id);
  if (process.argv.includes('--clear')) {
    console.log('circle removed.');
    return mongoose.disconnect();
  }

  for (const p of PEOPLE) {
    let u = await User.findOne({ id: p.id });
    if (!u) u = new User({ id: p.id, email: p.email, password: PASSWORD, name: p.name });
    u.isVerified = true;
    u.emailVerified = true;
    await u.save();
  }

  const [host_, ...rest] = PEOPLE;
  const circle = await circles.createCircle({
    store,
    instanceId: instance.id,
    activity: 'threshold',
    title: 'Tuesday circle',
    urlName: URL_NAME,
    createdBy: host_.id,
    creatorName: host_.name,
    creatorEmail: host_.email,
    requireInvitation: false,
  });
  for (const p of rest) {
    await circles.joinCircle({ store, circleId: circle.id, userId: p.id, username: p.name, email: p.email });
  }
  await circles.startCircle({ store, circleId: circle.id, userId: host_.id });

  // addSeed loads its own document from the store, so the handle returned by
  // createCircle goes stale the moment anything writes. Read the seed off what
  // evaluate() hands back.
  const topic = async (userId, t, a, b) => {
    const { circle: doc } = await circles.addSeed({
      store, circleId: circle.id, userId, payload: { topic: t, poleA: a, poleB: b },
    });
    return doc.seeds[doc.seeds.length - 1];
  };
  const tellAll = async (seed, texts, poleOf) => {
    for (const [i, p] of PEOPLE.entries()) {
      await threshold.submitShare({
        store, circleId: circle.id, seedId: seed.id, userId: p.id, username: p.name,
        pole: poleOf(i), text: texts[i],
      });
    }
  };

  // 1. A topic that ran all the way through — the record.
  const first = await topic(host_.id, 'Being needed', 'Nourishing', 'Draining');
  await tellAll(first, STORIES.needed, i => (i === 2 ? 'B' : 'A'));
  const firstShares = (await store.listShares(first.id)).map(s => s.id);
  for (const [i, p] of PEOPLE.entries()) {
    await threshold.submitRanking({
      store, circleId: circle.id, seedId: first.id, userId: p.id,
      // Agreement 1.00 / 0.67 / 0.00 — one at each pole and one the group split
      // on, so the reveal has something to show at every band.
      placements: firstShares.map((id, n) => ({ shareId: id, pole: n === 2 || (n === 1 && i === 2) ? 'B' : 'A' })),
    });
  }

  // 2. A topic the facilitator moved past. It keeps the story it had.
  const second = await topic(rest[0].id, 'Saying no', 'Clean', 'Costly');
  await threshold.submitShare({
    store, circleId: circle.id, seedId: second.id, userId: rest[0].id, username: rest[0].name,
    pole: 'A', text: STORIES.saying_no[0],
  });
  await circles.skipSeed({ store, circleId: circle.id, userId: host_.id });

  // 3. The live cycle, at rank with nobody having sorted — so every story reads
  //    as waiting on whoever opens the page, except their own (D22).
  const live = await topic(rest[1].id, 'Being watched at work', 'Steadying', 'Suffocating');
  await tellAll(live, STORIES.watched, i => (i === 0 ? 'B' : 'A'));

  // 4. The queue: uneven support, and one the facilitator pushed to the front.
  const q1 = await topic(rest[0].id, 'Keeping the peace', 'Kind', 'Cowardly');
  const q2 = await topic(host_.id, 'Being told what to do', 'Restful', 'Diminishing');
  const q3 = await topic(rest[1].id, 'Money between friends', 'Ordinary', 'Corrosive');
  await circles.supportSeed({ store, circleId: circle.id, seedId: q1.id, userId: host_.id });
  await circles.supportSeed({ store, circleId: circle.id, seedId: q1.id, userId: rest[1].id });
  await circles.supportSeed({ store, circleId: circle.id, seedId: q2.id, userId: rest[0].id });
  await circles.promoteSeed({ store, circleId: circle.id, seedId: q3.id, userId: host_.id });

  const fresh = await Circle.findOne({ id: circle.id });
  const liveSeed = circles.activeSeed(fresh);
  console.log(`\n/t/${URL_NAME}  phase=${fresh.phase}  live="${liveSeed?.payload.topic}" (${liveSeed?.phase})`);
  console.log('queue:  ', circles.queue(fresh).map(s => `${s.payload.topic} [${s.supporterIds.length}${s.promotedAt ? ', promoted' : ''}]`).join('  |  '));
  console.log('record: ', fresh.seeds.filter(s => circles.DONE_PHASES.includes(s.phase)).map(s => `${s.payload.topic} (${s.phase})`).join('  |  '));
  console.log(`\ninstance: ${instance.id} / ${instance.slug}`);
  console.log(`sign in:  ${PEOPLE[0].email} / ${PASSWORD}   (also ${PEOPLE[1].email}, ${PEOPLE[2].email})`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\nFAILED:', err.message);
  await mongoose.disconnect();
  process.exit(1);
});
