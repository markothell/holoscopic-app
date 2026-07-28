const UnisonNode = require('../models/UnisonNode');
const UnisonFrame = require('../models/UnisonFrame');
const Entry = require('../models/Entry');
const UnisonSynthesis = require('../models/UnisonSynthesis');
const indexUtil = require('./unisonIndex');

// The community-synthesis orchestrator (SYNTHESIS.md). Replaces the M3 "Ask
// the Group" Q&A (utils/unisonChat.js, now removed) with a single cached,
// whole-community artifact: "here's where the group stands right now" — no
// question, no per-user thread. Two depths (brief / full), both drawn from
// the ENTIRE published corpus plus per-post positional summaries, cached per
// instance and regenerated only on the Synthesize/Expand button (never
// automatically).
//
// This module carries forward the genuinely load-bearing, still-true-here
// helpers from unisonChat.js verbatim (SYNTHESIS.md — "relocate, don't just
// delete"):
//   • renderContext / assembleCitations / anchorUrlFor — citations are
//     assembled from the SELECTION SET, never parsed from model output, so a
//     model can't fabricate or misattribute a source.
//   • the shared privacy/no-invention/handle-attribution rules (now the head
//     of both SYNTHESIS_PROMPTS instead of one SYSTEM_PROMPT).
// What's NEW here (not in unisonChat.js):
//   • selectCorpus — coverage (ALL published chunks, S1/§4), not query
//     relevance. There is no query, so there is no retrieve()/embed() call.
//   • computePositional — the corrected piece (§5): per-post positional
//     summaries computed with LOCAL MATH (no LLM) from Entry.position + the
//     post's UnisonFrame pole labels.
//   • the empty-guard rendering canned text with NO model call (same shape as
//     unisonChat's silence guard, but on "nothing published" rather than "no
//     relevant hit").
//   • the UnisonSynthesis cache (read/write) + markStale (corpusVersion bump).
//
// Privacy: selectCorpus reads the embedding store (utils/unisonIndex.js),
// which only ever holds published, instanceId-scoped rows; computePositional
// reads only published UnisonNode thoughts. Private content never enters
// either path.

// ── Shared rendering (relocated from utils/unisonChat.js) ──────────────────

// Build the deep-link for a citation. Node layer → the node page; reply →
// the reply anchored on its post. Also used for positional-summary
// citations, which always point at the post itself (kind 'node').
function anchorUrlFor(hit) {
  if (hit.kind === 'reply') {
    return `/unison/n/${hit.nodeId}#reply-${hit.refId}`;
  }
  return `/unison/n/${hit.nodeId}`;
}

