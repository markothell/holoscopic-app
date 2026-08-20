// Real-DB check of THE access predicate (routes/synthesis.js#requireMember).
//
// The predicate is the only thing between one group's document and another's,
// and it spans three collections — SynMembership, Circle.seeds, Instance — so
// a unit test over fakes proves the least interesting half. This exercises the
// real Mongo query, including the $elemMatch that has to match activity AND
// payload.ideaId on the SAME seed. A query matching them on DIFFERENT seeds
// would hand every circle member every idea any circle ever shared.
//
//   node scripts/check-synthesis-access.js       # dev only; refuses production
const envFile = '.env.local';
require('dotenv').config({ path: require('node:path').join(__dirname, '..', envFile) });
const mongoose = require('mongoose');
const crypto = require('node:crypto');

const id = () => crypto.randomUUID().substring(0, 8);
let passed = 0;
const fails = [];
function check(label, cond) {
  if (cond) { console.log(`  ✔ ${label}`); passed++; }
  else { console.log(`  ✘ ${label}`); fails.push(label); }
}

(async () => {
  if (process.env.NODE_ENV === 'production') throw new Error('This script writes test rows. Dev only.');
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  const db = process.env.MONGODB_URI.match(/\/([^/?]+)\?/)[1];
  if (db === 'holoscopic-db') throw new Error('That is the production database. Refusing.');
  console.log(`db: ${db}\n`);

  const Circle = require('../models/Circle');
  const SynMembership = require('../models/SynMembership');

  const IDEA = `idea_${id()}`;
  const OTHER_IDEA = `idea_${id()}`;
  const inCircle = `u_${id()}`;
  const stranger = `u_${id()}`;
  const joiner = `u_${id()}`;
  const made = { circles: [], memberships: [] };

  // The same query routes/synthesis.js#circleGrantsAccess runs.
  const grants = async (instanceId, userId) => Boolean(await Circle.findOne({
    'members.userId': userId,
    seeds: { $elemMatch: { activity: 'synthesis', 'payload.ideaId': instanceId } },
  }).select('id').lean());

  try {
    const circle = await Circle.create({
      id: id(), instanceId: 'inst_test', activity: 'threshold',
      title: 'Access check', urlName: `access-${id()}`,
      createdBy: inCircle, status: 'running', phase: 'idle',
      members: [{ userId: inCircle, username: 'In' }],
      seeds: [{
        id: id(), authorId: inCircle, order: 0, activity: 'synthesis',
        payload: { ideaId: IDEA, title: 'Shared doc', topic: 'Shared doc' },
        phase: 'nominated', supporterIds: [inCircle],
      }],
    });
    made.circles.push(circle.id);

    console.log('the predicate:');
    check('a circle member reaches a document their circle holds', await grants(IDEA, inCircle));
    check('someone in no such circle does NOT', !(await grants(IDEA, stranger)));
    check('a circle member does NOT reach an idea nobody shared', !(await grants(OTHER_IDEA, inCircle)));

    // THE ONE THAT MATTERS. Two seeds: a Threshold topic, and a synthesis seed
    // for a DIFFERENT idea. If the query matched its two conditions across
    // separate array elements, OTHER_IDEA would come back accessible.
    console.log('\n$elemMatch, not two independent array conditions:');
    const mixed = await Circle.create({
      id: id(), instanceId: 'inst_test', activity: 'threshold',
      title: 'Mixed', urlName: `mixed-${id()}`,
      createdBy: inCircle, status: 'running', phase: 'idle',
      members: [{ userId: joiner, username: 'J' }],
      seeds: [
        { id: id(), authorId: joiner, order: 0, activity: null,
          payload: { ideaId: OTHER_IDEA, topic: 'a threshold topic that happens to carry an ideaId' },
          phase: 'pending', supporterIds: [joiner] },
        { id: id(), authorId: joiner, order: 1, activity: 'synthesis',
          payload: { ideaId: IDEA, title: 'ok', topic: 'ok' }, phase: 'nominated', supporterIds: [joiner] },
      ],
    });
    made.circles.push(mixed.id);
    check('the synthesis seed grants its OWN idea', await grants(IDEA, joiner));
    check('a non-synthesis seed carrying an ideaId grants NOTHING', !(await grants(OTHER_IDEA, joiner)));

    console.log('\nmembership is the other way in, and is not required to read:');
    const m = await SynMembership.create({
      id: id(), instanceId: OTHER_IDEA, userId: stranger, handle: 'Stranger', role: 'member',
    });
    made.memberships.push(m.id);
    check('a joined member holds a row even with no circle', Boolean(
      await SynMembership.findOne({ instanceId: OTHER_IDEA, userId: stranger }),
    ));
    check('a circle reader holds NO row until they contribute', !(
      await SynMembership.findOne({ instanceId: IDEA, userId: inCircle })
    ));

    console.log('\nthe retired handle index is really gone (a second row would collide):');
    const a = await SynMembership.create({ id: id(), instanceId: OTHER_IDEA, userId: `u_${id()}`, handle: 'Same Name', role: 'member' });
    const b = await SynMembership.create({ id: id(), instanceId: OTHER_IDEA, userId: `u_${id()}`, handle: 'Same Name', role: 'member' });
    made.memberships.push(a.id, b.id);
    check('two members of one idea may share a display name', Boolean(a && b));
  } finally {
    await Circle.deleteMany({ id: { $in: made.circles } });
    await SynMembership.deleteMany({ id: { $in: made.memberships } });
    console.log('\nTest data removed.');
  }

  console.log(`\n${passed} checks passed${fails.length ? `, ${fails.length} FAILED` : ''}.`);
  await mongoose.disconnect();
  if (fails.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
