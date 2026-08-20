const SynNode = require('../models/SynNode');
const index = require('./synIndex');
const synthesis = require('./synUnion');
const { getChatModel } = require('../llm/chatModel');

// The concrete, production-wired refresh hooks the funnel (utils/synNodes.js)
// fires when the published corpus changes. Injected via synNodes.setIndex()
// in websocket-server.js. Kept out of the funnel itself so the funnel's unit
// tests run with no LLM/DB. Every method is safe to call when the LLM is
// unconfigured (the embedding refresh no-ops, but markStale below still runs
// — corpus staleness isn't conditional on an LLM being wired up) and every
// DB/network error is the caller's to swallow (the funnel fires these
// fire-and-forget).
//
// Also bumps the union cache's corpusVersion (UNION.md §9)
// on every corpus change, so a cached brief/full is marked stale the next
// time GET /synthesis/synthesis is read — nothing regenerates automatically.

async function resolveTopicLabel(node) {
  if (!node || !node.topicId) return '';
  const hub = await SynNode.findOne({ id: node.topicId });
  return hub && hub.content ? (hub.content.topic || '') : '';
}

module.exports = {
  // A node was created, edited, or promoted — reconcile its corpus presence
  // (refreshNode indexes own thoughts and removes anything else) and mark the
  // synthesis cache stale (a positional summary can also change on edit or
  // promote, even when the embedding index doesn't need to move).
  async onNodeChanged(node) {
    const model = getChatModel();
    if (model.embedConfigured) {
      const topicLabel = node.kind === 'thought' ? await resolveTopicLabel(node) : '';
      await index.refreshNode({ model, node, topicLabel });
    }
    await synthesis.markStale(node.instanceId);
  },

  // A node was deleted — drop its corpus row and mark the cache stale.
  async onNodeRemoved(node) {
    await index.removeNode({ instanceId: node.instanceId, nodeId: node.id });
    await synthesis.markStale(node.instanceId);
  },

  // A public reply landed on a post — embed its context prose and
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
