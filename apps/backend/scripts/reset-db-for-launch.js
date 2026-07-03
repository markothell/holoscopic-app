// Pre-launch reset: clears all game data while keeping user accounts, then
// seeds the first interView game instance (slug g1) and re-grants every
// existing user a fresh membership + starting stake in it.
//
// Holoscopic is the platform; instances are games. This removes the legacy
// "Holoscopic (slug=default)" instance document along with everything else.
//
// Usage: node scripts/reset-db-for-launch.js --yes
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
require('dotenv').config({ path: envFile });
const mongoose = require('mongoose');

if (!process.argv.includes('--yes')) {
  console.log('This clears ALL game data (keeps users). Re-run with --yes to proceed.');
  process.exit(1);
}

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
    domains: ['localhost', 'localhost:3000', '127.0.0.1', '127.0.0.1:3000'],
    active: true,
  });
  console.log(`created instance: ${g1.name} (id=${g1.id}, slug=${g1.slug}, gameNumber=${g1.gameNumber})`);

  // Membership + starting stake for every kept account (normally granted at
  // signup; these users already signed up, so re-grant here)
  const startingStake = g1.config?.holons?.startingStake ?? 100;
  const users = await User.find({}).select('id name email').lean();
  for (const u of users) {
    await InstanceMembership.create({
      id: Math.random().toString(36).substring(2, 10),
      userId: u.id,
      instanceId: g1.id,
      holonBalance: startingStake,
    });
  }
  console.log(`granted ${users.length} users membership in g1 with ◈${startingStake} starting stake`);
  console.log('\nNote: when deploying, add the production game domain to this instance\'s domains[].');

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
