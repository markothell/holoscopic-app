// One-off: turn D17's stamped sessions into ordinary circle seeds.
//
// Until 2026-08-20 a circle owned a synthesis session by stamping the idea's
// Instance with `config.synthesis.circleId`. Synthesis is a registered circle
// activity now, so the relationship runs the other way: the CIRCLE holds a
// seed whose payload points at the idea. This walks the stamped instances and
// writes that seed.
//
// The new seed lands in phase 'nominated' — shared with the circle and open to
// read and contribute, but not in the queue. That is exactly what a stamped
// session already was (it had no phase, no queue position and no cycle), so
// nothing gains or loses access here. Somebody supporting it accepts it into
// the queue, like any other nomination.
//
// The stamp is LEFT IN PLACE. It costs nothing, it is the only record of where
// a seed came from if this needs unpicking, and removing it is a separate
// decision from adding the seed. Re-running is safe: a circle that already has
// a seed for an idea is skipped.
//
//   node scripts/migrate-synthesis-sessions.js                 # dev, dry run
//   node scripts/migrate-synthesis-sessions.js --write         # dev, apply
//   NODE_ENV=production node scripts/migrate-synthesis-sessions.js --write
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
require('dotenv').config({ path: require('node:path').join(__dirname, '..', envFile) });
const mongoose = require('mongoose');
const crypto = require('node:crypto');

const WRITE = process.argv.includes('--write');

(async () => {
  // autoIndex OFF — apps/backend/CLAUDE.md: requiring a model otherwise builds
  // every declared index against whatever cluster this happens to point at.
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  const uri = process.env.MONGODB_URI;
  console.log(`cluster: ${uri.match(/@([^/?]+)/)[1]}  db: ${uri.match(/\/([^/?]+)\?/)[1]}`);
  console.log(WRITE ? 'MODE: WRITE\n' : 'MODE: DRY RUN (pass --write to apply)\n');

  const Instance = require('../models/Instance');
  const Circle = require('../models/Circle');

  const stamped = await Instance.find({ 'config.synthesis.circleId': { $exists: true, $ne: null } });
  console.log(`stamped sessions found: ${stamped.length}`);

  let made = 0, skipped = 0, orphaned = 0;
  for (const idea of stamped) {
    const circleId = idea.config.synthesis.circleId;
    const circle = await Circle.findOne({ id: circleId });
    if (!circle) {
      console.log(`  ORPHAN  "${idea.name}" points at circle ${circleId}, which is gone`);
      orphaned++;
      continue;
    }
    const already = circle.seeds.some(s => s.activity === 'synthesis' && s.payload && s.payload.ideaId === idea.id);
    if (already) {
      console.log(`  skip    "${idea.name}" — ${circle.title} already holds a seed for it`);
      skipped++;
      continue;
    }

    const title = String(idea.name || 'Untitled idea').slice(0, 120);
    const seed = {
      id: crypto.randomUUID().substring(0, 8),
      // The idea's creator is the admin membership; fall back to the circle's
      // creator so the seed always has an author who can close it.
      authorId: circle.createdBy,
      order: circle.seeds.length,
      activity: 'synthesis',
      payload: {
        ideaId: idea.id,
        ideaCode: String(idea.slug || '').replace(/^idea-/, ''),
        title,
        topic: title,
      },
      phase: 'nominated',
      supporterIds: [circle.createdBy],
      promotedAt: null,
      notifiedPhases: [],
    };
    console.log(`  CREATE  seed in "${circle.title}" -> "${title}" (${idea.id})`);
    if (WRITE) {
      circle.seeds.push(seed);
      await circle.save();
    }
    made++;
  }

  console.log(`\ncreated: ${made}  skipped: ${skipped}  orphaned: ${orphaned}`);
  if (!WRITE && made) console.log('Nothing was written. Rerun with --write.');
  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
