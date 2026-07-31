/**
 * Stamp emailVerified on accounts that predate email verification.
 *
 * `User.emailVerified` has been in the schema since it was written and nothing
 * ever set it, so every account created before 2026-07-31 reads false — not
 * because anyone failed to confirm, but because they were never asked.
 *
 * requireEmailVerified gates joining anything with a membership. Ship that
 * against un-backfilled rows and every existing user is locked out of the
 * thing they were already doing, by a feature that arrived after them. That is
 * the whole reason this script exists, and it has to run BEFORE the middleware
 * reaches production.
 *
 * Scope: accounts with no verification token outstanding, created before the
 * cutoff. An account that HAS a token was created by the new signup path and
 * has genuinely been asked — leave it alone.
 *
 *   node scripts/backfill-email-verified.js                    # dry run, dev
 *   node scripts/backfill-email-verified.js --write            # apply, dev
 *   NODE_ENV=production node scripts/backfill-email-verified.js --write
 *
 * Reads with .lean(): `emailVerified` is declared `default: false`, so a
 * hydrated document reports false whether the field is absent or genuinely
 * false — the same Mongoose-layer fiction that made backfill-instance-app.js
 * report "nothing to change" about the exact rows it existed to fix.
 */

const path = require('path');
const mongoose = require('mongoose');

const isProduction = process.env.NODE_ENV === 'production';
require('dotenv').config({
  path: path.join(__dirname, '..', isProduction ? '.env.production' : '.env.local'),
});

const User = require('../models/User');

// Verification shipped on this date; everything older was never asked.
const CUTOFF = new Date('2026-07-31T00:00:00Z');

async function main() {
  const write = process.argv.includes('--write');
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  await mongoose.connect(uri);
  const host = uri.match(/@([^/?]+)/)[1];
  console.log(`cluster: ${host}`);
  console.log(`db:      ${mongoose.connection.name}`);
  console.log(`mode:    ${write ? 'WRITE' : 'dry run'}\n`);

  const candidates = await User.find({
    emailVerified: { $ne: true },
    verifyTokenHash: { $exists: false },
    createdAt: { $lt: CUTOFF },
  }).select('id email createdAt').lean();

  if (candidates.length === 0) {
    console.log('Nothing to stamp.');
  } else {
    console.log(`${candidates.length} account(s) predating verification:`);
    for (const u of candidates) {
      console.log(`  ${u.id}  ${u.email}  (created ${new Date(u.createdAt).toISOString().slice(0, 10)})`);
    }
  }

  // Reported separately so "why is this one still false" is answerable without
  // reading the query above.
  const asked = await User.countDocuments({ emailVerified: { $ne: true }, verifyTokenHash: { $exists: true } });
  if (asked) console.log(`\n${asked} account(s) left alone — they have a live confirmation link.`);

  if (write && candidates.length) {
    const r = await User.updateMany(
      { id: { $in: candidates.map(u => u.id) } },
      { $set: { emailVerified: true } }
    );
    console.log(`\nstamped ${r.modifiedCount}`);
  } else if (candidates.length) {
    console.log('\nDry run — re-run with --write to apply.');
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
