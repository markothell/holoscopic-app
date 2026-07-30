// Pre-launch reset: clears all game data while keeping user accounts, then
// seeds the first interView game instance (slug g1) and re-grants every
// existing user a fresh membership + starting stake in it.
//
// Holoscopic is the platform; instances are games. This removes the legacy
// "Holoscopic (slug=default)" instance document along with everything else.
//
// Usage: node scripts/reset-db-for-launch.js --yes --db=<database-name>
//
// --db must exactly match the database in MONGODB_URI. `--yes` alone is not
// enough: the destructive part of this script is identical whether the URI
// points at localhost or production, and the URI comes from whichever .env
// file NODE_ENV happens to select. Naming the target is the only step that
// cannot be performed by accident.
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
require('dotenv').config({ path: envFile });
const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set.');
  process.exit(1);
}

// Same extraction the server uses at startup.
const dbMatch = uri.match(/\/([^/?]+)(\?|$)/);
const targetDb = dbMatch ? dbMatch[1] : null;

if (!process.argv.includes('--yes')) {
  console.log(`This clears ALL game data (keeps users) in "${targetDb}".`);
  console.log(`Re-run with: --yes --db=${targetDb}`);
  process.exit(1);
}

const dbArg = (process.argv.find(a => a.startsWith('--db=')) || '').slice(5);
if (!dbArg || dbArg !== targetDb) {
  console.error(`Refusing to run: --db must exactly match the database in MONGODB_URI.`);
  console.error(`  MONGODB_URI database: ${targetDb}`);
  console.error(`  --db argument:        ${dbArg || '(missing)'}`);
  process.exit(1);
}

console.log(`⚠️  Clearing game data in database "${targetDb}"`);

// Game-data collections to drop. Kept: users, waitlists, signups.
const CLEAR = [
  'activities',
  'entries',
  'topics',
  'algorithms',
  'algorithmproposals',
  'holontransactions',
  'instancememberships',
  'sequences',
  'frameofreferences',
  'framenominations',
  'notifications',
  'instances',
  'adminconfigs', // legacy per-app config; instance config lives on Instance now
  'spectrumgames', // On the Spectrum rooms (entries are already cleared above)
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const existing = new Set((await db.listCollections().toArray()).map(c => c.name));

  for (const name of CLEAR) {
    if (!existing.has(name)) continue;
    const { deletedCount } = await db.collection(name).deleteMany({});
    console.log(`cleared ${name}: ${deletedCount} docs`);
  }

  const Instance = require('../models/Instance');
  const User = require('../models/User');
  const InstanceMembership = require('../models/InstanceMembership');

  const g1 = await Instance.create({
    id: require('crypto').randomUUID().substring(0, 8),
    name: 'interView',
    slug: 'g1',
    gameNumber: 1,
    domains: ['holoscopic.io', 'www.holoscopic.io', 'localhost', 'localhost:3000', '127.0.0.1', '127.0.0.1:3000'],
    active: true,
  });
  console.log(`created instance: ${g1.name} (id=${g1.id}, slug=${g1.slug}, gameNumber=${g1.gameNumber})`);

  // Membership + starting stake for every kept account (normally granted at
  // signup; these users already signed up, so re-grant here)
  const startingStake = g1.config?.holons?.startingStake ?? 100;
  const users = await User.find({}).select('id name email').lean();
  for (const u of users) {
    // getOrCreate, not create: it is the single grant point that writes the
    // matching `join_bonus` HolonTransaction alongside the balance.
    // Creating the membership directly left four accounts holding ◈100 with
    // no ledger row behind it — scripts/verify-ledger.js flags exactly that,
    // and root CLAUDE.md's rule is that balances never move outside
    // utils/holons.js.
    await InstanceMembership.getOrCreate(u.id, g1.id);
  }
  console.log(`granted ${users.length} users membership in g1 with ◈${startingStake} starting stake`);
  console.log('\nNote: when deploying, add the production game domain to this instance\'s domains[].');

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
