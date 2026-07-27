'use client';

import { useEffect, useRef, useState } from 'react';
import OverlayShell from './OverlayShell';
import { TextField } from '@/components/ui/TextField';
import { UnisonService } from '@/services/unisonService';
import { ApiError } from '@/services/api';
import type { Citation } from '@/lib/types';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  citations?: Citation[];
  streaming?: boolean;
}

const GREETING: ChatMessage = {
  id: 'm0', role: 'assistant',
  text: 'Ask me anything the group has published, and I\'ll answer from what\'s actually been said — with citations back to the thought.',
};

// "Talk to the group" chat (M3, PLAN §6). Real path: streams POST
// /unison/chat and rehydrates GET /unison/thread on open. Mock/demo path
// (no live community) keeps a canned local-only reply — never a failed
// fetch — matching the pre-M3 stub's preview behavior.

// Reads a `text/event-stream` POST body and dispatches parsed frames.
// EventSource can't POST, so this hand-parses the `event:`/`data:` frames
// the backend writes (routes/unison.js: `res.write('event: x\n')` /
// `res.write('data: json\n\n')`) directly off the fetch Response's
// ReadableStream.
async function consumeChatStream(
  res: Response,
  handlers: {
    onMeta: (citations: Citation[]) => void;
    onToken: (text: string) => void;
    onDone: (citations: Citation[]) => void;
    onError: (message: string) => void;
  },
) {
  const reader = res.body?.getReader();
  if (!reader) {
    handlers.onError('Streaming is not supported in this browser.');
    return;
  }
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = 'message';
      let data = '';
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue;
      let parsed: { citations?: Citation[]; text?: string; error?: string };
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }
      if (event === 'meta') handlers.onMeta(parsed.citations ?? []);
      else if (event === 'token') handlers.onToken(parsed.text ?? '');
      else if (event === 'done') handlers.onDone(parsed.citations ?? []);
      else if (event === 'error') handlers.onError(parsed.error ?? 'Something went wrong.');
    }
  }
}

