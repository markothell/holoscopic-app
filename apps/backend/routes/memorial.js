const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const memories = require('../utils/memories');
const transcribe = require('../utils/memorialTranscribe');
const alerts = require('../utils/alerts');

// Chorus — the REST surface for a memorial (apps/chorus). Thin wrappers over
// utils/memories.js, the single write funnel; this file adds no funnel logic
// beyond request shaping, contributor resolution, and error-status mapping.
//
// MOUNTED WITHOUT enforceVerifiedUser, on purpose (PLAN.md D2). Every other
// identity-bearing router in this app sits behind it because their callers
// hold holoscopic accounts. Chorus callers never do: a memorial's whole value
// is that someone who knew the person can leave a memory from a texted link
// without signing up for anything. enforceVerifiedUser would be inert here
// anyway — it only bites on x-user-id / body.userId, which Chorus never sends
// — so mounting bare is a statement of intent, backed by its own rate-limit
// bucket in websocket-server.js.
//
// Identity is instead a signed, server-minted CONTRIBUTOR token (see
// contributorFrom below). It grants exactly two things: the right to edit or
// delete your own memory, and a throttling handle. It is not authentication
// and nothing here may treat it as such.
//
// M0 (built here): the read paths — /config, /memories, /memories/:id, /tags —
// plus the contributor session mint and the curator surface, since seeding and
// moderation need them from the first day. The compose path (POST /memories)
// is wired but M1 owns its client. Audio upload never touches this server:
// the browser uploads straight to Vercel Blob and sends us a URL, which the
// funnel validates against an allowlisted host.

const CONTRIBUTOR_SECRET = process.env.GAME_TOKEN_SECRET || process.env.NEXTAUTH_SECRET || '';
const IP_SALT = process.env.MEMORIAL_IP_SALT || CONTRIBUTOR_SECRET || 'chorus';

// ── The instance must actually be a memorial ────────────────────────────────
//
// resolveInstance never fails: an `x-instance-id` it does not recognise falls
// through to Instance.getDefault(), which is an interView edition. Without this
// guard every route below then ran happily against that edition — GET /config
// answered with the edition's NAME as a subject, and (worse) its syncSeedTags
// call WROTE MemoryTag documents into it. An unauthenticated caller could
// therefore plant tag vocabulary in any non-Chorus instance by sending a header
// naming nothing at all.
//
// That fallback used to be hard to reach by accident. It stopped being so the
// moment memorials became addressable as /c/<slug>, since the slug in a URL is
// whatever a visitor types.
//
// 404, not 403: a slug that names no memorial and a slug that names a memorial
// someone is not allowed to see must be indistinguishable from outside.
//
// The Deepgram callback is the one exemption. It is called server-to-server
// with none of our headers, so req.instance is ALWAYS the fallback there —
// it reads its memorial from `?i=` and authenticates with `?t=` instead.
const NOT_INSTANCE_SCOPED = ['/hooks/deepgram'];

router.use((req, res, next) => {
  if (NOT_INSTANCE_SCOPED.includes(req.path)) return next();
  if (req.instance?.app !== 'chorus') {
    return res.status(404).json({ error: 'Not found' });
  }
  next();
});

// ── Contributor identity ────────────────────────────────────────────────────

function signContributor(id) {
  const mac = crypto.createHmac('sha256', CONTRIBUTOR_SECRET).update(id).digest('base64url');
  return `${id}.${mac}`;
}

// Verifies the token's own signature. Returns null rather than throwing —
// a stale or hand-edited token means "anonymous visitor", not an error page.
function verifyContributor(token) {
  const raw = String(token || '');
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;
  const id = raw.slice(0, dot);
  const mac = raw.slice(dot + 1);
  const expected = crypto.createHmac('sha256', CONTRIBUTOR_SECRET).update(id).digest('base64url');
  // Constant-time compare; timingSafeEqual throws on length mismatch.
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return id;
}

function contributorFrom(req) {
  if (!CONTRIBUTOR_SECRET) return null;
  return verifyContributor(req.headers['x-contributor-token']);
}

// Writes need a contributor; reads are happy without one (they just can't mark
// anything isMine).
function requireContributor(req, res) {
  const id = contributorFrom(req);
  if (!id) {
    res.status(401).json({ error: 'Start a session first' });
    return null;
  }
  return id;
}

// Salted so the stored value can throttle a repeat abuser without the
// database holding a list of who visited a memorial from which household.
function ipHashFor(req) {
  const ip = req.ip || '';
  if (!ip) return '';
  return crypto.createHmac('sha256', IP_SALT).update(ip).digest('hex').slice(0, 32);
}

