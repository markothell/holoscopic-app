#!/usr/bin/env node
// Push the backup credentials to Render, both services, in one pass.
//
//   RENDER_API_KEY=rnd_… node scripts/set-render-env.js            # show the diff
//   RENDER_API_KEY=rnd_… node scripts/set-render-env.js --write    # apply it
//
// WHY A SCRIPT. The same five BACKUP_S3_* values belong on the web service (so
// utils/blobMirror.js copies a recording the moment it is made) AND on the
// nightly cron (so scripts/backup-*.js can write at all). Setting seven
// variables across two services by hand is where a typo lives, and a typo here
// produces a backup that looks configured and silently stores nothing — the
// exact failure this whole subsystem exists to prevent. It is also what you
// want when the access key rotates.
//
// ONE API DETAIL WORTH KNOWING. Render exposes two ways to write env vars:
//
//   PUT /v1/services/:id/env-vars          replaces the ENTIRE set
//   PUT /v1/services/:id/env-vars/:key     upserts one key
//
// This uses the second, only ever. The first would take a request that means
// "add five variables" and turn it into "delete MONGODB_URI, CLIENT_URL and
// GAME_TOKEN_SECRET", because they were not in the body. There is no undo.
//
// Values come from apps/backend/.env.local, which is gitignored. Secrets are
// never printed — the diff shows lengths and last-4 only.
//
// Changing an env var makes Render redeploy the service. Expect the backend to
// restart, and see root CLAUDE.md § Working in a Shared Tree for what that
// costs everyone else.
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const WRITE = process.argv.includes('--write');
const API = 'https://api.render.com/v1';

const KEY = process.env.RENDER_API_KEY;
if (!KEY) {
  console.error('FATAL: RENDER_API_KEY is not set.');
  console.error('Create one at https://dashboard.render.com/u/settings#api-keys');
  process.exit(1);
}

// Which variables belong on which service. The overlap is deliberate, not a
// copy-paste slip: the cron writes the nightly backup, the web service writes
// each recording as it arrives, and both need the same bucket.
const S3_VARS = [
  'BACKUP_S3_BUCKET',
  'BACKUP_S3_ENDPOINT',
  'BACKUP_S3_REGION',
  'BACKUP_S3_ACCESS_KEY_ID',
  'BACKUP_S3_SECRET_ACCESS_KEY',
];

// The live service is holoscopic-websocket-server. render.yaml calls it
// holoscopic-socket-server, which is wrong and is fixed there too.
//
// holoscopic-mongo-backup does NOT exist yet — render.yaml declares the cron
// but Render only creates it on a Blueprint deploy. It is marked optional so
// this script can configure the web service today; until that cron exists,
// nothing runs on a schedule.
const PLAN = [
  { service: 'holoscopic-websocket-server', vars: S3_VARS },
  { service: 'holoscopic-mongo-backup', optional: true, vars: [...S3_VARS, 'MONGODB_URI_BACKUP', 'BACKUP_HEARTBEAT_URL'] },
];

const SECRETY = /SECRET|KEY|URI|TOKEN|PASSWORD/;
const show = (name, v) => (SECRETY.test(name) ? `${v.length} chars, ends ${v.slice(-4)}` : v);

async function api(method, urlPath, body) {
  const res = await fetch(`${API}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function findServices() {
  // Render paginates and wraps each row as { service, cursor }.
  const rows = await api('GET', '/services?limit=100');
  const byName = {};
  for (const row of rows) {
    const s = row.service || row;
    if (s && s.name) byName[s.name] = s;
  }
  return byName;
}


async function main() {
  console.log(WRITE ? 'mode: WRITE\n' : 'mode: dry run — pass --write to apply\n');

  const services = await findServices();

  // Resolve everything before writing anything. A run that configures the web
  // service and then discovers the cron does not exist leaves you half done and
  // unsure which half.
  const work = [];
  // Variables that are set locally but have nowhere to go, because the only
  // service that carries them does not exist. Tracked separately so the summary
  // cannot say "nothing to do" about a value the user just went and created.
  const orphaned = [];
  let fatal = false;

  for (const { service, vars, optional } of PLAN) {
    const svc = services[service];
    if (!svc) {
      if (optional) {
        const stranded = vars.filter(v => process.env[v]);
        console.log(`—  ${service} does not exist yet; skipping.`);
        for (const v of stranded) orphaned.push({ service, name: v });
        console.log('   Until it does, no backup runs on a schedule. Create it with a');
        console.log('   Blueprint deploy of render.yaml.\n');
        continue;
      }
      console.error(`✗ no service named "${service}" on this account.`);
      console.error(`  Found: ${Object.keys(services).join(', ') || '(none)'}`);
      fatal = true;
      continue;
    }

    const existing = {};
    for (const row of await api('GET', `/services/${svc.id}/env-vars?limit=100`)) {
      const ev = row.envVar || row;
      existing[ev.key] = ev.value;
    }

    console.log(`${service}  (${svc.id}, ${svc.type})`);
    for (const name of vars) {
      const value = process.env[name];
      if (!value) {
        console.log(`   —  ${name}  NOT SET LOCALLY, skipping`);
        continue;
      }
      const was = existing[name];
      const state = was === undefined ? 'add' : was === value ? 'same' : 'change';
      const mark = { add: '+ ', change: '~ ', same: '   ' }[state];
      console.log(`  ${mark} ${name}  ${state === 'same' ? '(unchanged)' : show(name, value)}`);
      if (state !== 'same') work.push({ service, id: svc.id, name, value });
    }
    console.log('');
  }

  if (fatal) {
    console.error('Nothing was written. Fix the missing service first.');
    process.exit(1);
  }

  // Report the stranded values before the all-clear. "Nothing to do" next to a
  // variable that reached nothing is how a heartbeat URL ends up configured
  // everywhere except the job that was supposed to send it.
  if (orphaned.length) {
    console.log(`⚠️  ${orphaned.length} variable(s) set in .env.local have nowhere to go yet:`);
    for (const o of orphaned) console.log(`     ${o.name}  → ${o.service} (does not exist)`);
    console.log('   Create that service, then re-run this script.\n');
  }

  if (!work.length) {
    console.log(orphaned.length
      ? '✅ Every service that exists matches .env.local.'
      : '✅ Render already matches .env.local — nothing to do.');
    return;
  }

  if (!WRITE) {
    console.log(`${work.length} variable(s) would change. Re-run with --write to apply.`);
    console.log('Note: writing env vars triggers a redeploy of each affected service.');
    return;
  }

  for (const w of work) {
    await api('PUT', `/services/${w.id}/env-vars/${encodeURIComponent(w.name)}`, { value: w.value });
    console.log(`  set ${w.service}.${w.name}`);
  }

  const touched = [...new Set(work.map(w => w.service))];
  console.log(`\n✅ ${work.length} variable(s) set across ${touched.length} service(s).`);
  console.log('Render is redeploying them now. When the web service is back, confirm with:');
  console.log('  curl -s https://whorl-websocket-server.onrender.com/health | grep mediaBackup');
  console.log('It must say "ready". "no-region" or "no-credentials" means a value did not take.');
}

main().catch((err) => {
  console.error('\n✗', err.message);
  process.exit(1);
});