export default function AskOverlay({
  instanceId,
  userId,
  useMock,
  onClose,
  onOpenPost,
}: {
  instanceId: string;
  userId: string;
  useMock: boolean;
  onClose: () => void;
  // Citation deep-link (task item 2): nodeId always opens the post; replyId
  // (reply citations only) is forwarded so the caller (page.tsx ->
  // MapGraph -> PostOverlay) can scroll to and highlight that exact reply.
  onOpenPost: (nodeId: string, replyId?: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  // 503 "LLM not configured" — sticky for the life of this overlay instance
  // so we don't keep re-hitting a provider that isn't wired up yet.
  const [unconfigured, setUnconfigured] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Thread rehydration (task item 3): on open, pull the caller's persisted
  // turns and render them after the greeting. UnisonThread.turns is a flat
  // alternating user/assistant list; citations only ever ride an assistant
  // turn. Mock/demo mode has no backend thread — it stays on the greeting.
  useEffect(() => {
    if (useMock) return;
    let cancelled = false;
    UnisonService.thread(instanceId, userId)
      .then(({ turns }) => {
        if (cancelled || turns.length === 0) return;
        const rehydrated: ChatMessage[] = turns.map((t, i) => ({
          id: `t_${i}_${t.createdAt}`,
          role: t.role,
          text: t.content,
          citations: t.citations,
        }));
        setMessages(prev => [...prev, ...rehydrated]);
      })
      .catch(err => console.debug('[unison] thread rehydrate failed', err));
    return () => { cancelled = true; };
  }, [useMock, instanceId, userId]);

  // Abort an in-flight stream if the overlay is dismissed mid-answer.
  useEffect(() => () => abortRef.current?.abort(), []);

  function send() {
    if (!draft.trim() || sending) return;
    const question = draft.trim();
    setDraft('');

    if (useMock) {
      // No live community (demo mode) — a disabled/preview state rather
      // than a failed fetch: keep it local-only, no network call.
      setMessages(prev => [...prev, { id: 'u_' + Date.now(), role: 'user', text: question }]);
      setTimeout(() => {
        setMessages(prev => [...prev, {
          id: 'a_' + Date.now(), role: 'assistant',
          text: 'This is a preview — join or create a real community to ask the group for real.',
        }]);
      }, 300);
      return;
    }

    const userMsg: ChatMessage = { id: 'u_' + Date.now(), role: 'user', text: question };
    const assistantId = 'a_' + Date.now();
    const assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', text: '', streaming: true };
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setSending(true);

    const ac = new AbortController();
    abortRef.current = ac;

    function patchAssistant(patch: Partial<ChatMessage>) {
      setMessages(prev => prev.map(m => (m.id === assistantId ? { ...m, ...patch } : m)));
    }

    UnisonService.askStream(instanceId, question, userId, ac.signal)
      .then(res => consumeChatStream(res, {
        // Citations arrive first (meta) so chips can render before the
        // answer text does.
        onMeta: citations => patchAssistant({ citations }),
        onToken: text => setMessages(prev => prev.map(m => (m.id === assistantId ? { ...m, text: m.text + text } : m))),
        onDone: citations => patchAssistant({ citations, streaming: false }),
        onError: message => patchAssistant({ text: message, streaming: false }),
      }))
      .catch(err => {
        if (ac.signal.aborted) return;
        if (err instanceof ApiError && err.status === 503) {
          setUnconfigured(true);
          patchAssistant({
            text: 'Ask the Group isn\'t set up yet — an admin needs to configure an LLM provider for this community.',
            streaming: false,
          });
          return;
        }
        patchAssistant({
          text: err instanceof Error ? err.message : 'The group could not be reached right now.',
          streaming: false,
        });
      })
      .finally(() => {
        setSending(false);
        if (abortRef.current === ac) abortRef.current = null;
      });
  }

  return (
    <OverlayShell title="Ask the group" eyebrow="Collective LLM" onClose={onClose}>
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
            <p className="whitespace-pre-wrap">
              {m.text}
              {m.streaming && <span className="ml-0.5 inline-block animate-pulse" aria-hidden>▍</span>}
            </p>
            {m.citations && m.citations.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {m.citations.map((c, i) => (
                  <button
                    key={`${c.kind}-${c.nodeId}-${c.replyId ?? i}`}
                    type="button"
                    onClick={() => onOpenPost(c.nodeId, c.replyId)}
                    className="eyebrow rounded-full border px-2 py-1 !text-[0.6rem] transition-colors active:opacity-70"
                    style={{
                      borderColor: c.kind === 'reply' ? 'var(--borrowed)' : 'var(--own)',
                      color: c.kind === 'reply' ? 'var(--borrowed)' : 'var(--own)',
                    }}
                    title={c.kind === 'reply' ? `${c.ownerHandle}’s reply` : `${c.ownerHandle}’s thought`}
                  >
                    {c.kind === 'reply' ? '↳' : '◆'} {c.ownerHandle}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="fixed inset-x-0 bottom-16 mx-auto flex w-full max-w-md items-center gap-2 px-5 py-2" style={{ background: 'var(--dusk)' }}>
        {unconfigured ? (
          <p className="eyebrow flex-1 rounded-2xl border border-line-strong px-4 py-3 text-center !text-[0.65rem] text-mist-faint">
            Ask the Group isn&rsquo;t set up yet
          </p>
        ) : (
          <>
            <TextField
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') send(); }}
              placeholder="Ask the group…"
              disabled={sending}
              className="!py-3"
            />
            <button
              onClick={send}
              disabled={sending || !draft.trim()}
              aria-label="Send"
              className="shrink-0 rounded-full px-4 py-3 text-sm disabled:opacity-40"
              style={{ background: 'var(--own)', color: 'var(--dusk-deep)' }}
            >
              →
            </button>
          </>
        )}
      </div>
    </OverlayShell>
  );
}
