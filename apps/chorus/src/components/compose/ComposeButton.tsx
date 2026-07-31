'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Sheet from '@/components/ui/Sheet';
import TagQuestion from './TagQuestion';
import Recorder from './Recorder';
import { ensureContributor, uploadRecording } from '@/services/api';
import { useMemorial } from '@/components/MemorialProvider';
import { clearStashedRecording, type Recording } from '@/lib/recorder';
import type { AddTarget, Memorial, Tag } from '@/lib/types';

// Both ways into composing: the landing page's primary action, and "Add to
// this memory" on a memory page. Same sheet — an addition is an ordinary
// memory that happens to know what it was added to, so there is no second
// form to keep in sync.
//
// Trigger and sheet live in one component because the trigger is the only
// thing that opens it. Splitting them would mean a context provider for a
// piece of state exactly one button ever sets.

const TITLE_MAX = 80;
const NAME_MAX = 60;
const TEXT_MAX = 5000;

type Step = 'writing' | 'sending' | 'done';
type Mode = 'type' | 'record';

interface Props {
  memorial: Memorial;
  /** Both vocabularies, most-used first — the questions show the head of each. */
  tags: { role: Tag[]; experience: Tag[] };
  variant: 'primary' | 'secondary';
  label: string;
  /** Present when this composes an addition to an existing memory. */
  addTo?: AddTarget | null;
}

