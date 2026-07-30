// Embedding adapter — one OpenAI-compatible `/embeddings` client that fronts
// every viable embedding provider, because Anthropic serves NO embeddings API
// of its own (confirmed against the claude-api reference). The same request
// shape ({ model, input }) and response shape ({ data: [{ embedding, index }] })
// is served by Voyage (Anthropic's recommended embedding partner), OpenAI, and
// the Vercel AI Gateway — so the provider is a base-URL + model + key choice,
// not a code choice.
//
// Config (all overridable; default targets Voyage):
//   SYN_EMBED_PROVIDER   label only, e.g. 'voyage' | 'openai' | 'gateway'
//   SYN_EMBED_BASE_URL   default https://api.voyageai.com/v1
//   SYN_EMBED_MODEL      default voyage-3.5
//   SYN_EMBED_API_KEY    (fallback VOYAGE_API_KEY / OPENAI_API_KEY)

const {
  fetchWithTimeout, withRetry, createSemaphore, createBudget,
} = require('../resilience');

const DEFAULT_BASE_URL = 'https://api.voyageai.com/v1';
const DEFAULT_MODEL = 'voyage-3.5';
const MAX_BATCH = 128;
const TIMEOUT_MS = 20_000;

// Indexing is fire-and-forget (utils/synNodes.js#fireIndex), so a burst of
// publishes used to mean an equal burst of concurrent embedding requests with
// nothing in between. Four at a time keeps a backlog moving without stampeding
// the vendor or the event loop.
const runEmbed = createSemaphore(
  Number(process.env.SYN_EMBED_CONCURRENCY) || 4
);

// Daily ceiling on embedding calls. 0 disables the cap.
const embedBudget = createBudget({
  limit: Number(process.env.SYN_EMBED_DAILY_LIMIT ?? 5000),
  label: 'embedding',
});

function buildEmbedAdapter(env = process.env) {
  const provider = env.SYN_EMBED_PROVIDER || 'voyage';
  const apiKey = env.SYN_EMBED_API_KEY || env.VOYAGE_API_KEY || env.OPENAI_API_KEY || '';
  const baseUrl = (env.SYN_EMBED_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const modelId = env.SYN_EMBED_MODEL || DEFAULT_MODEL;

  async function embedBatch(inputs, signal) {
    embedBudget.consume();

    // A whole-request timeout is right here (unlike chat, which streams).
    // Retries matter more than they look: a dropped embedding means a node is
    // missing from search results with nothing surfaced to anyone, because the
    // caller is fire-and-forget.
    const res = await runEmbed(() => withRetry(
      () => fetchWithTimeout(`${baseUrl}/embeddings`, {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: modelId, input: inputs }),
      }, { timeoutMs: TIMEOUT_MS }),
      { label: `embed(${inputs.length})`, signal },
    ));

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Embedding request failed (${res.status}): ${detail.slice(0, 300)}`);
    }
    const json = await res.json();
    const rows = (json.data || []).slice().sort((a, b) => (a.index || 0) - (b.index || 0));
    return rows.map(r => r.embedding);
  }

  return {
    configured: !!apiKey,
    provider,
    modelId,
    async embed(texts, signal) {
      const out = [];
      for (let i = 0; i < texts.length; i += MAX_BATCH) {
        const batch = texts.slice(i, i + MAX_BATCH);
        // Empty strings embed poorly and some providers reject them; guard.
        const safe = batch.map(t => (t && t.trim()) ? t : ' ');
        out.push(...await embedBatch(safe, signal));
      }
      return out;
    },
  };
}

module.exports = { buildEmbedAdapter };
