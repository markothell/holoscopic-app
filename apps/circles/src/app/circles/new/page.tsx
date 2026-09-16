'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { circlesApi, ApiError } from '@/services/api';
import { Page, Band, Card, Action, Quiet, Muted } from '@/components/Shell';

// Start a circle — the surface P15 rung 2 had been waiting on.
//
// Ongoing circle creation left Threshold's UI when its /new became "start a
// session" (P16), and Q6 parked it in the platform admin, a surface that was
// specified and never built. So until this page, every circle on production
// was made by running the funnel from a laptop, and the product had no way to
// make the thing it is named after.
//
// A circle is born in DRAFT: named, with nobody in it but you. Opening it is a
// second, deliberate act on the circle page — which is what lets you invite
// people, watch them take their seats, and only then start the machine, rather
// than mailing a room that is still being furnished.

/** The address a title will take. The server slugs it identically; showing it
 *  here means nobody discovers their circle's URL after the fact. */
function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
}

function Choice({ selected, onSelect, title, note }: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  note: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={
        'cursor-pointer rounded-xl border p-4 text-left transition-colors '
        + (selected
          ? 'border-[var(--rule-strong)] bg-ground-deep'
          : 'border-[var(--rule)] hover:bg-ground-deep/50')
      }
    >
      <span className="block text-[15px]">{title}</span>
      <span className="mt-1 block text-sm text-ink-faint">{note}</span>
    </button>
  );
}

export default function NewCirclePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  const [title, setTitle] = useState('');
  const [byInvitation, setByInvitation] = useState(true);
  const [seats, setSeats] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const urlName = slugify(title);
  const ready = Boolean(urlName);

  if (status === 'loading') return <Page><Muted>…</Muted></Page>;

  if (!userId) {
    return (
      <Page>
        <h1 className="mb-2 text-3xl">Sign in</h1>
        <Muted>A circle belongs to the account that starts it.</Muted>
        <div className="mt-5"><Action href="/login?callbackUrl=/circles/new">Sign in</Action></div>
      </Page>
    );
  }

  const create = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { circle } = await circlesApi.createCircle(userId, {
        title: title.trim(),
        urlName,
        requireInvitation: byInvitation,
        invitedEmails: byInvitation
          ? seats.split(/[\s,]+/).map(s => s.trim().toLowerCase()).filter(Boolean)
          : [],
      });
      // Hand over to the page the host will return to from now on, rather than
      // inventing a second place to press start.
      router.push(`/c/${circle.urlName}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not work');
      setBusy(false);
    }
  };

  return (
    <Page>
      <header className="mb-8">
        <Quiet href="/circles">Your circles</Quiet>
        <h1 className="mt-2 text-3xl leading-tight">Start a circle</h1>
        <p className="mt-1 text-sm text-ink-faint">
          A group that keeps meeting. You host it: you invite the people and you decide what runs.
        </p>
      </header>

      {error && <p className="mb-6 text-sm text-ochre">{error}</p>}

      <Card>
        <Band>What to call it</Band>
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          maxLength={80}
          placeholder="Thursday evenings"
          className="w-full rounded-lg border border-[var(--rule)] bg-ground/40 p-3 text-[15px] outline-none focus:border-[var(--rule-strong)]"
        />
        {urlName && (
          <p className="mt-2 text-xs text-ink-faint">
            Its link will be circles.holoscopic.io/c/{urlName}
          </p>
        )}
      </Card>

      <div className="mt-6">
        <Card>
          <Band>Who can take a seat</Band>
          <div className="grid gap-3 sm:grid-cols-2">
            <Choice
              selected={byInvitation}
              onSelect={() => setByInvitation(true)}
              title="People I invite"
              note="Only addresses you name, and only once their account confirms that address."
            />
            <Choice
              selected={!byInvitation}
              onSelect={() => setByInvitation(false)}
              title="Anyone with the link"
              note="No gate. Right for a group you trust; wrong the moment the link travels."
            />
          </div>

          {byInvitation && (
            <>
              <p className="mt-4 text-sm text-ink-soft">
                Addresses you already know, if you like. You can also make a personal invitation
                link for each person once the circle exists — and that is the only way to add
                somebody later, so leaving this empty costs you nothing.
              </p>
              <textarea
                value={seats}
                onChange={e => setSeats(e.target.value)}
                rows={3}
                placeholder="one@example.com, another@example.com"
                className="mt-3 w-full resize-none rounded-lg border border-[var(--rule)] bg-ground/40 p-3 text-[15px] outline-none focus:border-[var(--rule-strong)]"
              />
            </>
          )}
        </Card>
      </div>

      <div className="mt-8 flex items-center gap-5">
        <Action onClick={create} disabled={!ready || busy}>
          {busy ? 'Starting…' : 'Start it'}
        </Action>
        <Quiet href="/circles">Not now</Quiet>
      </div>

      <p className="mt-4 text-sm text-ink-faint">
        Nothing is sent yet. The circle opens as a draft, and you invite people from its page.
      </p>
    </Page>
  );
}
