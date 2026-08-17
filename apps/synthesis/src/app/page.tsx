'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import MapGraph from '@/components/graph/MapGraph';
import OverlayDock, { type OverlayKey } from '@/components/overlays/OverlayDock';
import FeedOverlay from '@/components/overlays/FeedOverlay';
import UnionOverlay from '@/components/overlays/UnionOverlay';
import StatementsOverlay from '@/components/statements/StatementsOverlay';
import PeopleOverlay from '@/components/ideas/PeopleOverlay';
import IdeaList from '@/components/ideas/IdeaList';
import LoggedOutLanding from '@/components/ideas/LoggedOutLanding';
import { useIdeas } from '@/hooks/useIdeas';
import { synthesisSocket } from '@/services/socket';
import { SynthesisService } from '@/services/synthesisService';
import { MOCK_COMMUNITY, MOCK_USER_HANDLE, MOCK_USER_ID } from '@/lib/mock';

// The `synthesis` PARENT_INSTANCE_ID (services/api.ts) only fronts auth and
// /synthesis/ideas* (draft/join by code) — a joined idea is its OWN child
// Instance, and every /nodes*/frames* call carries THAT instance id as
// x-instance-id (routes/synthesis.js). Once useIdeas resolves a real
// membership, its `idea.id` replaces MOCK_COMMUNITY.id below and the whole
// tree (map, feed, post/reply, sockets) switches from local-seed mode to the
// live backend — see `useMock` threaded through MapGraph/FeedOverlay.

// D15 supersedes half of D7: the app's home is the IDEAS LIST, and the map is
// home WITHIN an idea. So this route renders one of three things — a landing
// when signed out, the ideas list when signed in with nothing open, and the
// map once an idea is active. Feed / Union stay overlays over the map
// (OverlayDock) rather than routes, which keeps the graph mounted (and its
// local state) while a collaborator steps in and out of them. Post is not a
// dock destination: it opens from a specific thought — a map node or a Feed
// item — via openPostRequest, forwarded into MapGraph (which owns PostOverlay
// alongside the other node-detail surfaces it already renders).
//
// Selection is always explicit: only a real click (selectIdea/draft/join) — or
// the "try the demo" opt-in — reveals a map, so nobody is auto-dropped into
// whichever idea was open last. `demoMode` is local, unpersisted state: a
// deliberately temporary look at the mock corpus, and never a fallback.
function LoadingShell({ label }: { label: string }) {
  return (
    <main className="flex min-h-dvh w-full items-center justify-center">
      <p className="eyebrow text-mist-faint">{label}</p>
    </main>
  );
}

// Two figures — the members door in the map's top-left corner. Drawn rather
// than imported: it is the only icon on this surface, and a glyph would sit
// at whatever weight the system font decided.
function MembersIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.2 19c0-3.1 2.6-5.2 5.8-5.2s5.8 2.1 5.8 5.2" />
      <path d="M16.4 5.2a3.2 3.2 0 0 1 0 5.9" />
      <path d="M17.6 13.9c1.9.6 3.2 2.3 3.2 4.4" />
    </svg>
  );
}

