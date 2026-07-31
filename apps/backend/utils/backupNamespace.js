// Which part of the backup bucket a run is allowed to write to, decided from
// the cluster it is actually connected to rather than from a variable somebody
// has to remember to set.
//
// WHY. Dev and production share one bucket, one Vercel Blob store, and — the
// part that bites — one database NAME. Both clusters call it `holoscopic-db`,
// so scripts/backup-mongo.js writes `<prefix>/holoscopic-db/latest.json` for
// both. With the prefixes equal, a dev dump lands in production's folder and
// overwrites the pointer whose whole purpose is to answer "which archive do I
// restore?" during an incident. Nothing looks wrong: the JSON is well-formed,
// the checksum matches, the archive restores cleanly. It is simply the wrong
// database, and somebody restores dev over production while following the
// documented procedure.
//
// Until now the only thing standing between that and production was two lines
// in an untracked .env.local. This module makes the separation a property of
// the connection instead.
//
// IT FAILS CLOSED IN BOTH DIRECTIONS, because each has a silent failure:
//
//   dev  → production prefix   clobbers latest.json and the record of lost
//                              recordings (the case above)
//   prod → dev prefix          production backups inherit the dev lifecycle
//                              rule and are DELETED after 7 days, while every
//                              run keeps reporting success
//
// The second is why an unrecognised host is fatal under NODE_ENV=production
// rather than being quietly treated as dev. A cluster migration must break the
// backup loudly — the heartbeat then reports it — instead of silently filing
// production's only off-site copy somewhere that expires.

const DEFAULT_PRODUCTION_HOST = 'live.ofmfipp';

function hostOf(uri) {
  return String(uri || '').match(/@([^/?]+)/)?.[1] || '';
}

function withDevSuffix(prefix) {
  return /-dev$/.test(prefix) ? prefix : `${prefix}-dev`;
}

function withoutDevSuffix(prefix) {
  return prefix.replace(/-dev$/, '');
}

/**
 * Decide the prefixes for a run.
 *
 * Returns { isProduction, host, mongoPrefix, blobPrefix, notes[] }.
 * Throws when NODE_ENV says production and the connection does not agree —
 * see the fail-closed note above.
 */
function resolve({ uri, env = process.env }) {
  const host = hostOf(uri);
  const productionHost = env.BACKUP_PRODUCTION_HOST || DEFAULT_PRODUCTION_HOST;
  const isProduction = host.includes(productionHost);
  const notes = [];

  if (env.NODE_ENV === 'production' && !isProduction) {
    throw new Error(
      `refusing to run: NODE_ENV=production but the database host is "${host || '(none)'}", `
      + `which does not match "${productionHost}".\n`
      + 'Writing production backups under a dev prefix would subject them to the '
      + "dev lifecycle rule and delete them after 7 days, while every run kept reporting success.\n"
      + 'If the production cluster genuinely moved, set BACKUP_PRODUCTION_HOST to the new host.',
    );
  }

  let mongoPrefix = env.BACKUP_PREFIX || 'mongo';
  let blobPrefix = env.BACKUP_BLOB_PREFIX || 'blob';

  if (isProduction) {
    // A stray -dev on the production cron would be silent data loss on a
    // 7-day timer. Strip it and say so.
    for (const [name, value] of [['BACKUP_PREFIX', mongoPrefix], ['BACKUP_BLOB_PREFIX', blobPrefix]]) {
      if (/-dev$/.test(value)) {
        notes.push(`${name}="${value}" ignored — this is the production cluster, using "${withoutDevSuffix(value)}"`);
      }
    }
    mongoPrefix = withoutDevSuffix(mongoPrefix);
    blobPrefix = withoutDevSuffix(blobPrefix);
  } else {
    if (!/-dev$/.test(mongoPrefix) || !/-dev$/.test(blobPrefix)) {
      notes.push(`not the production cluster (${host || 'unknown host'}) — forcing dev prefixes`);
    }
    mongoPrefix = withDevSuffix(mongoPrefix);
    blobPrefix = withDevSuffix(blobPrefix);
  }

  return { isProduction, host, productionHost, mongoPrefix, blobPrefix, notes };
}

/**
 * Resolve, then write the decision back into process.env.
 *
 * Deliberately side-effecting. utils/blobMirror.js reads BACKUP_BLOB_PREFIX
 * from the environment in several places, and threading a prefix through every
 * one of them would leave more paths that could be called without it than
 * with. Applying it once, before anything reads, means a caller cannot forget.
 * Call this immediately after loading dotenv and before requiring blobMirror.
 */
function apply({ uri, env = process.env, log = console.log }) {
  const ns = resolve({ uri, env });
  env.BACKUP_PREFIX = ns.mongoPrefix;
  env.BACKUP_BLOB_PREFIX = ns.blobPrefix;
  log(`namespace: ${ns.isProduction ? 'PRODUCTION' : 'dev'} — mongo/${ns.mongoPrefix} blob/${ns.blobPrefix}`);
  for (const n of ns.notes) log(`  note: ${n}`);
  return ns;
}

module.exports = { resolve, apply, hostOf, DEFAULT_PRODUCTION_HOST };