// Citations are assembled from the SELECTION set, in selection order, deduped
// by (kind, refId). Shape (SYNTHESIS.md §6, unchanged from M3):
//   { kind:'node'|'reply', nodeId, layer?, replyId?, ownerHandle, anchorUrl }
function assembleCitations(hits) {
  const seen = new Set();
  const citations = [];
  for (const h of hits) {
    const key = `${h.kind}:${h.refId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const citation = {
      kind: h.kind,
      nodeId: h.nodeId,
      ownerHandle: h.ownerHandle,
      anchorUrl: anchorUrlFor(h),
    };
    if (h.kind === 'node') citation.layer = 'thought';
    if (h.kind === 'reply') citation.replyId = h.refId;
    citations.push(citation);
  }
  return citations;
}

// Render the selection set into a numbered CONTEXT block the model writes
// from — text chunks (node/reply, M3 shape) interleaved with positional
// summary lines (§5), which arrive already fully worded (`preformatted`) so
// they render bare instead of behind a "handle:" label.
function renderContext(hits) {
  return hits.map((h, i) => {
    if (h.preformatted) return `[${i + 1}] ${h.text}`;
    const who = h.ownerHandle || 'someone';
    const label = h.kind === 'reply' ? `${who} (reply)` : who;
    return `[${i + 1}] ${label}: ${h.text}`;
  }).join('\n\n');
}

// ── Prompts (§7) — shared rules carried over verbatim from M3's SYSTEM_PROMPT,
// depth-specific tail appended. ──────────────────────────────────────────────
const SHARED_RULES = [
  'You are the collective voice of a small trusted community. You speak ONLY',
  'from the group\'s published thoughts and replies, and how members',
  'positioned themselves on each post\'s spectrums — provided to you below as',
  'CONTEXT.',
  '',
  'Rules:',
  '- Write strictly from the provided CONTEXT. Do not add outside facts,',
  '  opinions, or invented positions.',
  '- Speak as the group ("the group thinks…", "members have argued…"),',
  '  summarizing what people actually said and how they positioned',
  '  themselves. Attribute specific claims to their author by handle (e.g.',
  '  "Ada argues…"). Never invent a handle.',
  '- Never reveal anything not present in the CONTEXT. The CONTEXT is the',
  '  group\'s public record; treat it as the whole of what you may say.',
  '- Do not include internal or system XML tags in your response.',
].join('\n');

const BRIEF_TAIL = [
  'Write a 2-4 sentence synthesis of where the group currently stands, from',
  'ONLY the CONTEXT (published thoughts, replies, and how members positioned',
  'themselves on each post\'s spectrums). Lead with the prevailing sentiment;',
  'name the main tension or strongest dissent if any; attribute distinctive',
  'positions by handle. State the group\'s position — don\'t address a reader',
  'or ask questions.',
].join('\n');

const FULL_TAIL = [
  'Write a structured read of where the group stands, from ONLY the CONTEXT.',
  'Three short parts: **Consensus** (what most agree on), **Tension** (the',
  'main disagreements or splits — cite the positional splits where relevant),',
  '**Voices** (2-4 distinctive positions, each attributed by handle). Keep',
  'each part tight; no outside facts, no invented positions or handles.',
].join('\n');

const SYNTHESIS_PROMPTS = {
  brief: `${SHARED_RULES}\n\n${BRIEF_TAIL}`,
  full: `${SHARED_RULES}\n\n${FULL_TAIL}`,
};

// The canned response when the corpus is silent (no model call) — same
// no-hallucination guard as M3's SILENT_ANSWER, on "nothing published" rather
// than "no relevant hit".
const EMPTY_TEXT = "The group hasn't published anything to synthesize yet.";

// ── §4: corpus selection — coverage (feed-all), not query relevance ────────

// All published text chunks (thought + reply prose), instanceId-scoped.
// Reuses the embedding store's storage (utils/unisonIndex.js) but NEVER its
// retrieve()/embed() query path — synthesis has no query. Privacy is
// inherited (the store only ever holds published rows) and re-checked here
// defensively, same discipline as retrieve().
async function selectCorpus({ store = indexUtil.mongoStore, instanceId }) {
  if (!instanceId) throw new Error('instanceId is required');
  const rows = await store.list(instanceId);
  return rows.filter(r => r.instanceId === instanceId && r.visibility === 'published');
}

// ── §5: positional summaries — LOCAL MATH, no LLM ───────────────────────────

const positionalMongoStore = {
  async findPublishedThoughts(instanceId) {
    return UnisonNode
      .find({ instanceId, kind: 'thought', visibility: 'published' })
      .sort({ publishedAt: -1 });
  },
  // Replies that actually carry a stance — a reply with prose but no
  // position (shouldn't happen via respond(), which requires one) is
  // defensively excluded rather than crashing the summary.
  async findPositionedReplies(nodeId) {
    return Entry.find({ activityId: nodeId, position: { $ne: null } });
  },
  async getFrames(ids) {
    if (!ids || ids.length === 0) return [];
    return UnisonFrame.find({ id: { $in: ids } });
  },
};

// A reply's side on one axis: 'A' (poleA, the "most" end — right on x, top on
// y) when its coordinate is >= 0.5, else 'B'.
function sideFor(value) {
  return value >= 0.5 ? 'A' : 'B';
}

// A point's side per axis, in axis order (axis 0 → x, axis 1 → y).
function sidesFor(point, axisCount) {
  const sides = ['A']; // placeholder, overwritten below (keeps shape obvious)
  sides.length = 0;
  for (let i = 0; i < axisCount; i++) {
    sides.push(sideFor(i === 0 ? point.x : point.y));
  }
  return sides;
}

// Bucket label from a sides tuple: the frame's poleA/poleB per axis, joined
// with '+' for a 2-axis quadrant ("considered+collective"); a single pole
// name for a 1-axis lean.
function labelForSides(frames, sides) {
  return frames.map((f, i) => (sides[i] === 'A' ? f.poleA : f.poleB)).join('+');
}

// "instinctive↔considered × personal↔collective" — poleB (least) then poleA
// (most, per axis), joined per-axis with '×' for a 2-axis frame pair.
function axisDescription(frames) {
  return frames.map(f => `${f.poleB}↔${f.poleA}`).join(' × ');
}

function pluralReplies(n) {
  return n === 1 ? 'reply' : 'replies';
}

// The consensus-vs-split sentence (§5): where replies cluster (dominant
// quadrant/lean, named with pole labels) and whether there's a dissenting
// minority (and which pole it leans toward), or — with no clear majority — a
// straight split between the two largest buckets.
function describeCluster(frames, points) {
  const total = points.length;
  const withSides = points.map(p => sidesFor(p, frames.length));

  const buckets = new Map();
  withSides.forEach((sides, idx) => {
    const key = sides.join('');
    if (!buckets.has(key)) buckets.set(key, { sides, count: 0, idxs: [] });
    const b = buckets.get(key);
    b.count += 1;
    b.idxs.push(idx);
  });
  const sorted = [...buckets.values()].sort((a, b) => b.count - a.count);
  const dominant = sorted[0];
  const domLabel = labelForSides(frames, dominant.sides);
  const domCount = dominant.count;
  const dissentCount = total - domCount;

  if (dissentCount === 0) {
    return `${total} ${pluralReplies(total)} agree: ${domLabel}.`;
  }

  const ratio = domCount / total;
  if (ratio >= 0.55) {
    // Name the dissent by the axis where the minority actually diverges from
    // the dominant cluster (not necessarily every axis) — the first axis
    // (x, then y) whose minority-majority side differs from the dominant
    // bucket's side on that axis.
    const dominantIdxSet = new Set(dominant.idxs);
    const minorityIdxs = withSides.map((_, i) => i).filter(i => !dominantIdxSet.has(i));
    let dissentLabel = null;
    for (let axis = 0; axis < frames.length; axis++) {
      const minoritySides = minorityIdxs.map(i => withSides[i][axis]);
      const aCount = minoritySides.filter(s => s === 'A').length;
      const minorityMajoritySide = aCount * 2 >= minoritySides.length ? 'A' : 'B';
      if (minorityMajoritySide !== dominant.sides[axis]) {
        dissentLabel = minorityMajoritySide === 'A' ? frames[axis].poleA : frames[axis].poleB;
        break;
      }
    }
    if (!dissentLabel) {
      // The minority doesn't diverge on any single axis (rare) — fall back
      // to naming its own (second-largest) bucket.
      const second = sorted[1];
      dissentLabel = labelForSides(frames, second.sides);
    }
    return `${domCount} of ${total} ${pluralReplies(total)} cluster in ${domLabel}; ${dissentCount} lean ${dissentLabel}.`;
  }

  const second = sorted[1];
  const secondLabel = labelForSides(frames, second.sides);
  return `the group splits between ${domLabel} (${domCount}) and ${secondLabel} (${second.count}).`;
}

// Per published thought with positioned replies: one CONTEXT line carrying a
// citation back to the post (kind 'node'). Posts with no axes, or no
// positioned replies, contribute nothing (there's no stance data to
// summarize). Frames are re-ordered to axisFrameIds order (Mongo $in doesn't
// preserve it) — axis 0 is always x, axis 1 is always y (SYNTHESIS.md §5 /
// the ResolveGrid convention).
async function computePositional({ store = positionalMongoStore, instanceId }) {
  if (!instanceId) throw new Error('instanceId is required');
  const posts = await store.findPublishedThoughts(instanceId);
  const lines = [];

  for (const post of posts) {
    if (!post.axisFrameIds || post.axisFrameIds.length === 0) continue;

    const replies = await store.findPositionedReplies(post.id);
    const points = replies.filter(e => e.position).map(e => ({ x: e.position.x, y: e.position.y }));
    if (points.length === 0) continue;

    const frameDocs = await store.getFrames(post.axisFrameIds);
    const byId = new Map(frameDocs.map(f => [f.id, f]));
    const frames = post.axisFrameIds.map(id => byId.get(id)).filter(Boolean);
    if (frames.length === 0) continue;

    const thoughtText = (post.content && post.content.thought) || '';
    const sentence = describeCluster(frames, points);
    const text = `On "${thoughtText}" (${axisDescription(frames)}): ${sentence}`;

    lines.push({
      kind: 'node',
      refId: post.id,
      nodeId: post.id,
      ownerHandle: post.ownerHandle,
      text,
      preformatted: true,
    });
  }

  return lines;
}

// ── §6: the orchestrator ────────────────────────────────────────────────────

// Prepare a synthesis WITHOUT streaming: select the corpus, compute
// positional summaries, assemble citations, and decide whether the corpus is
// empty. Returns everything the route needs; when `empty` is true the route
// streams `text` and never calls the model (same no-hallucination discipline
// as M3's silence guard).
async function prepareSynthesis({
  store = indexUtil.mongoStore, positionalStore = positionalMongoStore,
  instanceId, depth,
}) {
  if (depth !== 'brief' && depth !== 'full') throw new Error("depth must be 'brief' or 'full'");
  if (!instanceId) throw new Error('instanceId is required');

  const [textHits, positionalHits] = await Promise.all([
    selectCorpus({ store, instanceId }),
    computePositional({ store: positionalStore, instanceId }),
  ]);
  const hits = [...textHits, ...positionalHits];

  if (hits.length === 0) {
    return { empty: true, text: EMPTY_TEXT, citations: [] };
  }

  const citations = assembleCitations(hits);
  const context = renderContext(hits);
  const messages = [{
    role: 'user',
    content: `CONTEXT — the group's published thoughts, replies, and how members positioned themselves:\n\n${context}`,
  }];
  return {
    empty: false,
    system: SYNTHESIS_PROMPTS[depth],
    messages,
    citations,
  };
}