export default function HomePage() {
  const { userId, userName, isAuthenticated, isLoading, logout } = useAuth();
  const {
    ideas, idea, membership,
    loading: ideasLoading, checked: ideasChecked, error: ideasError,
    clearError, selectIdea, leaveActive, draft, join,
  } = useIdeas(userId);
  const [overlay, setOverlay] = useState<OverlayKey>(null);
  // nodeId always set; replyId only present when the request came from a
  // reply citation chip (UnionOverlay) — MapGraph forwards it to
  // PostOverlay so the specific reply can be scrolled to and highlighted.
  const [openPostRequest, setOpenPostRequest] = useState<{ nodeId: string; replyId?: string } | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  // The group's live measure, held here so the map's home hub and the dock
  // agree with the voting surface without either owning the other.
  const [inSynthesis, setInSynthesis] = useState(false);
  // The roster is opened from the members icon, never from the dock: it
  // answers a question you have while looking at the map, and the dock is
  // already carrying the four destinations.
  const [showPeople, setShowPeople] = useState(false);

  const showMap = demoMode || (isAuthenticated && !!idea);

  // No live idea yet (demo, or checked-and-empty) → the app keeps rendering
  // on seed data (guardrail: never hard-crash without a backend or a joined
  // idea). Once a real idea is ACTIVE, everything below switches to the live
  // instance + handle.
  const useMock = !idea;
  const instanceId = idea?.id ?? MOCK_COMMUNITY.id;
  const effectiveUserId = userId ?? MOCK_USER_ID;
  const effectiveHandle = membership?.handle ?? userName ?? MOCK_USER_HANDLE;
  // Real ideas start at 1 (you); collaboratorCount is backfilled from the
  // lookup endpoint by useIdeas. Only the mock shows the seed count.
  const memberCount = (useMock ? MOCK_COMMUNITY.collaboratorCount : idea?.collaboratorCount) ?? 1;
  const ideaCode = idea?.code ?? null; // the shareable invite code (real idea only)

  // One socket connection per live idea, owned here; overlays and
  // MapGraph only ever subscribe (synthesisSocket.on), never connect/disconnect
  // themselves, so there's a single lifecycle to reason about.
  useEffect(() => {
    if (useMock) return;
    synthesisSocket.connect(instanceId);
    return () => synthesisSocket.disconnect();
  }, [useMock, instanceId]);

  // Seed the measure on open, then follow the room. Synthesis is living, so
  // this listens for movement in BOTH directions rather than latching once.
  useEffect(() => {
    if (useMock) { setInSynthesis(false); return; }
    let cancelled = false;
    SynthesisService.statements(instanceId, effectiveUserId)
      .then(board => { if (!cancelled) setInSynthesis(board.inSynthesis); })
      .catch(() => {});
    const off = synthesisSocket.on('synthesis_changed', payload => {
      const state = (payload as { state?: { inSynthesis?: boolean } })?.state;
      if (state) setInSynthesis(!!state.inSynthesis);
    });
    return () => { cancelled = true; off(); };
  }, [useMock, instanceId, effectiveUserId]);

  if (isLoading) return <LoadingShell label="Tuning in…" />;

  if (!showMap) {
    if (!isAuthenticated) {
      return <LoggedOutLanding onTryDemo={() => setDemoMode(true)} />;
    }
    if (!ideasChecked) return <LoadingShell label="Loading your ideas…" />;
    // Signed in, membership lookup finished, no ACTIVE idea yet → the home
    // surface (D15): the ideas this account drafted and joined, with the
    // entry points to draft, join by code, or browse the public directory.
    // It handles the empty case too, so a brand-new account lands here.
    return (
      <IdeaList
        userId={userId!}
        ideas={ideas}
        onOpen={selectIdea}
        onDraft={draft}
        onJoin={join}
        loading={ideasLoading}
        error={ideasError}
        clearError={clearError}
      />
    );
  }

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        {/* Two controls, side by side: the members door, and the way back
            out. The idea's title is already the home hub at the centre of the
            map, and the head-count and invite code now live on the people
            page — so the corner is an icon and a link, not a panel. */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            onClick={() => setShowPeople(true)}
            title="See who is working on this idea"
            aria-label="Members"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line"
            style={{ background: 'rgba(38,34,51,0.85)', backdropFilter: 'blur(8px)', color: 'var(--own)' }}
          >
            <MembersIcon />
          </button>
          {!demoMode && idea && (
            <button
              onClick={() => leaveActive()}
              className="eyebrow rounded-full border border-line px-3 py-2 text-[0.6rem] text-mist-faint"
              style={{ background: 'rgba(38,34,51,0.85)', backdropFilter: 'blur(8px)' }}
            >
              ← ideas
            </button>
          )}
          {demoMode && !idea && (
            <button
              onClick={() => setDemoMode(false)}
              className="eyebrow rounded-full border border-line px-3 py-2 text-[0.6rem] text-mist-faint"
              style={{ background: 'rgba(38,34,51,0.85)', backdropFilter: 'blur(8px)' }}
            >
              ← exit demo
            </button>
          )}
        </div>
        <div className="pointer-events-auto">
          {isLoading ? null : isAuthenticated ? (
            <button onClick={logout} className="eyebrow rounded-full border border-line px-3 py-2" style={{ background: 'rgba(38,34,51,0.85)' }}>
              {effectiveHandle} · sign out
            </button>
          ) : (
            <Link href="/login" className="eyebrow rounded-full border border-line px-3 py-2" style={{ background: 'rgba(38,34,51,0.85)' }}>
              Sign in
            </Link>
          )}
        </div>
      </header>

      <MapGraph
        instanceId={instanceId}
        inSynthesis={inSynthesis}
        userId={effectiveUserId}
        ownerHandle={effectiveHandle}
        useMock={useMock}
        openPostRequest={openPostRequest}
        onOpenPostRequestHandled={() => setOpenPostRequest(null)}
      />

      {overlay === 'feed' && (
        <FeedOverlay
          instanceId={instanceId}
          userId={effectiveUserId}
          useMock={useMock}
          onClose={() => setOverlay(null)}
          onOpenPost={id => { setOverlay(null); setOpenPostRequest({ nodeId: id }); }}
        />
      )}
      {overlay === 'union' && (
        <UnionOverlay
          instanceId={instanceId}
          userId={effectiveUserId}
          useMock={useMock}
          onClose={() => setOverlay(null)}
          onOpenPost={(nodeId, replyId) => { setOverlay(null); setOpenPostRequest({ nodeId, replyId }); }}
          onStatementSubmitted={() => setOverlay('statements')}
        />
      )}
      {overlay === 'statements' && (
        <StatementsOverlay
          instanceId={instanceId}
          userId={effectiveUserId}
          useMock={useMock}
          onClose={() => setOverlay(null)}
          onDraft={() => setOverlay('union')}
        />
      )}

      {showPeople && (
        <PeopleOverlay
          code={ideaCode}
          userId={effectiveUserId}
          memberCount={memberCount}
          useMock={useMock}
          onClose={() => setShowPeople(false)}
          onOpenPost={id => { setShowPeople(false); setOpenPostRequest({ nodeId: id }); }}
        />
      )}

      <OverlayDock active={overlay} onSelect={setOverlay} />
    </main>
  );
}
