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
//
// Members are created with NO email address on purpose: the circle machine
// mails on every transition, and mail is not what this checks.
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

async function assertRejects(fn, label) {
  try { await fn(); check(label, false); }
  catch { check(label, true); }
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
  const made = { circles: [], memberships: [], instances: [] };

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
    // ---- the share verb, end to end -------------------------------------
    // Everything above tests the predicate. This tests the path that creates
    // what the predicate reads: the real funnel, the real module, the real
    // Mongoose schema. A unit test over fakes cannot see the schema, and
    // seeds[].phase accepting 'nominated' is exactly the kind of thing it
    // would miss (apps/backend/CLAUDE.md says so in as many words).
    console.log('\nthe share verb, through the real funnel and schema:');
    // Both modules: the circle's own activity has to be registered too, or
    // createCircle refuses it. Requiring threshold's ROUTER is what registers
    // it, exactly as websocket-server.js does.
    require('../utils/synthesisActivity');
    require('../routes/threshold');
    const circlesFunnel = require('../utils/circles');
    const synIdeas = require('../utils/synIdeas');

    const author = `u_${id()}`;
    const backer = `u_${id()}`;
    const { instance: idea, membership: authorRow } = await synIdeas.createIdea({
      userId: author, displayName: 'Author', title: `Access check doc ${id()}`,
    });
    made.memberships.push(authorRow.id);
    made.instances.push(idea.id);

    const live = await circlesFunnel.createCircle({
      instanceId: 'inst_test', activity: 'threshold',
      title: 'Share flow', urlName: `share-${id()}`,
      createdBy: author, creatorName: 'Author', creatorEmail: '',
      mode: 'circle', requireInvitation: false, config: {},
    });
    made.circles.push(live.id);
    await circlesFunnel.joinCircle({
      circleId: live.id, userId: backer, username: 'Backer', email: '',
    });
    await circlesFunnel.startCircle({ circleId: live.id, userId: author });

    const { circle: shared } = await circlesFunnel.addSeed({
      circleId: live.id, userId: author,
      payload: { ideaId: idea.id }, activity: 'synthesis',
    });
    const seed = shared.seeds[0];
    check('sharing writes a seed the schema accepts, in phase nominated', seed.phase === 'nominated');
    check('the payload points at the idea and snapshots its title',
      seed.payload.ideaId === idea.id && Boolean(seed.payload.title));
    check('a nomination does NOT open a cycle in an idle circle',
      shared.phase === 'idle' && circlesFunnel.liveSeeds(shared).length === 0);
    check('the circle now grants its members access to that document',
      await grants(idea.id, backer));

    const { accepted } = await circlesFunnel.supportSeed({
      circleId: live.id, seedId: seed.id, userId: backer,
    });
    const after = await circlesFunnel.mongoStore.findCircleById(live.id);
    check('a second person backing it accepts it into the queue', accepted === true);
    check('and it opens, since nothing else was running', after.seeds[0].phase === 'exploring');

    await assertRejects(
      () => circlesFunnel.addSeed({
        circleId: live.id, userId: backer, payload: { ideaId: idea.id }, activity: 'synthesis',
      }),
      'sharing a document you are not part of is refused',
    );
  } finally {
    if (made.instances.length) {
      await require('../models/Instance').deleteMany({ id: { $in: made.instances } });
      await require('../models/SynNode').deleteMany({ instanceId: { $in: made.instances } });
    }
    await Circle.deleteMany({ id: { $in: made.circles } });
    await SynMembership.deleteMany({ id: { $in: made.memberships } });
    console.log('\nTest data removed.');
  }

  console.log(`\n${passed} checks passed${fails.length ? `, ${fails.length} FAILED` : ''}.`);
  await mongoose.disconnect();
  if (fails.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