// ── Config ──────────────────────────────────────────────────────────────────

function memorialConfig(req) {
  return req.instance?.config?.memorial || {};
}

// The name to use in conversation — questions, placeholders, "someone who knew
// ___". Defaults to the first word of the full name rather than to the full
// name itself: "Who was Ellen Vance in this story?" reads like a form, and the
// whole point of the compose copy is that it does not.
function shortNameFor(config, instance) {
  const explicit = String(config.shortName || '').trim();
  if (explicit) return explicit;
  const full = String(config.subjectName || instance?.name || '').trim();
  return full.split(/\s+/)[0] || '';
}

// The curator authenticates with a key in the URL and nothing else (D10), so
// the link can be texted to a family member with no holoscopic account. Fails
// closed: a memorial with no curatorKey configured has no curator surface.
function isCurator(req) {
  const configured = memorialConfig(req).curatorKey;
  const offered = req.query.k || req.headers['x-curator-key'] || '';
  if (!configured || !offered) return false;
  const a = Buffer.from(String(configured));
  const b = Buffer.from(String(offered));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireCurator(req, res) {
  if (!isCurator(req)) {
    res.status(404).json({ error: 'Not found' });   // don't confirm the key exists
    return false;
  }
  return true;
}

// Everything the app needs to boot: who this memorial is for, and both tag
// vocabularies. One request, so the landing page has no waterfall.
router.get('/config', async (req, res) => {
  try {
    const config = memorialConfig(req);
    // Idempotent, and it's what makes a curator's newly-typed seed tag appear
    // in the picker without a deploy or a migration.
    await memories.syncSeedTags({ instanceId: req.instanceId, config });
    const tags = await memories.listTags({ instanceId: req.instanceId });

    res.json({
      memorial: {
        instanceId: req.instanceId,
        subjectName: config.subjectName || req.instance?.name || '',
        // Always a usable value, so no client ever has to decide what to do
        // with an empty one. The derive is the first whitespace-separated word,
        // which is the common case; a curator overrides it when it is wrong.
        shortName: shortNameFor(config, req.instance),
        subjectPhotoUrl: config.subjectPhotoUrl || '',
        blurb: config.blurb || '',
        lifespan: config.lifespan || '',
        promptTemplate: config.promptTemplate
          || 'This is a story where {name} was {role} and I was {role} having an experience of {experience}.',
        allowCustomTags: config.allowCustomTags !== false,
        audioMaxSeconds: config.audioMaxSeconds || 180,
        accent: config.accent || '',
        // NEVER the curatorKey — this is the app's most public endpoint.
      },
      tags,
    });
  } catch (err) {
    console.error('GET /memorial/config', err);
    res.status(500).json({ error: 'Could not load this memorial' });
  }
});

// Mint an anonymous contributor identity. Called once per browser, on first
// visit — the client caches the token in localStorage forever.
router.post('/session', async (req, res) => {
  if (!CONTRIBUTOR_SECRET) {
    return res.status(503).json({ error: 'Server not configured for contributions' });
  }
  const existing = contributorFrom(req);
  if (existing) return res.json({ contributorId: existing, token: req.headers['x-contributor-token'] });

  const id = crypto.randomUUID().substring(0, 12);
  res.json({ contributorId: id, token: signContributor(id) });
});

// ── Client failure reports ──────────────────────────────────────────────────
//
// The one place this app learns about failures it cannot otherwise see.
//
// A recording is uploaded browser → Vercel Blob directly, so when that upload
// is refused, THIS SERVER IS NEVER CALLED and Vercel's own logs show the token
// mint returning 200. The failure exists only on the phone. The first live
// iPhone recording died that way — a content type Blob would not accept — and
// nothing anywhere would have shown it without somebody reporting it by hand.
//
// Deliberately not a Memory-shaped write: no database, no instance data, just
// a line in Render's log stream, which is where the operator is already
// looking. Nothing here is trusted — every field is clamped, and the body
// carries no memory text, no contributor name and no token.
const EVENT_FIELD_MAX = 300;

function clampField(value, max = 80) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
}

