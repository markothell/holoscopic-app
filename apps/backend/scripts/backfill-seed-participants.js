#!/usr/bin/env node
// Gives seeded sample activities the participant rows their own entries imply.
//
//   node scripts/backfill-seed-participants.js                   # dev, dry run
//   node scripts/backfill-seed-participants.js --write           # dev, apply
//   NODE_ENV=production node scripts/backfill-seed-participants.js --instance g1 --write
//
// The sample data for interView (g1) and the Relationship Blueprint sequence
// was written entry-first: utils/entries.js got 95 rows, and Activity.participants
// was never filled in to match. Two surfaces read that array and both then
// advertise the gap rather than the content:
//
//   InterViewHub.tsx:871      `${a.participants?.length ?? 0}/${maxEntries} joined`
//   routes/sequences.js:108   participants: activity.participants.length
//
// which render as "0/1 joined · settled" on a map holding six answers, and
// "0 participants · 6 mappings" eight times down the sequence page. maxEntries
// is the other half: every seeded activity carries 1 while holding six to nine
// entries, so populating participants alone would read "6/1 joined" — worse.
// Both fields are set here, together, or the display stays incoherent.
//
// This writes no entries. It derives participants from the entries that already
// exist and never invents an author: the roster is exactly the distinct userIds
// found in the entries collection for that activity, so the count can only ever
// equal the number of people who actually left something.
//
// Safe to re-run; reports every change before making it.
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
require('dotenv').config({ path: require('node:path').join(__dirname, '..', envFile) });

const mongoose = require('mongoose');
const Instance = require('../models/Instance');
const Activity = require('../models/Activity');
const Entry = require('../models/Entry');

const WRITE = process.argv.includes('--write');
const slugArg = process.argv.indexOf('--instance');
const SLUG = slugArg > -1 ? process.argv[slugArg + 1] : 'g1';

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('No MONGODB_URI'); process.exit(1); }

// Host and database name both, per CLAUDE.md — `holoscopic-db` means production
// whatever else the connection string says.
const host = (uri.match(/@([^/?]+)/) || [])[1];
const dbName = (uri.match(/\/([^/?]+)\?/) || [])[1];

async function main() {
  console.log(`cluster : ${host}`);
  console.log(`database: ${dbName}`);
  console.log(`instance: ${SLUG}`);
  console.log(`mode    : ${WRITE ? 'WRITE' : 'dry run'}\n`);

  await mongoose.connect(uri);

  const instance = await Instance.findOne({ slug: SLUG }).lean();
  if (!instance) { console.error(`No instance with slug "${SLUG}"`); process.exit(1); }

  const activities = await Activity.find({ instanceId: instance.id });
  if (!activities.length) { console.log('No activities on this instance.'); return; }

  let changed = 0;

  for (const activity of activities) {
    // One row per distinct author, first appearance wins the display name.
    const entries = await Entry.find({ activityId: activity.id }).lean();
    const authors = new Map();
    for (const e of entries) {
      if (!authors.has(e.userId)) authors.set(e.userId, e.username || 'Example Data');
    }
    if (authors.size === 0) continue;

    const before = {
      participants: activity.participants.map(p => p.id),
      maxEntries: activity.maxEntries,
    };
    const after = {
      participants: [...authors.keys()],
      maxEntries: authors.size,
    };

    const same = before.maxEntries === after.maxEntries
      && before.participants.length === after.participants.length
      && before.participants.every(id => authors.has(id));
    if (same) continue;

    // Dropped ids are rows for people who joined and left nothing — the owner
    // opening a seeded activity. Named here because the count is the point.
    const dropped = before.participants.filter(id => !authors.has(id));

    console.log(`${activity.urlName}`);
    console.log(`  entries      ${entries.length}`);
    console.log(`  participants ${before.participants.length} -> ${after.participants.length}${dropped.length ? `  (dropping ${dropped.join(', ')})` : ''}`);
    console.log(`  maxEntries   ${before.maxEntries} -> ${after.maxEntries}`);

    if (WRITE) {
      activity.participants = [...authors.entries()].map(([id, username]) => ({
        id, username, joinedAt: activity.createdAt || new Date(),
      }));
      activity.maxEntries = after.maxEntries;
      await activity.save();
    }
    changed++;
  }

  console.log(`\n${changed} activit${changed === 1 ? 'y' : 'ies'} ${WRITE ? 'updated' : 'would change'}.`);
  if (!WRITE && changed) console.log('Re-run with --write to apply.');
}

main()
  .then(() => mongoose.disconnect())
  .catch(err => { console.error(err); process.exit(1); });
