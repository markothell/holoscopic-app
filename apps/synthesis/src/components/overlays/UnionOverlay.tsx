'use client';

import { useEffect, useRef, useState } from 'react';
import OverlayShell from './OverlayShell';
import { SynthesisService } from '@/services/synthesisService';
import { ApiError } from '@/services/api';
import type { Citation, SynthesisArtifact, SynthesisCache, SynthesisDepth } from '@/lib/types';

// "The Group" — the union view (S1, UNION.md). Replaces
// the M3 "Ask the Group" Q&A (the old AskOverlay/question-box/per-user chat
// transcript, now removed entirely — there is no second "ask a question"
// personality). One cached, WHOLE-COMMUNITY artifact per depth — brief
// (default, 2-4 sentences) and full (a structured Consensus/Tension/Voices
// read) — generated only on the Synthesize/Expand button and reused across
// every viewer until the corpus changes (a `stale` badge shows when it has).
//
// Real path: GET /synthesis/synthesis on open (last cached result + stale
// badge), then POST /synthesis/synthesis {depth} streams a (re)generation — the
// same hand-parsed `text/event-stream` contract the old chat used for /chat
// (EventSource can't POST; see routes/synthesis.js's STREAMING CONTRACT
// comment). Mock/demo path (no live community) shows a canned local-only
// preview on the Synthesize button, never a failed fetch.

const MOCK_BRIEF =
  'The group leans toward slow, deliberate rituals over spontaneous ones, with a vocal minority pushing back that over-planning kills the point. Ada and Bo’s exchange on habit-vs-ritual is the liveliest thread so far.';
const MOCK_FULL =
  `${MOCK_BRIEF}\n\nConsensus: most members treat a ritual as something you commit to before you feel like it.\nTension: a few argue that naming a routine "ritual" is just over-planning.\nVoices: Ada anchors the deliberate side; Bo pushes back hardest.`;

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

