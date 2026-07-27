// Embedding adapter — one OpenAI-compatible `/embeddings` client that fronts
// every viable embedding provider, because Anthropic serves NO embeddings API
// of its own (confirmed against the claude-api reference). The same request
// shape ({ model, input }) and response shape ({ data: [{ embedding, index }] })
// is served by Voyage (Anthropic's recommended embedding partner), OpenAI, and
// the Vercel AI Gateway — so the provider is a base-URL + model + key choice,
// not a code choice.
//
// Config (all overridable; default targets Voyage):
//   UNISON_EMBED_PROVIDER   label only, e.g. 'voyage' | 'openai' | 'gateway'
//   UNISON_EMBED_BASE_URL   default https://api.voyageai.com/v1
//   UNISON_EMBED_MODEL      default voyage-3.5
//   UNISON_EMBED_API_KEY    (fallback VOYAGE_API_KEY / OPENAI_API_KEY)

const DEFAULT_BASE_URL = 'https://api.voyageai.com/v1';
const DEFAULT_MODEL = 'voyage-3.5';
const MAX_BATCH = 128;

function buildEmbedAdapter(env = process.env) {
  const provider = env.UNISON_EMBED_PROVIDER || 'voyage';
  const apiKey = env.UNISON_EMBED_API_KEY || env.VOYAGE_API_KEY || env.OPENAI_API_KEY || '';
  const baseUrl = (env.UNISON_EMBED_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const modelId = env.UNISON_EMBED_MODEL || DEFAULT_MODEL;

  async function embedBatch(inputs, signal) {
    const res = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: modelId, input: inputs }),
    });
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
