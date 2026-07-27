'use client';

import { useState } from 'react';
import OverlayShell from './OverlayShell';
import { TextField } from '@/components/ui/TextField';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  citations?: { label: string }[];
}

const SEED: ChatMessage[] = [
  {
    id: 'm0', role: 'assistant',
    text: 'Ask me anything the group has published, and I\'ll answer from what\'s actually been said — with citations back to the thought.',
  },
];

// "Talk to the group" chat shell (M3 in PLAN §6/§9) — open/close only for
// M0. No retrieval, no model call: a canned reply stands in so the surface
// and its citation-chip layout can be reviewed before the real RAG loop and
// provider-agnostic ChatModel port land.
export default function AskOverlay({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>(SEED);
  const [draft, setDraft] = useState('');

  function send() {
    if (!draft.trim()) return;
    const question = draft.trim();
    setMessages(prev => [...prev, { id: 'u_' + Date.now(), role: 'user', text: question }]);
    setDraft('');
    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: 'a_' + Date.now(), role: 'assistant',
        text: 'The collective LLM isn\'t wired up yet (M3) — this is a placeholder reply so the chat surface can be reviewed.',
        citations: [{ label: 'a ritual is just a decision…' }],
      }]);
    }, 400);
  }

  return (
    <OverlayShell title="Ask the group" eyebrow="Collective LLM · preview" onClose={onClose}>
      <div className="flex flex-col gap-3 pb-4">
        {messages.map(m => (
          <div
            key={m.id}
            className="max-w-[85%] rounded-2xl px-4 py-3 text-sm"
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              background: m.role === 'user' ? 'var(--own-soft)' : 'var(--dusk-raised)',
              color: m.role === 'user' ? 'var(--own)' : 'var(--mist)',
              border: '1px solid var(--line)',
            }}
          >
            <p>{m.text}</p>
            {m.citations && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {m.citations.map((c, i) => (
                  <span key={i} className="eyebrow rounded-full border px-2 py-1 !text-[0.6rem]" style={{ borderColor: 'var(--borrowed)', color: 'var(--borrowed)' }}>
                    “{c.label}”
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="fixed inset-x-0 bottom-16 mx-auto flex w-full max-w-md items-center gap-2 px-5 py-2" style={{ background: 'var(--dusk)' }}>
        <TextField
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send(); }}
          placeholder="Ask the group…"
          className="!py-3"
        />
        <button
          onClick={send}
          aria-label="Send"
          className="shrink-0 rounded-full px-4 py-3 text-sm"
          style={{ background: 'var(--own)', color: 'var(--dusk-deep)' }}
        >
          →
        </button>
      </div>
    </OverlayShell>
  );
}