// Reads a `text/event-stream` POST body and dispatches parsed frames — the
// same hand-parse the old AskOverlay used (EventSource can't POST).
async function consumeStream(
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

interface DepthState {
  text: string;
  citations: Citation[];
  generatedAt: string | null;
  streaming: boolean;
}

const EMPTY_DEPTH: DepthState = { text: '', citations: [], generatedAt: null, streaming: false };

function fromArtifact(a?: SynthesisArtifact): DepthState {
  if (!a) return EMPTY_DEPTH;
  return { text: a.text, citations: a.citations, generatedAt: a.generatedAt, streaming: false };
}

function CitationChips({ citations, onOpenPost }: { citations: Citation[]; onOpenPost: (nodeId: string, replyId?: string) => void }) {
  if (citations.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {citations.map((c, i) => (
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
  );
}

// The drafting half of the mechanism. The Union is raw material: a member
// takes the group's read, puts it in words they will stand behind, and sends
// it to the voting surface. Editable by design — an unedited LLM paragraph is
// nobody's position, and the whole point is that a person commits to it.
function StatementComposer({
  instanceId,
  userId,
  seed,
  onDone,
}: {
  instanceId: string;
  userId: string;
  seed: string;
  onDone: () => void;
}) {
  const [text, setText] = useState(seed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remaining = 500 - text.length;

  async function submit() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await SynthesisService.submitStatement(instanceId, userId, text.trim());
      onDone();
    } catch (err) {
      // 409 is the slot budget — a rule, not a fault.
      setError(err instanceof ApiError ? err.message : 'That did not go through');
      setBusy(false);
    }
  }

  return (
    <div className="tone-in rounded-2xl border px-4 py-4" style={{ borderColor: 'var(--own)', background: 'var(--dusk-raised)' }}>
      <p className="eyebrow" style={{ color: 'var(--own)' }}>Your statement</p>
      <p className="mt-1.5 text-[0.7rem] text-mist-faint">
        Say it the way you would stand behind it. The group votes on these words.
      </p>
      <textarea
        value={text}
        onChange={e => setText(e.target.value.slice(0, 500))}
        rows={5}
        className="mt-3 w-full resize-none rounded-xl border px-3 py-2.5 text-sm outline-none"
        style={{ borderColor: 'var(--line-strong)', background: 'var(--dusk-deep)', color: 'var(--mist)' }}
        placeholder="Where this group actually stands…"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="eyebrow !text-[0.6rem] !text-mist-faint">{remaining} left</span>
        <span className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDone}
            className="eyebrow !text-[0.6rem] underline"
            style={{ color: 'var(--mist-faint)' }}
          >
            cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !text.trim()}
            className="rounded-full px-4 py-2 text-sm font-medium disabled:opacity-40"
            style={{ background: 'var(--own)', color: 'var(--dusk-deep)' }}
          >
            {busy ? 'Sending…' : 'Put it to the group'}
          </button>
        </span>
      </div>
      {error && <p className="mt-2 text-sm" style={{ color: 'var(--live)' }}>{error}</p>}
    </div>
  );
}

export default function UnionOverlay({
  instanceId,
  userId,
  useMock,
  onClose,
  onOpenPost,
  onStatementSubmitted,
}: {
  instanceId: string;
  userId: string;
  useMock: boolean;
  onClose: () => void;
  // Citation deep-link: nodeId always opens the post; replyId (reply
  // citations only) is forwarded so the caller (page.tsx -> MapGraph ->
  // PostOverlay) can scroll to and highlight that exact reply.
  onOpenPost: (nodeId: string, replyId?: string) => void;
  // A submitted statement belongs on the voting surface, so the caller can
  // hand the member straight over to it.
  onStatementSubmitted?: () => void;
}) {
  const [composing, setComposing] = useState(false);
  const [brief, setBrief] = useState<DepthState>(EMPTY_DEPTH);
  const [full, setFull] = useState<DepthState>(EMPTY_DEPTH);
  const [expanded, setExpanded] = useState(false);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(!useMock);
  const [busyDepth, setBusyDepth] = useState<SynthesisDepth | null>(null);
  // 503 "LLM not configured" — sticky for the life of this overlay instance,
  // same discipline as the old chat's `unconfigured` flag.
  const [unconfigured, setUnconfigured] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // On open: pull the last cached result (brief + full, if either was ever
  // generated) so a returning member sees where things stood without
  // re-synthesizing. Mock/demo mode has no backend cache — starts empty.
  useEffect(() => {
    if (useMock) { setLoading(false); return; }
    let cancelled = false;
    SynthesisService.getSynthesis(instanceId, userId)
      .then((cache: SynthesisCache) => {
        if (cancelled) return;
        setBrief(fromArtifact(cache.brief));
        setFull(fromArtifact(cache.full));
        setExpanded(!!cache.full);
        setStale(cache.stale);
      })
      .catch(err => console.debug('[synthesis] synthesis load failed', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [useMock, instanceId, userId]);

  // Abort an in-flight stream if the overlay is dismissed mid-generation.
  useEffect(() => () => abortRef.current?.abort(), []);

  function generate(depth: SynthesisDepth) {
    if (busyDepth) return;
    const setter = depth === 'brief' ? setBrief : setFull;

    if (useMock) {
      // No live community (demo mode) — a disabled/preview state rather
      // than a failed fetch: a canned local-only result, no network call.
      setter({ text: '', citations: [], generatedAt: null, streaming: true });
      setBusyDepth(depth);
      setTimeout(() => {
        setter({
          text: depth === 'brief' ? MOCK_BRIEF : MOCK_FULL,
          citations: [],
          generatedAt: new Date().toISOString(),
          streaming: false,
        });
        setBusyDepth(null);
      }, 350);
      return;
    }

    // The stale badge reflects the BRIEF artifact (routes/synthesis.js's
    // toClientCache) — only a brief regeneration clears it.
    if (depth === 'brief') setStale(false);
    setter(prev => ({ ...prev, text: '', streaming: true }));
    setBusyDepth(depth);

    const ac = new AbortController();
    abortRef.current = ac;

    SynthesisService.synthesizeStream(instanceId, depth, userId, ac.signal)
      .then(res => consumeStream(res, {
        // Citations arrive first (meta) so chips can render before the text does.
        onMeta: citations => setter(prev => ({ ...prev, citations })),
        onToken: text => setter(prev => ({ ...prev, text: prev.text + text })),
        onDone: citations => setter(prev => ({ ...prev, citations, streaming: false, generatedAt: new Date().toISOString() })),
        onError: message => setter(prev => ({ ...prev, text: message, streaming: false })),
      }))
      .catch(err => {
        if (ac.signal.aborted) return;
        if (err instanceof ApiError && err.status === 503) {
          setUnconfigured(true);
          setter(prev => ({
            ...prev,
            text: 'The Group isn’t set up yet — an admin needs to configure an LLM provider for this community.',
            streaming: false,
          }));
          return;
        }
        setter(prev => ({
          ...prev,
          text: err instanceof Error ? err.message : 'The synthesis could not be generated right now.',
          streaming: false,
        }));
      })
      .finally(() => {
        setBusyDepth(null);
        if (abortRef.current === ac) abortRef.current = null;
      });
  }

  const hasBrief = brief.text.length > 0;
  const hasFull = full.text.length > 0;

  return (
    <OverlayShell title="The Group" eyebrow="Union" onClose={onClose}>
      {loading ? (
        <p className="eyebrow text-mist-faint">Loading…</p>
      ) : (
        <div className="flex flex-col gap-4 pb-4">
          <div
            className="rounded-2xl border px-4 py-4 text-sm"
            style={{ borderColor: 'var(--line)', background: 'var(--dusk-raised)', color: 'var(--mist)' }}
          >
            {hasBrief ? (
              <>
                <p className="whitespace-pre-wrap">
                  {brief.text}
                  {brief.streaming && <span className="ml-0.5 inline-block animate-pulse" aria-hidden>▍</span>}
                </p>
                <CitationChips citations={brief.citations} onOpenPost={onOpenPost} />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {brief.generatedAt && (
                    <span className="eyebrow !text-[0.6rem] text-mist-faint">as of {timeAgo(brief.generatedAt)}</span>
                  )}
                  {stale && (
                    <span
                      className="eyebrow rounded-full border px-2 py-0.5 !text-[0.6rem]"
                      style={{ borderColor: 'var(--live)', color: 'var(--live)' }}
                    >
                      stale — new activity since
                    </span>
                  )}
                </div>
              </>
            ) : (
              <p className="eyebrow !text-[0.7rem] text-mist-faint">
                {busyDepth === 'brief'
                  ? 'Synthesizing…'
                  : 'Nothing synthesized yet — hit Synthesize to see where the group stands.'}
              </p>
            )}
          </div>

          {unconfigured ? (
            <p className="eyebrow rounded-2xl border border-line-strong px-4 py-3 text-center !text-[0.65rem] text-mist-faint">
              The Group isn&rsquo;t set up yet
            </p>
          ) : (
            <button
              onClick={() => generate('brief')}
              disabled={busyDepth !== null}
              className="rounded-full px-4 py-3 text-sm font-medium disabled:opacity-40"
              style={{ background: 'var(--own)', color: 'var(--dusk-deep)' }}
            >
              {busyDepth === 'brief' ? 'Synthesizing…' : hasBrief ? 'Refresh' : 'Synthesize'}
            </button>
          )}

          {hasBrief && !unconfigured && (
            <button
              onClick={() => { setExpanded(true); if (!hasFull) generate('full'); }}
              disabled={busyDepth !== null}
              className="eyebrow rounded-full border border-line-strong px-4 py-2 !text-[0.7rem] text-mist-soft disabled:opacity-40"
            >
              {expanded ? (busyDepth === 'full' ? 'Expanding…' : 'Refresh full read') : 'Expand'}
            </button>
          )}

          {/* The hand-off into the mechanism. Seeded with the union's own
              words so the first act is editing rather than facing a blank
              box — but it is a seed, not a submission. */}
          {!useMock && !unconfigured && (
            composing ? (
              <StatementComposer
                instanceId={instanceId}
                userId={userId}
                seed={brief.text}
                onDone={() => { setComposing(false); onStatementSubmitted?.(); }}
              />
            ) : (
              <button
                onClick={() => setComposing(true)}
                disabled={busyDepth !== null}
                className="rounded-full px-4 py-3 text-sm font-medium disabled:opacity-40"
                style={{ background: 'var(--own-soft)', color: 'var(--own)', border: '1px solid var(--own)' }}
              >
                {hasBrief ? 'Draft a statement from this' : 'Draft a statement'}
              </button>
            )
          )}

          {expanded && (
            <div
              className="rounded-2xl border px-4 py-4 text-sm"
              style={{ borderColor: 'var(--line)', background: 'var(--dusk-raised)', color: 'var(--mist)' }}
            >
              <p className="whitespace-pre-wrap">
                {full.text}
                {full.streaming && <span className="ml-0.5 inline-block animate-pulse" aria-hidden>▍</span>}
                {!full.text && busyDepth !== 'full' && 'Hit Expand for a structured read.'}
              </p>
              <CitationChips citations={full.citations} onOpenPost={onOpenPost} />
              {full.generatedAt && (
                <p className="mt-3 eyebrow !text-[0.6rem] text-mist-faint">as of {timeAgo(full.generatedAt)}</p>
              )}
            </div>
          )}
        </div>
      )}
    </OverlayShell>
  );
}