router.post('/events', (req, res) => {
  // Answered before any work: a client reporting a failure is already having a
  // bad time and must never wait on us, and a 204 gives a retry loop nothing
  // to chew on.
  res.status(204).end();

  const event = {
    instanceId: req.instanceId,
    stage: clampField(req.body?.stage, 24),
    kind: clampField(req.body?.kind, 24),
    code: clampField(req.body?.code, 48),
    detail: clampField(req.body?.detail, EVENT_FIELD_MAX),
    mimeType: clampField(req.body?.mimeType, 80),
    sizeBytes: Number(req.body?.sizeBytes) || 0,
    durationMs: Number(req.body?.durationMs) || 0,
    attempts: Number(req.body?.attempts) || 0,
    // The whole diagnosis of the iPhone failure was "which browser wrote this
    // MIME string", so the user agent is the single most useful field here.
    ua: clampField(req.headers['user-agent'], 200),
  };
  console.error('[chorus:client-failure]', JSON.stringify(event));

  // Email only the class that needs a person: `blocked` means no amount of
  // retrying will help and the contributor has been told a report is on its
  // way. Transient and rate-limit failures resolve themselves and stay in the
  // log. Throttled to one per code per hour inside alertOnce.
  if (event.kind === 'blocked') {
    void alerts.alertOnce(
      `chorus:${event.instanceId}:${event.code}`,
      `Chorus: a memory could not be sent (${event.code})`,
      [
        'Somebody tried to leave a memory and could not. This needs a fix —',
        'retrying will keep failing until it lands.',
        '',
        `memorial:  ${event.instanceId}`,
        `stage:     ${event.stage}`,
        `code:      ${event.code}`,
        `detail:    ${event.detail}`,
        `recording: ${event.mimeType || '(none)'} ${event.sizeBytes || 0} bytes ${event.durationMs || 0}ms`,
        `browser:   ${event.ua}`,
        '',
        'Their words are still in the form and any recording is still on their',
        'phone, so a fix within the hour probably loses nothing.',
      ].join('\n'),
    ).then(outcome => {
      if (outcome !== 'sent') console.error('[chorus:client-failure] alert', outcome);
    });
  }
});

// ── Reading ─────────────────────────────────────────────────────────────────

function tagIdsFrom(req) {
  const raw = req.query.tags;
  if (!raw) return [];
  return String(raw).split(',').map(s => s.trim()).filter(Boolean).slice(0, 6);
}

router.get('/memories', async (req, res) => {
  try {
    const curator = isCurator(req);
    const page = await memories.listWall({
      instanceId: req.instanceId,
      tagIds: tagIdsFrom(req),
      cursor: req.query.cursor || null,
      limit: req.query.limit,
      // An unknown sort falls back to the default rather than erroring — a
      // stale bookmark should still render the wall.
      sort: req.query.sort,
      contributorId: contributorFrom(req),
      includeHidden: curator,
    });
    res.json(page);
  } catch (err) {
    console.error('GET /memorial/memories', err);
    res.status(500).json({ error: 'Could not load memories' });
  }
});

router.get('/memories/:id', async (req, res) => {
  try {
    const found = await memories.getMemoryWithThread({
      instanceId: req.instanceId,
      id: req.params.id,
      contributorId: contributorFrom(req),
      includeHidden: isCurator(req),
    });
    if (!found) return res.status(404).json({ error: 'Memory not found' });
    res.json(found);
  } catch (err) {
    console.error('GET /memorial/memories/:id', err);
    res.status(500).json({ error: 'Could not load that memory' });
  }
});

router.get('/tags', async (req, res) => {
  try {
    res.json(await memories.listTags({
      instanceId: req.instanceId,
      includeHidden: isCurator(req),
    }));
  } catch (err) {
    console.error('GET /memorial/tags', err);
    res.status(500).json({ error: 'Could not load tags' });
  }
});

// ── Writing ─────────────────────────────────────────────────────────────────

// Validation errors from the funnel are the user's fault and readable
// ("Give the memory a short name"); everything else is ours and gets a 500
// with the detail kept server-side.
const USER_ERRORS = [
  /short name/i, /needs a story/i, /no longer exists/i, /Not yours/i,
  /no longer be edited/i, /audio url/i, /blob host/i, /https/i, /not found/i,
];

function sendFunnelError(res, err, fallback) {
  const message = err?.message || '';
  if (USER_ERRORS.some(re => re.test(message))) {
    return res.status(400).json({ error: message });
  }
  console.error(fallback, err);
  return res.status(500).json({ error: fallback });
}

router.post('/memories', async (req, res) => {
  const contributorId = requireContributor(req, res);
  if (!contributorId) return;
  try {
    const created = await memories.createMemory({
      instanceId: req.instanceId,
      contributorId,
      title: req.body.title,
      sharerName: req.body.sharerName,
      subjectTagLabels: req.body.subjectTags,
      selfTagLabels: req.body.selfTags,
      experienceTagLabels: req.body.experienceTags,
      body: req.body.body,
      replyToId: req.body.replyToId || null,
      ipHash: ipHashFor(req),
      config: memorialConfig(req),
    });
    const found = await memories.getMemoryWithThread({
      instanceId: req.instanceId, id: created.id, contributorId,
    });
    res.status(201).json(found);
  } catch (err) {
    sendFunnelError(res, err, 'Could not save that memory');
  }
});

