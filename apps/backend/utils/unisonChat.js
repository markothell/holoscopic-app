const UnisonThread = require('../models/UnisonThread');
const indexUtil = require('./unisonIndex');

// The "Ask the Group" RAG orchestrator (PLAN §6). Retrieval-augmented chat
// over the community's PUBLISHED corpus that answers in the group's voice and
// cites specific thoughts by handle. Split into pure, injectable pieces so the
// two genuinely load-bearing behaviours are unit-testable with a fake ChatModel
// and no network:
//   • citation assembly — citations come from the RETRIEVAL SET, never parsed
//     from model output (so a model can't fabricate or misattribute a source).
//   • the "refuse when the corpus is silent" guard — when nothing relevant is
//     retrieved we return a deflection WITHOUT calling the model, so it cannot
//     hallucinate group opinion.
//
// Privacy: retrieval (utils/unisonIndex.js) only ever returns published,
// instanceId-scoped content — private nodes are neither indexed nor retrievable.

const DEFAULT_K = 6;
// Below this cosine score a hit is treated as noise. If the best hit is under
// the floor, the corpus is effectively silent on the question and we deflect.
const DEFAULT_MIN_SCORE = 0.15;
const MAX_HISTORY_TURNS = 8;

const SYSTEM_PROMPT = [
  'You are the collective voice of a small trusted community, answering a member',
  'who is "asking the group". You speak ONLY from the group\'s published thoughts',
  'and replies that are provided to you below as CONTEXT.',
  '',
  'Rules:',
  '- Answer strictly from the provided CONTEXT. Do not add outside facts, opinions,',
  '  or invented positions. If the CONTEXT does not address the question, say the',
  '  group hasn\'t discussed it yet rather than guessing.',
  '- Speak as the group ("the group thinks…", "members have argued…"), summarizing',
  '  what people actually said. Attribute specific claims to their author by handle',
  '  (e.g. "Ada argues…"). Never invent a handle.',
  '- Never reveal anything not present in the CONTEXT. The CONTEXT is the group\'s',
  '  public record; treat it as the whole of what you may say.',
  '- Do not include internal or system XML tags in your response.',
].join('\n');

// The canned deflection used when the corpus is silent (no model call).
const SILENT_ANSWER =
  "The group hasn't shared any published thinking on that yet — there's nothing in the community's posts or replies for me to speak from.";

// Build the deep-link for a citation. Node layer → the node page; reply → the
// reply anchored on its post. Kept here so the URL shape is defined in one place
// (the frontend AskOverlay renders chips against it).
function anchorUrlFor(hit) {
  if (hit.kind === 'reply') {
    return `/unison/n/${hit.nodeId}#reply-${hit.refId}`;
  }
  return `/unison/n/${hit.nodeId}`;
}

// Citations are assembled from the retrieval set, in retrieval-rank order,
// deduped by (kind, refId). Shape per PLAN §6:
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

// Render the retrieval set into a numbered CONTEXT block the model answers from.
function renderContext(hits) {
  return hits.map((h, i) => {
    const who = h.ownerHandle || 'someone';
    const label = h.kind === 'reply' ? `${who} (reply)` : who;
    return `[${i + 1}] ${label}: ${h.text}`;
  }).join('\n\n');
}

// Prior turns → model message list, trimmed to the recent window.
function historyToMessages(turns = []) {
  return turns
    .slice(-MAX_HISTORY_TURNS)
    .map(t => ({ role: t.role, content: t.content }));
}

// Prepare an answer WITHOUT streaming: retrieve, assemble citations, and decide
// whether the corpus is silent. Returns everything the route needs. When
// `silent` is true the route streams `refusal` and never calls the model.
// `retrieve` is injectable so tests can drive ranking directly.
async function prepareAnswer({
  store, model, retrieve = indexUtil.retrieve,
  instanceId, query, history = [],
  k = DEFAULT_K, minScore = DEFAULT_MIN_SCORE,
}) {
  const q = String(query || '').trim();
  if (!q) throw new Error('A question is required');

  const hits = await retrieve({ store, model, instanceId, queryText: q, k });
  const relevant = hits.filter(h => h.score >= minScore);

  if (relevant.length === 0) {
    return { silent: true, refusal: SILENT_ANSWER, hits: [], citations: [] };
  }

  const citations = assembleCitations(relevant);
  const context = renderContext(relevant);
  const messages = [
    ...historyToMessages(history),
    {
      role: 'user',
      content: `CONTEXT — the group's published thoughts and replies:\n\n${context}\n\n---\nQuestion: ${q}`,
    },
  ];
  return {
    silent: false,
    hits: relevant,
    citations,
    system: SYSTEM_PROMPT,
    messages,
  };
}

// ── Thread persistence (continuity per user per community) ──────────────────
async function getThread({ instanceId, userId }) {
  return UnisonThread.findOne({ instanceId, userId });
}

async function recentTurns({ instanceId, userId }) {
  const thread = await getThread({ instanceId, userId });
  return thread ? thread.turns : [];
}

// Append a completed user+assistant exchange to the thread (upsert-create).
async function appendExchange({ instanceId, userId, handle, userText, assistantText, citations }) {
  const now = new Date();
  const userTurn = { role: 'user', content: userText, createdAt: now };
  const assistantTurn = { role: 'assistant', content: assistantText, createdAt: now };
  if (citations && citations.length) assistantTurn.citations = citations;
  return UnisonThread.findOneAndUpdate(
    { instanceId, userId },
    {
      $setOnInsert: { instanceId, userId, handle },
      $set: { handle },
      $push: { turns: { $each: [userTurn, assistantTurn] } },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

module.exports = {
  SYSTEM_PROMPT,
  SILENT_ANSWER,
  DEFAULT_K,
  DEFAULT_MIN_SCORE,
  anchorUrlFor,
  assembleCitations,
  renderContext,
  prepareAnswer,
  getThread,
  recentTurns,
  appendExchange,
};
