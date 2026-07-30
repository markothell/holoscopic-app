// What a brand-new Chorus memorial starts life with.
//
// Two callers need to agree on this exactly: POST /api/instances (creating a
// memorial from the platform admin) and scripts/seed-memorial.js (creating the
// demo one). They used to be the same list typed twice, which meant a memorial
// born in the admin and a memorial born from the script were subtly different
// products.
//
// Nothing here is meant to survive contact with a real memorial. It exists so
// the prompt's blanks are not empty on the first visit — a curator opening the
// tag picker and finding nothing has no way to learn what an answer looks
// like. The curator replaces these in Instances → Config.

const crypto = require('crypto');

// Deliberately a mix of roles and adjectives — the blank reads "<name> was ___
// and I was ___", and both kinds of word fit there.
const SEED_ROLE_TAGS = [
  'stubborn', 'a teacher', 'the new kid', 'patient', 'in over my head',
  'a stranger', 'funny', 'scared', 'a neighbour', 'young',
];

const SEED_EXPERIENCE_TAGS = [
  'being seen', 'getting lost', 'first jobs', 'laughing too hard',
  'grief', 'being forgiven', 'ordinary Tuesdays', 'saying goodbye',
];

// The one credential for moderating a memorial (PLAN.md D10). It travels in a
// URL that gets texted to a family member, so it has to survive being pasted
// into a messaging app — base64url has no characters a link autodetector will
// clip.
function mintCuratorKey() {
  return crypto.randomBytes(24).toString('base64url');
}

// Fills a memorial Instance's config in place, leaving anything already set
// alone. Idempotent by construction, so a re-run never rotates a curator key
// that has already been shared out or wipes vocabulary a curator has edited.
function provisionMemorial(instance, { subjectName } = {}) {
  // Chorus has no holon economy at all (PLAN.md D1) — 'explore' turns costs
  // and rewards off wholesale rather than leaving zeroed numbers lying around
  // to be misread as a configured economy later.
  instance.config.mode = 'explore';

  const m = instance.config.memorial;
  if (!m.subjectName) m.subjectName = subjectName || instance.name;
  if (!m.seedRoleTags?.length) m.seedRoleTags = [...SEED_ROLE_TAGS];
  if (!m.seedExperienceTags?.length) m.seedExperienceTags = [...SEED_EXPERIENCE_TAGS];
  if (!m.accent) m.accent = '#8a6f4e';
  if (!m.curatorKey) m.curatorKey = mintCuratorKey();
  return instance;
}

module.exports = {
  SEED_ROLE_TAGS,
  SEED_EXPERIENCE_TAGS,
  mintCuratorKey,
  provisionMemorial,
};