router.patch('/memories/:id', async (req, res) => {
  const contributorId = requireContributor(req, res);
  if (!contributorId) return;
  try {
    await memories.editMemory({
      instanceId: req.instanceId,
      id: req.params.id,
      contributorId,
      title: req.body.title,
      sharerName: req.body.sharerName,
      subjectTagLabels: req.body.subjectTags,
      selfTagLabels: req.body.selfTags,
      experienceTagLabels: req.body.experienceTags,
      body: req.body.body,
      config: memorialConfig(req),
    });
    const found = await memories.getMemoryWithThread({
      instanceId: req.instanceId, id: req.params.id, contributorId,
    });
    res.json(found);
  } catch (err) {
    sendFunnelError(res, err, 'Could not update that memory');
  }
});

router.delete('/memories/:id', async (req, res) => {
  const contributorId = requireContributor(req, res);
  if (!contributorId) return;
  try {
    await memories.deleteOwnMemory({ instanceId: req.instanceId, id: req.params.id, contributorId });
    res.json({ ok: true });
  } catch (err) {
    sendFunnelError(res, err, 'Could not remove that memory');
  }
});

router.post('/memories/:id/flag', async (req, res) => {
  try {
    await memories.flagMemory({
      instanceId: req.instanceId,
      id: req.params.id,
      contributorId: contributorFrom(req),
    });
    // Always the same response, whatever the flag count — a reporter learns
    // nothing about whether the memory is now queued or already flagged.
    res.json({ ok: true });
  } catch (err) {
    sendFunnelError(res, err, 'Could not report that memory');
  }
});

// ── Transcription callback ──────────────────────────────────────────────────

// Deepgram POSTs the finished transcript here. It is not authenticated to us
// and sends no headers of ours, which has two consequences:
//
//   1. The instance comes from the `i` query param, NOT req.instanceId. The
//      resolveInstance middleware would fall back to the default instance and
//      quietly write the transcript into the wrong memorial's namespace.
//   2. The `t` token is the only thing preventing a stranger who learns this
//      URL from rewriting what somebody said. Verify before touching anything.
//
// Always 200s. A retrying webhook that gets a 500 will hammer us over a
// transcript nobody is waiting on.
router.post('/hooks/deepgram', async (req, res) => {
  const memoryId = String(req.query.m || '');
  const instanceId = String(req.query.i || '');
  if (!memoryId || !instanceId || !transcribe.verifyCallbackToken(memoryId, req.query.t)) {
    return res.status(404).json({ error: 'Not found' });
  }
  try {
    const text = transcribe.extractTranscript(req.body);
    await memories.attachTranscript({
      instanceId,
      id: memoryId,
      text,
      // An empty transcript is a real outcome — silence, or audio Deepgram
      // couldn't parse. Marking it 'failed' lets the UI stop promising one.
      status: text ? 'ready' : 'failed',
      provider: 'deepgram',
    });
  } catch (err) {
    console.error('POST /memorial/hooks/deepgram', err);
  }
  res.json({ ok: true });
});

// ── Curation ────────────────────────────────────────────────────────────────

// Everything under /curate authenticates on ?k= alone and 404s otherwise, so
// probing for a memorial's curator surface is indistinguishable from a typo.
router.post('/curate/memories/:id/status', async (req, res) => {
  if (!requireCurator(req, res)) return;
  const status = req.body.status;
  if (!['live', 'hidden', 'removed'].includes(status)) {
    return res.status(400).json({ error: 'Unknown status' });
  }
  try {
    const updated = await memories.setMemoryStatus({
      instanceId: req.instanceId,
      id: req.params.id,
      status,
      reason: String(req.body.reason || ''),
    });
    res.json({ memory: { id: updated.id, status: updated.status } });
  } catch (err) {
    sendFunnelError(res, err, 'Could not update that memory');
  }
});

router.post('/curate/tags/:id/hidden', async (req, res) => {
  if (!requireCurator(req, res)) return;
  try {
    const tag = await memories.setTagHidden({
      instanceId: req.instanceId,
      tagId: req.params.id,
      hidden: Boolean(req.body.hidden),
    });
    if (!tag) return res.status(404).json({ error: 'Tag not found' });
    res.json({ tag: memories.toClientTag(tag) });
  } catch (err) {
    sendFunnelError(res, err, 'Could not update that tag');
  }
});

module.exports = router;
