#!/usr/bin/env node
// Import a sequence-with-activities JSON (the /api/import/sequence shape:
// { sequence: {...}, activities: [...] } with _ref/parentActivityRefs and
// optional starterData that becomes isSeed entries) into a running backend.
//
//   node scripts/import-sequence.js <file.json> <userId> [instanceSlug] [apiUrl]
//
// Examples:
//   node scripts/import-sequence.js ~/blueprint.json abc12345
//   node scripts/import-sequence.js ~/blueprint.json abc12345 g1 https://api.example.com/api
//
// The sequence arrives as a draft owned by <userId>; publish it from the
// sequence builder when ready.
const fs = require('fs');

async function main() {
  const [file, userId, instanceId = 'g1', apiUrl = 'http://localhost:4001/api'] = process.argv.slice(2);
  if (!file || !userId) {
    console.error('Usage: node scripts/import-sequence.js <file.json> <userId> [instanceSlug] [apiUrl]');
    process.exit(1);
  }
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  const res = await fetch(`${apiUrl}/import/sequence`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId,
      'x-instance-id': instanceId,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  console.log(`✓ Imported "${payload.sequence.title}" — ${json.activityCount} activities`);
  console.log(`  sequence: /sequence/${json.sequenceUrlName} (draft, owned by ${userId})`);
}

main().catch(err => { console.error('✗', err.message); process.exit(1); });