export default function ComposeButton({ memorial, tags, variant, label, addTo = null }: Props) {
  const router = useRouter();
  // Which memorial this memory is being written into. Comes from the route
  // rather than a prop so no caller can get it wrong.
  const { slug, api } = useMemorial();
  const base = `/c/${slug}`;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('writing');
  const [mode, setMode] = useState<Mode>('type');
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);

  // "Add to this memory" starts from the target's title and tags — you are
  // describing the same afternoon, so starting from a blank form would make
  // you retype what the person you're answering already said.
  const [title, setTitle] = useState(addTo?.title ?? '');
  const [sharerName, setSharerName] = useState('');
  const [anon, setAnon] = useState(false);
  const [text, setText] = useState('');
  const [subjectTags, setSubjectTags] = useState<string[]>(addTo?.subjectTags ?? []);
  const [experienceTags, setExperienceTags] = useState<string[]>(addTo?.experienceTags ?? []);

  const name = memorial.subjectName;

  // A memory needs a name and a story — typed or spoken. The server enforces
  // the same rule; this just stops the button lying about being ready.
  const hasStory = text.trim().length > 0 || recording !== null;
  const canSend = title.trim().length > 0 && hasStory && step === 'writing';

  function openSheet() {
    setOpen(true);
    setError(null);
    // Mint the anonymous identity now so the send is one round trip. Nobody
    // who only reads a memorial ever causes this call.
    void ensureContributor(api);
  }

  async function send() {
    if (!canSend) return;
    setStep('sending');
    setError(null);

    const token = await ensureContributor(api);
    if (!token) {
      setStep('writing');
      setError('Couldn’t reach the server. Your memory is still here — try again.');
      return;
    }

    try {
      // The recording goes to Blob first, straight from the browser. If this
      // fails we stop here — the recording is still in memory AND stashed in
      // IndexedDB, so the sheet stays open holding a retryable draft rather
      // than posting a memory whose audio silently went missing.
      let audio = null;
      if (recording) {
        setUploadPercent(0);
        const { url, pathname } = await uploadRecording(recording.blob, {
          instance: slug,
          mimeType: recording.mimeType,
          onProgress: setUploadPercent,
        });
        audio = {
          url, pathname,
          mimeType: recording.mimeType,
          durationMs: recording.durationMs,
          peaks: recording.peaks,
        };
      }

      const { memory } = await api.create({
        title: title.trim(),
        sharerName: anon ? '' : sharerName.trim(),
        subjectTags, experienceTags,
        text: text.trim(),
        audio,
        replyToId: addTo?.id ?? null,
      });
      setCreatedId(memory.id);
      setStep('done');
      // Only now is the recording safely somewhere other than this device.
      void clearStashedRecording();
      router.refresh();   // the wall behind the sheet now includes this
    } catch (err) {
      // Never close the sheet on failure: the draft in these fields is the
      // only copy of something the person may have taken ten minutes to write.
      setStep('writing');
      setUploadPercent(null);
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    }
  }

  async function share() {
    const memorialUrl = `${window.location.origin}${base}`;
    const url = createdId ? `${memorialUrl}/m/${createdId}` : memorialUrl;
    const shareData = {
      title: `Memories of ${name}`,
      text: `I left a memory of ${name}. Add yours.`,
      url,
    };
    try {
      if (navigator.share) await navigator.share(shareData);
      else await navigator.clipboard.writeText(url);
    } catch {
      // A cancelled share sheet is a normal outcome, not a failure.
    }
  }

  function finish() {
    setOpen(false);
    if (createdId) router.push(`${base}/m/${createdId}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        className={variant === 'primary'
          ? `w-full rounded-[3px] bg-dial px-5 py-3.5 text-[1rem] font-medium
             text-card-raised shadow-[var(--shadow-card)] transition-opacity active:opacity-85`
          : `w-full rounded-[3px] border px-5 py-3.5 text-[1rem] font-medium text-ink
             transition-colors active:bg-card`}
        style={variant === 'secondary' ? { borderColor: 'var(--rule-strong)' } : undefined}
      >
        {label}
      </button>

      <Sheet
        open={open}
        onClose={() => (step === 'done' ? finish() : setOpen(false))}
        label={addTo ? `Add to “${addTo.title}”` : `Share a memory of ${name}`}
        // The confirmation is four lines; a full-height sheet around it reads
        // as an empty room rather than a moment.
        height={step === 'done' ? 'short' : 'tall'}
      >
        {step === 'done' ? (
          // The share moment. Right after contributing is the only time
          // somebody forwards the link, so this is the screen that decides
          // whether the memorial spreads (PLAN §1).
          <div className="flex flex-col px-6 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))] text-center">
            <p className="voice text-[1.5rem] leading-snug text-ink">
              Your memory is on the wall.
            </p>
            <p className="voice mt-3 text-[1.0625rem] leading-[1.6] text-ink-soft">
              Someone else remembers this too. Send it to them.
            </p>
            <button
              type="button"
              onClick={share}
              className="mt-7 w-full rounded-[3px] bg-dial px-5 py-3.5 text-[1rem] font-medium
                         text-card-raised"
            >
              Send this to someone who knew {name}
            </button>
            <button
              type="button"
              onClick={finish}
              className="mt-3 px-5 py-3 text-[0.9375rem] text-ink-faint"
            >
              See it on the wall
            </button>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
              {addTo && (
                <p className="eyebrow pt-1 pb-3">Adding to “{addTo.title}”</p>
              )}

              {/* Two questions, each with its likely answers already on the
                  page. This used to be the prompt sentence with three tappable
                  blanks — the same data, but it read as something to decode
                  rather than something to answer. The sentence is still how a
                  finished memory reads; it is no longer how one is written. */}
              <div className="flex flex-col gap-7 py-2">
                <TagQuestion
                  question={`Who was ${name} in this story?`}
                  vocabulary={tags.role}
                  selected={subjectTags}
                  onChange={setSubjectTags}
                  allowCustom={memorial.allowCustomTags}
                />
                <TagQuestion
                  question="What was this an experience of?"
                  vocabulary={tags.experience}
                  selected={experienceTags}
                  onChange={setExperienceTags}
                  allowCustom={memorial.allowCustomTags}
                />
              </div>

              <label className="mt-7 block">
                <span className="eyebrow">Give it a short name</span>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value.slice(0, TITLE_MAX))}
                  placeholder="The kitchen radio"
                  className="mt-2 w-full rounded-[3px] border border-[var(--rule-strong)]
                             bg-card-raised px-3.5 py-2.5 text-[1.0625rem] text-ink outline-none
                             placeholder:text-ink-faint focus:border-dial"
                />
              </label>

              <div className="mt-5">
                <span className="eyebrow">Your name</span>
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={anon ? '' : sharerName}
                    onChange={e => setSharerName(e.target.value.slice(0, NAME_MAX))}
                    disabled={anon}
                    placeholder={anon ? 'Anonymous' : 'Ruth'}
                    className="min-w-0 flex-1 rounded-[3px] border border-[var(--rule-strong)]
                               bg-card-raised px-3.5 py-2.5 text-[1.0625rem] text-ink outline-none
                               placeholder:text-ink-faint focus:border-dial
                               disabled:bg-card disabled:text-ink-faint"
                  />
                  {/* One tap, right beside the field. Anon has to be as easy
                      as typing a name, or the people who feel they don't
                      belong in the story don't post at all. */}
                  <button
                    type="button"
                    onClick={() => setAnon(a => !a)}
                    aria-pressed={anon}
                    className={`shrink-0 rounded-[3px] px-4 text-[0.9375rem] font-medium
                                transition-colors
                                ${anon
                                  ? 'bg-dial text-card-raised'
                                  : 'border border-[var(--rule-strong)] text-ink-soft'}`}
                  >
                    Anon
                  </button>
                </div>
              </div>

              <div className="mt-5">
                <div className="flex items-baseline justify-between">
                  <span className="eyebrow">The story</span>
                  {/* Two ways to tell it, given equal weight. Voice is what a
                      grandchild will actually do, so it can't be hidden
                      behind a secondary affordance. */}
                  <div className="flex gap-1 rounded-full bg-card p-1">
                    {(['type', 'record'] as const).map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        aria-pressed={mode === m}
                        className={`rounded-full px-4 py-1.5 text-[0.875rem] font-medium
                                    transition-colors
                                    ${mode === m
                                      ? 'bg-dial text-card-raised'
                                      : 'text-ink-soft'}`}
                      >
                        {m === 'type' ? 'Type' : 'Record'}
                      </button>
                    ))}
                  </div>
                </div>

                {mode === 'type' ? (
                  <textarea
                    value={text}
                    onChange={e => setText(e.target.value.slice(0, TEXT_MAX))}
                    rows={7}
                    placeholder={`Tell us something about ${name} we wouldn’t otherwise know.`}
                    className="voice mt-2 w-full resize-y rounded-[3px] border
                               border-[var(--rule-strong)] bg-card-raised px-3.5 py-3
                               text-[1.0625rem] leading-[1.6] text-ink outline-none
                               placeholder:text-ink-faint focus:border-dial"
                  />
                ) : (
                  <div className="mt-2">
                    <Recorder
                      maxSeconds={memorial.audioMaxSeconds}
                      recording={recording}
                      onRecording={setRecording}
                    />
                  </div>
                )}

                {/* A recording made and then switched away from is easy to
                    forget about; say plainly that it's still going to be sent. */}
                {mode === 'type' && recording && (
                  <p className="mt-2 text-[0.8125rem] text-ink-soft">
                    Your recording is attached and will be sent with this memory.
                  </p>
                )}
              </div>

              <p className="mt-3 text-[0.8125rem] text-ink-faint">
                Memories are public on this page.
              </p>
            </div>

            <div className="border-t border-rule px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {error && (
                <p role="alert" className="mb-2 text-[0.875rem] text-dial">{error}</p>
              )}
              <button
                type="button"
                onClick={send}
                disabled={!canSend}
                className="w-full rounded-[3px] bg-dial px-5 py-3.5 text-[1rem] font-medium
                           text-card-raised transition-opacity disabled:opacity-35"
              >
                {step === 'sending'
                  ? (uploadPercent !== null && uploadPercent < 100
                      ? `Sending your recording… ${uploadPercent}%`
                      : 'Sending…')
                  : addTo ? 'Add this memory' : 'Share this memory'}
              </button>
            </div>
          </>
        )}
      </Sheet>
    </>
  );
}
