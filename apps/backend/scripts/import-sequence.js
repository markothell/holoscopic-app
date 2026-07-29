#!/usr/bin/env node
// Import a sequence-with-activities JSON (the /api/import/sequence shape:
// { sequence: {...}, activities: [...] } with _ref/parentActivityRefs and
// optional starterData that becomes isSeed entries) into a running backend.
//
//   node scripts/import-sequence.js <file.json> <userId> [instanceSlug] [apiUrl] [--publish]
//
// Examples:
//   node scripts/import-sequence.js ~/blueprint.json abc12345
//   node scripts/import-sequence.js ~/blueprint.json abc12345 g1 https://api.example.com/api --publish
//
// Default: the sequence arrives as a draft owned by <userId>, publishable
// from the sequence builder. --publish imports straight to public (active
// sequence, non-draft activities) — for demo/sample content.
//
// <userId> must be an admin: /api/import/sequence is behind requireAdmin now
// (it used to accept any non-empty x-user-id, unverified, which made it an
// unauthenticated way to publish content into any instance). This script
// signs a short-lived token with GAME_TOKEN_SECRET from the backend env.
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
require('dotenv').config({ path: require('path').join(__dirname, '..', envFile) });
const fs = require('fs');
const { authHeaders } = require('./lib/adminToken');

async function main() {
  const args = process.argv.slice(2);
  const publish = args.includes('--publish');
  const [file, userId, instanceId = 'g1', apiUrl = 'http://localhost:4001/api'] =
    args.filter(a => a !== '--publish');
  if (!file || !userId) {
    console.error('Usage: node scripts/import-sequence.js <file.json> <userId> [instanceSlug] [apiUrl] [--publish]');
    process.exit(1);
  }
  const payload = { ...JSON.parse(fs.readFileSync(file, 'utf8')), publish };
  const res = await fetch(`${apiUrl}/import/sequence`, {
    method: 'POST',
    headers: {
      ...authHeaders(userId),
      'x-instance-id': instanceId,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  console.log(`✓ Imported "${payload.sequence.title}" — ${json.activityCount} activities`);
  console.log(`  sequence: /sequence/${json.sequenceUrlName} (${publish ? 'PUBLIC + active' : 'draft'}, owned by ${userId})`);
}

main().catch(err => { console.error('✗', err.message); process.exit(1); });
