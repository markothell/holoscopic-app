#!/usr/bin/env node
// Idempotently ensures a Chorus memorial Instance exists, carries its subject
// config, and — unless --no-memories — holds a handful of seeded memories so
// the wall has something real to render against.
//
//   node scripts/seed-memorial.js
//   node scripts/seed-memorial.js --reset          # drop seeded memories first
//   node scripts/seed-memorial.js --no-memories    # config + tags only
//
// Starting a REAL memorial — one command, then refine in the platform admin
// (Instances → the new instance → Config), which edits every field below:
//
//   node scripts/seed-memorial.js --no-memories \
//     --slug=chorus-ellen --name="Ellen Vance" \
//     --lifespan="1941 – 2024" --photo=https://…  \
//     --blurb="If you knew her, tell us something we wouldn't otherwise know."
//
// Re-running is safe: it fills only what is still empty and never rotates the
// curator key, so a link already sent to the family keeps working.
//
// The subject here is fictional. Chorus's whole premise is real named people
// who did not consent to being written about, so the demo data must never be
// anyone's actual grandmother — swap the config for a real memorial via the
// platform admin, not by editing this file.
//
// Reads MONGODB_URI from .env.local (or .env.production with NODE_ENV).
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
require('dotenv').config({ path: envFile });

const crypto = require('crypto');
const mongoose = require('mongoose');
const Instance = require('../models/Instance');
const Memory = require('../models/Memory');
const MemoryTag = require('../models/MemoryTag');
const memories = require('../utils/memories');
const {
  SEED_ROLE_TAGS, SEED_EXPERIENCE_TAGS, provisionMemorial,
} = require('../utils/memorialDefaults');

const args = new Map(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  }),
);

const SLUG = args.get('slug') || 'chorus';
const SUBJECT = args.get('name') || 'Ellen Vance';

// The starter vocabularies and the curator key come from
// utils/memorialDefaults.js, shared with POST /api/instances, so a memorial
// created in the platform admin and one created here are the same product.

