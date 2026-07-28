const UnisonNode = require('../models/UnisonNode');
const index = require('./unisonIndex');
const synthesis = require('./unisonSynthesis');
const { getChatModel } = require('../llm/chatModel');

// The concrete, production-wired refresh hooks the funnel (utils/unisonNodes.js)
// fires when the published corpus changes. Injected via unisonNodes.setIndex()
// in websocket-server.js. Kept out of the funnel itself so the funnel's unit
// tests run with no LLM/DB. Every method is safe to call when the LLM is
// unconfigured (the embedding refresh no-ops, but markStale below still runs
// — corpus staleness isn't conditional on an LLM being wired up) and every
// DB/network error is the caller's to swallow (the funnel fires these
// fire-and-forget).
//
// Also bumps the community synthesis cache's corpusVersion (SYNTHESIS.md §9)
// on every corpus change, so a cached brief/full is marked stale the next
// time GET /unison/synthesis is read — nothing regenerates automatically.

async function resolveTopicLabel(node) {
  if (!node || !node.topicId) return '';
  const hub = await UnisonNode.findOne({ id: node.topicId });
  return hub && hub.content ? (hub.content.topic || '') : '';
}

module.exports = {
  // A node was published, unpublished, edited, or promoted — reconcile its
  // corpus presence (refreshNode indexes published thoughts, removes anything
  // else, so private content is never indexed) and mark the synthesis cache
  // stale (a positional summary can also change on edit/promote, even when
  // the embedding index doesn't need to move).
  async onNodeChanged(node) {
    const model = getChatModel();
    if (model.embedConfigured) {
      const topicLabel = node.kind === 'thought' ? await resolveTopicLabel(node) : '';
      await index.refreshNode({ model, node, topicLabel });
    }
    await synthesis.markStale(node.instanceId);
  },

  // A public reply landed on a published post — embed its context prose and
  // mark the synthesis cache stale (a new reply changes both the text corpus
  // and the post's positional summary).
  async onReply(entry, post) {
    const model = getChatModel();
    if (model.embedConfigured) {
      await index.indexReply({ model, entry, post });
    }
    await synthesis.markStale(post.instanceId);
  },
};
