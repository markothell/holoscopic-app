const UnisonNode = require('../models/UnisonNode');
const index = require('./unisonIndex');
const { getChatModel } = require('../llm/chatModel');

// The concrete, production-wired refresh hooks the funnel (utils/unisonNodes.js)
// fires when the published corpus changes. Injected via unisonNodes.setIndex()
// in websocket-server.js. Kept out of the funnel itself so the funnel's unit
// tests run with no LLM/DB. Every method is safe to call when the LLM is
// unconfigured (it no-ops) and every DB/network error is the caller's to
// swallow (the funnel fires these fire-and-forget).

async function resolveTopicLabel(node) {
  if (!node || !node.topicId) return '';
  const hub = await UnisonNode.findOne({ id: node.topicId });
  return hub && hub.content ? (hub.content.topic || '') : '';
}

module.exports = {
  // A node was published, unpublished, edited, or promoted — reconcile its
  // corpus presence (refreshNode indexes published thoughts, removes anything
  // else, so private content is never indexed).
  async onNodeChanged(node) {
    const model = getChatModel();
    if (!model.embedConfigured) return;
    const topicLabel = node.kind === 'thought' ? await resolveTopicLabel(node) : '';
    await index.refreshNode({ model, node, topicLabel });
  },

  // A public reply landed on a published post — embed its context prose.
  async onReply(entry, post) {
    const model = getChatModel();
    if (!model.embedConfigured) return;
    await index.indexReply({ model, entry, post });
  },
};
