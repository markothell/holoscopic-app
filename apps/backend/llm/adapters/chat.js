// Chat adapter factory — the ONLY place a chat vendor's wire protocol lives.
// Selected by `SYN_MODEL_PROVIDER`:
//   'claude' | 'anthropic'  → Anthropic Messages API (default)
//   'openai' | 'gateway' | 'local' → any OpenAI-compatible /chat/completions
//                                     (Vercel AI Gateway, a local server, etc.)
//
// Each adapter exposes { configured, provider, modelId, stream({system,
// messages, signal}) → AsyncIterable<string> }. `stream` yields plain text
// deltas; thinking/tool blocks are filtered out here so the app only ever sees
// answer text (there are no tools in the RAG chat, so the disabled-thinking
// tool-call-as-text pitfall cannot apply).

const { readDataLines } = require('./sse');

// Default chat model: pinned from the claude-api reference (current default
// Claude). Overridable per deployment via SYN_MODEL_ID.
const DEFAULT_CLAUDE_MODEL = 'claude-opus-5';
const DEFAULT_OPENAI_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_MAX_TOKENS = 1024;

function num(v, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ── Anthropic Messages adapter ──────────────────────────────────────────────
function anthropicChat(env) {
  const apiKey = env.SYN_MODEL_API_KEY || env.ANTHROPIC_API_KEY || '';
  const baseUrl = (env.SYN_MODEL_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '');
  const modelId = env.SYN_MODEL_ID || DEFAULT_CLAUDE_MODEL;
  const maxTokens = num(env.SYN_MODEL_MAX_TOKENS, DEFAULT_MAX_TOKENS);
  // Disabled thinking keeps short RAG answers snappy; effort defaults to
  // <= high so disabling is accepted on Opus 5. Override to 'adaptive' if a
  // deployment wants visible reasoning.
  const thinkingMode = env.SYN_MODEL_THINKING || 'disabled';

  return {
    configured: !!apiKey,
    provider: 'claude',
    modelId,
    async *stream({ system, messages, signal }) {
      const body = {
        model: modelId,
        max_tokens: maxTokens,
        system,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
      };
      if (thinkingMode === 'disabled') body.thinking = { type: 'disabled' };
      else if (thinkingMode === 'adaptive') body.thinking = { type: 'adaptive', display: 'summarized' };

      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Anthropic chat failed (${res.status}): ${detail.slice(0, 300)}`);
      }
      for await (const data of readDataLines(res)) {
        if (!data || data === '[DONE]') continue;
        let evt;
        try { evt = JSON.parse(data); } catch { continue; }
        if (evt.type === 'content_block_delta' && evt.delta && evt.delta.type === 'text_delta') {
          if (evt.delta.text) yield evt.delta.text;
        } else if (evt.type === 'message_stop') {
          return;
        } else if (evt.type === 'error') {
          throw new Error(`Anthropic stream error: ${evt.error && evt.error.message}`);
        }
      }
    },
  };
}

// ── OpenAI-compatible chat adapter (gateway / local / OpenAI) ────────────────
function openaiChat(env) {
  const apiKey = env.SYN_MODEL_API_KEY || env.OPENAI_API_KEY || '';
  const baseUrl = (env.SYN_MODEL_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const modelId = env.SYN_MODEL_ID || DEFAULT_OPENAI_MODEL;
  const maxTokens = num(env.SYN_MODEL_MAX_TOKENS, DEFAULT_MAX_TOKENS);

  return {
    configured: !!apiKey,
    provider: env.SYN_MODEL_PROVIDER || 'openai',
    modelId,
    async *stream({ system, messages, signal }) {
      const chatMessages = system
        ? [{ role: 'system', content: system }, ...messages]
        : [...messages];
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          max_tokens: maxTokens,
          messages: chatMessages,
          stream: true,
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Chat completion failed (${res.status}): ${detail.slice(0, 300)}`);
      }
      for await (const data of readDataLines(res)) {
        if (!data || data === '[DONE]') { if (data === '[DONE]') return; continue; }
        let evt;
        try { evt = JSON.parse(data); } catch { continue; }
        const delta = evt.choices && evt.choices[0] && evt.choices[0].delta;
        if (delta && delta.content) yield delta.content;
      }
    },
  };
}

function buildChatAdapter(env = process.env) {
  const provider = (env.SYN_MODEL_PROVIDER || 'claude').toLowerCase();
  if (provider === 'openai' || provider === 'gateway' || provider === 'local') {
    return openaiChat(env);
  }
  // 'claude' | 'anthropic' | anything else → the default Claude adapter.
  return anthropicChat(env);
}

module.exports = { buildChatAdapter };
