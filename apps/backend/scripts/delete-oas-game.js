#!/usr/bin/env node
// Removes one On a Spectrum room and everything hanging off it.
//
//   node scripts/delete-oas-game.js CDLAU                    # dev, dry run
//   node scripts/delete-oas-game.js CDLAU --write            # dev, apply
//   NODE_ENV=production node scripts/delete-oas-game.js CDLAU --write
//
// A room is not just a Game row: utils/oasGames.js provisions each one its own
// Instance, slugged `oas-<code>` (that grain is Spectrum's choice — Threshold
// runs every circle inside ONE instance, Spectrum gives every room its own).
// So a room owns five things, and leaving any of them behind leaves an orphan
// the public /games pulse can still count:
//
//   OasGame            the room
//   OasNomination      its proposals, by gameId
//   OasFrame           its frames, by gameId
//   InstanceMembership the seats and their holon balances, by instanceId
//   Instance           the room instance itself
//
// IRREVERSIBLE. Dry run prints the exact counts first, and --write is refused
// unless a code is named — there is no "delete them all" mode on purpose.
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
require('dotenv').config({ path: require('node:path').join(__dirname, '..', envFile) });

const mongoose = require('mongoose');
const Instance = require('../models/Instance');
const OasGame = require('../models/OasGame');
const OasNomination = require('../models/OasNomination');
const OasFrame = require('../models/OasFrame');
const InstanceMembership = require('../models/InstanceMembership');

const WRITE = process.argv.includes('--write');
const CODE = (process.argv[2] || '').toUpperCase();

if (!CODE || CODE.startsWith('--')) {
  console.error('Name the room code: node scripts/delete-oas-game.js CDLAU');
  process.exit(1);
}

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('No MONGODB_URI'); process.exit(1); }
const host = (uri.match(/@([^/?]+)/) || [])[1];
const dbName = (uri.match(/\/([^/?]+)\?/) || [])[1];

async function main() {
  console.log(`cluster : ${host}`);
  console.log(`database: ${dbName}`);
  console.log(`room    : ${CODE}`);
  console.log(`mode    : ${WRITE ? 'WRITE — irreversible' : 'dry run'}\n`);

  await mongoose.connect(uri, { autoIndex: false });

  const game = await OasGame.findOne({ code: CODE }).lean();
  if (!game) { console.log(`No room with code ${CODE}. Nothing to do.`); return; }

  const instance = await Instance.findOne({ id: game.instanceId }).lean();

  const [nominations, frames, memberships] = await Promise.all([
    OasNomination.countDocuments({ gameId: game.id }),
    OasFrame.countDocuments({ gameId: game.id }),
    InstanceMembership.countDocuments({ instanceId: game.instanceId }),
  ]);

  console.log(`  topic        "${game.topic}"`);
  console.log(`  phase        ${game.phase}`);
  console.log(`  maps         ${(game.maps || []).length}`);
  console.log(`  players      ${(game.participants || []).length}`);
  console.log(`  created      ${game.createdAt ? new Date(game.createdAt).toISOString().slice(0, 10) : '?'}`);
  console.log(`\n  will delete:`);
  console.log(`    OasGame            1  (${game.id})`);
  console.log(`    OasNomination      ${nominations}`);
  console.log(`    OasFrame           ${frames}`);
  console.log(`    InstanceMembership ${memberships}`);
  console.log(`    Instance           ${instance ? `1  (${instance.slug})` : '0  (already gone)'}`);

  if (!WRITE) {
    console.log('\nDry run. Re-run with --write to apply.');
    return;
  }

  await Promise.all([
    OasNomination.deleteMany({ gameId: game.id }),
    OasFrame.deleteMany({ gameId: game.id }),
    InstanceMembership.deleteMany({ instanceId: game.instanceId }),
  ]);
  await OasGame.deleteOne({ id: game.id });
  if (instance) await Instance.deleteOne({ id: instance.id });

  console.log(`\nRoom ${CODE} deleted.`);
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (err) => { console.error('\nFAILED:', err.message); await mongoose.disconnect(); process.exit(1); });
