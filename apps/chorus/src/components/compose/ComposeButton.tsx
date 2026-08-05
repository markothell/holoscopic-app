'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sheet from '@/components/ui/Sheet';
import TagQuestion from './TagQuestion';
import Recorder from './Recorder';
import { ensureContributor, reportFailure, uploadRecording } from '@/services/api';
import { useMemorial } from '@/components/MemorialProvider';
import { type Recording } from '@hs/audio';
import { recordingStash } from '@/lib/stash';
import { classifyFailure, failureMessage } from '@/lib/submitFailure';
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
  // Whether the recording reached IndexedDB. The failure copy promises the
  // recording is saved on this phone, and it may only say so when this is true.
  const [stashed, setStashed] = useState(false);
  const [restored, setRestored] = useState(false);
  // Uploads have stopped working for this person. Everything else about the
  // memory still works, so the sheet turns toward typing rather than leaving
  // them holding a recording that will keep failing.
  const [audioFailed, setAudioFailed] = useState(false);
  // Set while the automatic second attempt is in flight, so a dropped
  // connection resolves itself without the contributor reading an error at all.
  const [retrying, setRetrying] = useState(false);
  // What the share button did, on browsers with no share sheet to speak for it.
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'copy-failed'>('idle');

  // A recording that reached Blob but whose memory failed to save. Keeping it
  // means a retry posts the URL it already has rather than pushing three
  // megabytes up a bad connection a second time — and leaving an orphan behind
  // each time it does.
  const uploadedRef = useRef<{ blob: Blob; url: string; pathname: string } | null>(null);

  // "Add to this memory" starts from the target's title and tags — you are
  // describing the same afternoon, so starting from a blank form would make
  // you retype what the person you're answering already said.
  const [title, setTitle] = useState(addTo?.title ?? '');
  const [sharerName, setSharerName] = useState('');
  const [anon, setAnon] = useState(false);
  const [text, setText] = useState('');
  const [subjectTags, setSubjectTags] = useState<string[]>(addTo?.subjectTags ?? []);
  const [experienceTags, setExperienceTags] = useState<string[]>(addTo?.experienceTags ?? []);

  // TWO NAMES, on purpose. Everything the person composing reads is addressed
  // to someone who knew her, so it uses the short name — "Who was Ellen in this
  // story?" is how the question would actually be asked. The share payload
  // keeps the full name, because that lands in a message to somebody who has
  // not opened the memorial yet and needs to know who it is for.
  const name = memorial.shortName || memorial.subjectName;
  const fullName = memorial.subjectName;

  // A memory needs a name and a story — typed or spoken. The server enforces
  // the same rule; this just stops the button lying about being ready.
  //
  // When uploads are failing, a recording no longer counts as a story: sending
  // would only fail again. Typed words are what can reach the wall right now,
  // so the button waits for them.
  const hasStory = text.trim().length > 0 || (recording !== null && !audioFailed);
  const canSend = title.trim().length > 0 && hasStory && step === 'writing';

  function openSheet() {
    setOpen(true);
    setError(null);
    // Mint the anonymous identity now so the send is one round trip. Nobody
    // who only reads a memorial ever causes this call.
    void ensureContributor(api);
    // A recording stashed by an earlier visit that never made it to a memory —
    // a failed upload, a closed tab, a phone that rang. Writing it to
    // IndexedDB was always half the safety net; this is the half that gives it
    // back. Scoped to this memorial and to the last week, and only when the
    // sheet is otherwise empty, so it can never overwrite live work.
    if (!recording) {
      void recordingStash.read(slug).then(rec => {
        if (!rec) return;
        setRecording(rec);
        setStashed(true);
        setRestored(true);
        setMode('record');
      });
    }
  }

  /**
   * One attempt at the whole send. Throws on failure so `send` can decide
   * whether the failure deserves another one.
   */
  async function attempt() {
    // The recording goes to Blob first, straight from the browser. If this
    // fails we stop here — the recording is still in memory AND stashed in
    // IndexedDB, so the sheet stays open holding a retryable draft rather
    // than posting a memory whose audio silently went missing.
    //
    // Once uploads are known to be failing the memory goes without its audio.
    // The alternative is a person in a room full of people, at the one moment
    // they were moved to say something, watching the same upload fail again.
    let audio = null;
    if (recording && !audioFailed) {
      const done = uploadedRef.current;
      let url: string, pathname: string;
      if (done && done.blob === recording.blob) {
        ({ url, pathname } = done);
      } else {
        setUploadPercent(0);
        try {
          ({ url, pathname } = await uploadRecording(recording.blob, {
            instance: slug,
            mimeType: recording.mimeType,
            onProgress: setUploadPercent,
          }));
        } catch (err) {
          throw Object.assign(err instanceof Error ? err : new Error(String(err)), {
            stage: 'upload' as const,
          });
        }
        uploadedRef.current = { blob: recording.blob, url, pathname };
      }
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
    return memory;
  }

  async function send() {
    if (!canSend) return;
    setStep('sending');
    setError(null);

    const token = await ensureContributor(api);
    if (!token) {
      setStep('writing');
      setError('The server did not answer. Your memory is still here — tap Send to try again.');
      return;
    }

    for (let attempts = 1; ; attempts++) {
      try {
        const memory = await attempt();
        setCreatedId(memory.id);
        setStep('done');
        setRetrying(false);
        // Only now is the recording safely somewhere other than this device —
        // and only if it actually went. A memory posted as words while uploads
        // were failing leaves the recording exactly where it was, which is the
        // whole reason the stash is worth keeping.
        if (!audioFailed) {
          void recordingStash.clear();
          uploadedRef.current = null;
        }
        router.refresh();   // the wall behind the sheet now includes this
        return;
      } catch (err) {
        const stage = (err as { stage?: 'upload' | 'create' }).stage ?? 'create';
        const failure = classifyFailure(err, stage);

        // A dropped connection is the common case and fixes itself. Trying
        // once more before saying anything means most people never see an
        // error for something that was over in a second.
        if (failure.kind === 'retry-now' && attempts === 1) {
          setRetrying(true);
          setUploadPercent(null);
          await new Promise(r => setTimeout(r, 900));
          continue;
        }

        // Never close the sheet on failure: the draft in these fields is the
        // only copy of something the person may have taken ten minutes to write.
        setRetrying(false);
        setStep('writing');
        setUploadPercent(null);
        setError(failureMessage(failure, { hasRecording: recording !== null, stashed }));
        // Send them to the keyboard, where the story can still be saved today.
        if (failure.stage === 'upload' && failure.kind !== 'retry-now') {
          setAudioFailed(true);
          setMode('type');
        }
        void reportFailure(slug, {
          stage: failure.stage,
          kind: failure.kind,
          code: failure.code,
          detail: failure.detail,
          mimeType: recording?.mimeType,
          sizeBytes: recording?.blob.size,
          durationMs: recording?.durationMs,
          attempts,
        });
        return;
      }
    }
  }

  async function share() {
    const memorialUrl = `${window.location.origin}${base}`;
    const url = createdId ? `${memorialUrl}/m/${createdId}` : memorialUrl;
    const shareData = {
      title: `Memories of ${fullName}`,
      text: `I left a memory of ${fullName}. Add yours.`,
      url,
    };
    // The share sheet is its own confirmation; copying to the clipboard is
    // silent. Without this, tapping the primary button on the post-submit
    // screen in any browser without navigator.share — desktop Firefox, older
    // Safari — looks like nothing happened, on the one screen that decides
    // whether the memorial spreads.
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // A cancelled share sheet is a normal outcome, not a failure.
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setShareState('copied');
    } catch {
      // Clipboard access can be denied outright. Saying so is better than
      // showing a success the visitor cannot check.
      setShareState('copy-failed');
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
            {/* The recording is still on this phone and nowhere else. Say so on
                the one screen they are certain to read, and name the way back:
                the addition flow restores the stash into the same thread. */}
            {audioFailed && (
              <p className="mt-4 rounded-[3px] bg-card px-4 py-3 text-[0.9375rem] leading-[1.55] text-ink-soft">
                Your recording is still on this phone. Come back to this memory and tap
                “Add to this memory” — it will be waiting there.
              </p>
            )}
            <button
              type="button"
              onClick={share}
              className="mt-7 w-full rounded-[3px] bg-dial px-5 py-3.5 text-[1rem] font-medium
                         text-card-raised"
            >
              Send this to someone who knew {name}
            </button>
            {/* Only ever set where there is no share sheet to confirm for
                itself — aria-live so it is announced rather than only seen. */}
            {shareState !== 'idle' && (
              <p className="mt-2 text-[0.875rem] text-ink-faint" aria-live="polite">
                {shareState === 'copied'
                  ? 'Link copied — paste it into a message.'
                  : 'Copy the link from your address bar to send it.'}
              </p>
            )}
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
                    // Points at the button beside it, because testers read the
                    // two controls as unrelated choices — the field looked like
                    // the only thing to do. A sample name ("Ruth") made that
                    // worse once the placeholder became a sentence.
                    //
                    // 164px, against an inner width of 128px at 320px and
                    // 168px at 360px. So it fits from a 360px phone up and
                    // clips on a 320px one (an iPhone SE/5) — and a placeholder
                    // clips from the RIGHT, meaning the arrow is what goes.
                    // That is a DECIDED trade, not an oversight: the shorter
                    // "Name or click →" fits everywhere, and the full wording
                    // was chosen on the bet that this memorial's visitors are
                    // mostly on current phones. Revisit it, don't silently
                    // shorten it.
                    placeholder={anon ? 'Anonymous' : 'Enter name or click →'}
                    className="min-w-0 flex-1 rounded-[3px] border border-[var(--rule-strong)]
                               bg-card-raised px-3.5 py-2.5 text-[1.0625rem] text-ink outline-none
                               placeholder:text-ink-faint focus:border-dial
                               disabled:bg-card disabled:text-ink-faint"
                  />
                  {/* One tap, right beside the field. Posting unnamed has to be
                      as easy as typing a name, or the people who feel they
                      don't belong in the story don't post at all.

                      Spelled out rather than "Anon": abbreviated, it read as a
                      label on the field rather than an alternative to filling
                      it in, and testers took the two controls for unrelated
                      choices. It costs 46px of a 320px row, which is what the
                      placeholder beside it gave up. */}
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
                    Anonymous
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
                    {restored && recording && (
                      <p className="mb-2 text-[0.8125rem] text-ink-soft">
                        A recording you made here is still on this phone. Listen to it below,
                        or record it again.
                      </p>
                    )}
                    <Recorder
                      maxSeconds={memorial.audioMaxSeconds}
                      recording={recording}
                      onRecording={(rec, didStash) => {
                        setRecording(rec);
                        setStashed(rec ? didStash === true : false);
                        setRestored(false);
                        // A different recording invalidates the uploaded one.
                        uploadedRef.current = null;
                      }}
                    />
                  </div>
                )}

                {/* A recording made and then switched away from is easy to
                    forget about; say plainly what is going to happen to it. */}
                {mode === 'type' && recording && (
                  <p className="mt-2 text-[0.8125rem] text-ink-soft">
                    {audioFailed
                      ? 'Your recording stays on this phone. Send the words now — you can add the recording once it is working again.'
                      : 'Your recording is attached and will be sent with this memory.'}
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
                  ? (retrying
                      ? 'Trying again…'
                      : uploadPercent !== null && uploadPercent < 100
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