// ── Cache (read/write) + staleness ──────────────────────────────────────────
// Store-injected like the rest of the app's funnels (utils/unisonNodes.js,
// utils/unisonIndex.js) so the caching + staleness logic is unit-testable
// against an in-memory store with no live MongoDB. Production always uses
// cacheMongoStore (the default).

const cacheMongoStore = {
  async findOne(instanceId) {
    return UnisonSynthesis.findOne({ instanceId });
  },
  async getOrCreate(instanceId) {
    return UnisonSynthesis.findOneAndUpdate(
      { instanceId },
      { $setOnInsert: { instanceId, corpusVersion: 0 } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  },
  async incCorpusVersion(instanceId) {
    return UnisonSynthesis.findOneAndUpdate(
      { instanceId },
      { $inc: { corpusVersion: 1 }, $setOnInsert: { instanceId } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  },
  async setDepth(instanceId, depth, artifact) {
    return UnisonSynthesis.findOneAndUpdate(
      { instanceId },
      { $set: { [depth]: artifact }, $setOnInsert: { instanceId } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  },
};

// GET /synthesis — read-only, never creates a doc (an instance that has
// never synthesized has no row at all).
async function getCache(instanceId, { store = cacheMongoStore } = {}) {
  return store.findOne(instanceId);
}

// Fetch-or-create the per-instance cache row, atomically (upsert), so the
// route can read the current corpusVersion baseline before generating.
async function getOrCreateDoc(instanceId, { store = cacheMongoStore } = {}) {
  return store.getOrCreate(instanceId);
}

// Bump the instance's corpusVersion — called by utils/unisonIndexHooks.js on
// every publish/unpublish/edit/promote/reply (i.e. whenever the published
// corpus or its positional data could have changed). Atomic upsert so a
// community that has never synthesized still gets a row to bump.
async function markStale(instanceId, { store = cacheMongoStore } = {}) {
  if (!instanceId) return;
  await store.incCorpusVersion(instanceId);
}

// Persist a (re)generated depth. corpusVersion itself is untouched here —
// only markStale ever bumps it; this just stamps the version the generation
// ran AT.
async function saveDepth({ store = cacheMongoStore, instanceId, depth, text, citations, model, corpusVersion }) {
  const artifact = {
    text,
    citations: citations || [],
    generatedAt: new Date(),
    model: model || '',
    atCorpusVersion: corpusVersion || 0,
  };
  return store.setDepth(instanceId, depth, artifact);
}

// Wire shape for GET /synthesis: { brief?, full?, corpusVersion, stale }.
// `stale` reflects the BRIEF artifact (the default view on open) — the
// frontend can derive full's own staleness the same way (compare
// full.atCorpusVersion to corpusVersion) since both are returned.
function toClientArtifact(artifact) {
  if (!artifact) return undefined;
  return {
    text: artifact.text || '',
    citations: artifact.citations || [],
    generatedAt: artifact.generatedAt || null,
    model: artifact.model || '',
    atCorpusVersion: artifact.atCorpusVersion || 0,
  };
}

function toClientCache(doc) {
  if (!doc) return { corpusVersion: 0, stale: false };
  const corpusVersion = doc.corpusVersion || 0;
  const brief = toClientArtifact(doc.brief);
  const full = toClientArtifact(doc.full);
  return {
    brief,
    full,
    corpusVersion,
    stale: !!(brief && brief.atCorpusVersion !== corpusVersion),
  };
}

module.exports = {
  SYNTHESIS_PROMPTS,
  EMPTY_TEXT,
  anchorUrlFor,
  assembleCitations,
  renderContext,
  selectCorpus,
  computePositional,
  describeCluster,
  labelForSides,
  axisDescription,
  prepareSynthesis,
  getCache,
  getOrCreateDoc,
  markStale,
  saveDepth,
  toClientCache,
  positionalMongoStore,
  cacheMongoStore,
};
