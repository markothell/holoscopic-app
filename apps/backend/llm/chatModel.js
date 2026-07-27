// The provider-agnostic ChatModel port — the ONLY LLM shape the Unison app
// knows about (PLAN §6). Routes, the embedding-index job, and the chat
// orchestrator depend on this interface and nothing else; no vendor SDK is
// imported anywhere outside `llm/adapters/*`. Swapping the model (Claude →
// OpenAI-compatible gateway → a local endpoint) is a config change, never a
// code change.
//
//   interface ChatModel {
//     stream({ system, messages, signal }): AsyncIterable<string>   // streamed text out
//     embed(texts: string[]): Promise<number[][]>                   // one vector per text
//   }
//
// Two independent halves sit behind the port — a CHAT adapter (streams the
// answer) and an EMBED adapter (serves the index + query embedding). They are
// configured separately (Anthropic serves no embeddings API, so embeddings
// always come from a different provider — Voyage / OpenAI-compatible / the
// Vercel AI Gateway). `getChatModel()` wires whichever pair the env selects.
//
// Graceful degradation is a hard requirement: if no key/config is present the
// endpoints must fail with a clean 503, never crash the server or block
// loadAPIRoutes(). So construction never throws — it returns an object whose
// `configured` flags are false and whose methods throw LLMNotConfiguredError
// only if actually called.

const { buildChatAdapter } = require('./adapters/chat');
const { buildEmbedAdapter } = require('./adapters/embed');

class LLMNotConfiguredError extends Error {
  constructor(message = 'LLM not configured') {
    super(message);
    this.name = 'LLMNotConfiguredError';
    this.code = 'LLM_NOT_CONFIGURED';
  }
}

// Compose a ChatModel from a chat adapter and an embed adapter. The two
// `*Configured` flags let callers gate precisely: the embedding-index job
// needs only `embedConfigured`; the chat endpoint needs BOTH (it must embed
// the query to retrieve, then stream the answer).
function composeChatModel(chatAdapter, embedAdapter) {
  return {
    // Chat needs to embed the query for retrieval AND stream — hence both.
    get configured() {
      return chatAdapter.configured && embedAdapter.configured;
    },
    get chatConfigured() {
      return chatAdapter.configured;
    },
    get embedConfigured() {
      return embedAdapter.configured;
    },
    info: {
      chat: { provider: chatAdapter.provider, modelId: chatAdapter.modelId },
      embed: { provider: embedAdapter.provider, modelId: embedAdapter.modelId },
    },

    async *stream(req) {
      if (!chatAdapter.configured) throw new LLMNotConfiguredError();
      yield* chatAdapter.stream(req);
    },

    async embed(texts) {
      if (!embedAdapter.configured) throw new LLMNotConfiguredError();
      if (!Array.isArray(texts)) throw new Error('embed() expects an array of strings');
      if (texts.length === 0) return [];
      return embedAdapter.embed(texts);
    },
  };
}

// Memoized default instance (production). Tests never call this — they inject a
// fake ChatModel into the index/chat utils directly, exactly like the funnel's
// store injection.
let _cached = null;
function getChatModel(env = process.env) {
  if (_cached && env === process.env) return _cached;
  const model = composeChatModel(buildChatAdapter(env), buildEmbedAdapter(env));
  if (env === process.env) _cached = model;
  return model;
}

// For tests / hot-reload: forget the memoized instance.
function _resetChatModel() { _cached = null; }

module.exports = {
  getChatModel,
  composeChatModel,
  LLMNotConfiguredError,
  _resetChatModel,
};