// Seeded memories. Written as a curator would seed them before sharing the
// link — an empty wall converts badly (PLAN §12). Each carries a real
// contributorId prefix so they can be found and re-seeded.
const SEED_CONTRIBUTOR = 'seed-curator';
const SEED_MEMORIES = [
  {
    title: 'The kitchen radio',
    sharerName: 'Ruth',
    subjectTags: ['stubborn'],
    selfTags: ['young'],
    experienceTags: ['ordinary Tuesdays'],
    text: 'She left the kitchen radio on all night, every night, for thirty years. '
      + 'She said the house sounded wrong without it. After she moved in with us I '
      + 'caught myself turning ours on at bedtime, and I have not stopped since.',
  },
  {
    title: 'Driving lessons',
    sharerName: '',
    subjectTags: ['patient'],
    selfTags: ['in over my head', 'scared'],
    experienceTags: ['first jobs'],
    text: 'I stalled her car eleven times on the hill by the bakery. She did not '
      + 'raise her voice once. She just said "again" and looked out the window like '
      + 'she had all afternoon, which I suppose she did.',
  },
  {
    title: 'The letter she never sent',
    sharerName: 'Marcus',
    subjectTags: ['a stranger'],
    selfTags: ['the new kid'],
    experienceTags: ['being seen'],
    text: 'We found it in the desk. Two pages to a friend she had fallen out with in '
      + '1978, finished and folded and never posted. I had known her my whole life and '
      + 'had no idea she carried that.',
  },
  {
    title: 'Wrong bus, right day',
    sharerName: 'Ani',
    subjectTags: ['funny'],
    selfTags: ['in over my head'],
    experienceTags: ['getting lost', 'laughing too hard'],
    text: 'She got us on the wrong bus out of the city and refused to admit it for '
      + 'forty minutes. By the time we worked out where we were it was too late to get '
      + 'back, so we had chips on a wall and watched the tide come in.',
  },
  // A thread: two people on the same afternoon. This is what "add to this
  // memory" produces, and the wall needs one to render the +N badge.
  {
    title: 'The garden in August',
    sharerName: 'Ruth',
    subjectTags: ['a teacher'],
    selfTags: ['young'],
    experienceTags: ['ordinary Tuesdays'],
    text: 'She had me thin the carrots and would not tell me why some had to go. '
      + '"You will see in September," she said. In September I saw.',
  },
  {
    addTo: 'The garden in August',
    title: 'The garden in August',
    sharerName: 'Marcus',
    subjectTags: ['a teacher', 'stubborn'],
    selfTags: ['scared'],
    experienceTags: ['being forgiven'],
    text: 'I was there that afternoon too. What Ruth does not know is that I had '
      + 'already pulled up half a row that morning trying to help, and Ellen never told '
      + 'her. She just quietly reseeded it and let me off.',
  },
];

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI not set');
  await mongoose.connect(process.env.MONGODB_URI);

  // ── The memorial instance ────────────────────────────────────────────────
  let instance = await Instance.findOne({ slug: SLUG });
  if (!instance) {
    instance = new Instance({
      id: crypto.randomUUID().substring(0, 8),
      name: SUBJECT,
      slug: SLUG,
      app: 'chorus',
      domains: [],
      access: { mode: 'public', inviteCodes: [] },
      gameNumber: null,
    });
    console.log(`✓ Created memorial instance ${SLUG} (id ${instance.id})`);
  } else {
    console.log(`✓ Memorial instance exists: ${SLUG} (id ${instance.id})`);
  }
  instance.app = 'chorus';

  // Explore mode, the starter vocabularies, and the curator key — the same
  // provisioning the admin's create form runs, and idempotent for the same
  // reason: it never rotates a key already texted to a family member.
  const hadKey = Boolean(instance.config.memorial.curatorKey);
  provisionMemorial(instance, { subjectName: SUBJECT });

  const m = instance.config.memorial;
  m.subjectName = SUBJECT;
  // Flags win, then whatever is already stored, then the demo defaults. That
  // ordering is what makes a re-run safe: details edited in the platform admin
  // survive, because this only fills what is still empty.
  m.blurb = args.get('blurb') || m.blurb
    || 'She kept the radio on all night and the back door unlocked. '
     + 'If you knew her, tell us something we would not otherwise know.';
  m.lifespan = args.get('lifespan') || m.lifespan || '1941 – 2024';
  m.subjectPhotoUrl = args.get('photo') || m.subjectPhotoUrl || '';
  m.allowCustomTags = true;
  m.audioMaxSeconds = 180;
  console.log(hadKey
    ? `  Curator key already set: /c/${SLUG}/curate?k=${m.curatorKey}`
    : `✓ Minted curator key. Curate at: /c/${SLUG}/curate?k=${m.curatorKey}`);
  instance.updatedAt = new Date();
  await instance.save();

  const instanceId = instance.id;

  // ── Tag vocabularies ─────────────────────────────────────────────────────
  const created = await memories.syncSeedTags({ instanceId, config: instance.config.memorial });
  console.log(`✓ Tag vocabularies synced (${created.length} new, ${SEED_ROLE_TAGS.length + SEED_EXPERIENCE_TAGS.length} configured)`);

  if (args.get('no-memories')) {
    console.log('· Skipping memories (--no-memories)');
    return;
  }

  // ── Seeded memories ──────────────────────────────────────────────────────
  if (args.get('reset')) {
    const { deletedCount } = await Memory.deleteMany({ instanceId, contributorId: SEED_CONTRIBUTOR });
    // Tag counts were incremented by the funnel on the way in, so zero them
    // rather than leaving the portrait weighted by memories that no longer
    // exist. Only safe because --reset removes ALL seeded memories at once.
    await MemoryTag.updateMany({ instanceId }, { useCount: 0 });
    console.log(`✓ Reset: removed ${deletedCount} seeded memories, zeroed tag counts`);
  }

  const existing = await Memory.countDocuments({ instanceId, contributorId: SEED_CONTRIBUTOR });
  if (existing > 0) {
    console.log(`· ${existing} seeded memories already present — pass --reset to rebuild`);
    return;
  }

  const byTitle = new Map();
  for (const spec of SEED_MEMORIES) {
    const parent = spec.addTo ? byTitle.get(spec.addTo) : null;
    const doc = await memories.createMemory({
      instanceId,
      contributorId: SEED_CONTRIBUTOR,
      title: spec.title,
      sharerName: spec.sharerName,
      subjectTagLabels: spec.subjectTags,
      selfTagLabels: spec.selfTags,
      experienceTagLabels: spec.experienceTags,
      body: { text: spec.text },
      replyToId: parent ? parent.id : null,
      config: instance.config.memorial,
    });
    if (!spec.addTo) byTitle.set(spec.title, doc);
    console.log(`  + ${spec.addTo ? '↳ ' : ''}${spec.title}${spec.sharerName ? ` — ${spec.sharerName}` : ' — anon'}`);
  }
  console.log(`✓ Seeded ${SEED_MEMORIES.length} memories`);
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (err) => {
    console.error('✗', err.message);
    await mongoose.disconnect();
    process.exit(1);
  });
