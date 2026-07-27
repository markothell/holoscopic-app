'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import MapGraph from '@/components/graph/MapGraph';
import OverlayDock, { type OverlayKey } from '@/components/overlays/OverlayDock';
import FeedOverlay from '@/components/overlays/FeedOverlay';
import AskOverlay from '@/components/overlays/AskOverlay';
import CommunityGate from '@/components/community/CommunityGate';
import LoggedOutLanding from '@/components/community/LoggedOutLanding';
import { useCommunity } from '@/hooks/useCommunity';
import { unisonSocket } from '@/services/socket';
import { MOCK_COMMUNITY, MOCK_MAX_MEMBERS, MOCK_USER_HANDLE, MOCK_USER_ID } from '@/lib/mock';

// The `unison` PARENT_INSTANCE_ID (services/api.ts) only fronts auth and
// /unison/communities* (create/join by code) — a joined community is its
// OWN child Instance, and every /nodes*/frames* call carries THAT instance
// id as x-instance-id (routes/unison.js). Once useCommunity resolves a real
// membership, its `community.id` replaces MOCK_COMMUNITY.id below and the
// whole tree (map, feed, post/reply, sockets) switches from local-seed mode
// to the live backend — see `useMock` threaded through MapGraph/FeedOverlay.

// D7: My Map is home. Feed / Ask are overlays over it (OverlayDock), not
// separate routes — keeps the graph mounted (and its local state) while a
// member steps in and out of the other two surfaces. Post (task item 1) is
// not a dock destination: it's opened from a specific thought — a map node
// or a Feed item — via openPostRequest, forwarded into MapGraph (which owns
// PostOverlay alongside the other node-detail surfaces it already renders).

// FEATURE (landing / community picker): a signed-in account used to be
// auto-dropped into communities[0]/last-code, and a logged-out visit fell
// onto the mock community map by default — both confusing about which
// community (if any) you're actually looking at. Now: logged out → a
// minimal landing (LoggedOutLanding); signed in with no ACTIVE pick yet →
// CommunityGate doubles as a picker, listing `communities` from
// useCommunity above its existing create/join forms. Only a real click
// (selectCommunity/create/join) — or the explicit "try the demo" opt-in —
// ever reveals the map. `demoMode` is local, unpersisted state: a
// deliberately temporary look at the mock corpus, not a fallback.
function LoadingShell({ label }: { label: string }) {
  return (
    <main className="flex min-h-dvh w-full items-center justify-center">
      <p className="eyebrow text-mist-faint">{label}</p>
    </main>
  );
}

export default function HomePage() {
  const { userId, userName, isAuthenticated, isLoading, logout } = useAuth();
  const {
    communities, community, membership,
    loading: communityLoading, checked: communityChecked, error: communityError,
    clearError, selectCommunity, leaveActive, create, join,
  } = useCommunity(userId);
  const [overlay, setOverlay] = useState<OverlayKey>(null);
  const [openPostRequest, setOpenPostRequest] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  const showMap = demoMode || (isAuthenticated && !!community);

  // No live community yet (demo, or checked-and-empty) → the app keeps
  // rendering on seed data (guardrail: never hard-crash without a
  // backend/community). Once a real community is ACTIVE, everything below
  // switches to the live instance + handle.
  const useMock = !community;
  const instanceId = community?.id ?? MOCK_COMMUNITY.id;
  const effectiveUserId = userId ?? MOCK_USER_ID;
  const effectiveHandle = membership?.handle ?? userName ?? MOCK_USER_HANDLE;
  const communityName = community?.name ?? MOCK_COMMUNITY.name;
  // Real communities start at 1 (you); memberCount is backfilled from the
  // lookup endpoint by useCommunity. Only the mock shows the seed count.
  const memberCount = useMock ? MOCK_COMMUNITY.memberCount : (community?.memberCount ?? 1);
  const communityCode = community?.code ?? null; // the shareable join code (real community only)
  const copyCode = () => {
    if (!communityCode) return;
    navigator.clipboard?.writeText(communityCode)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })
      .catch(() => {});
  };

  // One socket connection per live community, owned here; overlays and
  // MapGraph only ever subscribe (unisonSocket.on), never connect/disconnect
  // themselves, so there's a single lifecycle to reason about.
  useEffect(() => {
    if (useMock) return;
    unisonSocket.connect(instanceId);
    return () => unisonSocket.disconnect();
  }, [useMock, instanceId]);

  if (isLoading) return <LoadingShell label="Tuning in…" />;

  if (!showMap) {
    if (!isAuthenticated) {
      return <LoggedOutLanding onTryDemo={() => setDemoMode(true)} />;
    }
    if (!communityChecked) return <LoadingShell label="Loading your communities…" />;
    // Signed in, membership lookup finished, no ACTIVE community yet → the
    // picker (a real membership already, or none — CommunityGate handles
    // both: list-and-pick when there's something to list, create/join
    // either way).
    return (
      <CommunityGate
        communities={communities}
        onSelect={selectCommunity}
        onCreate={create}
        onJoin={join}
        loading={communityLoading}
        error={communityError}
        clearError={clearError}
      />
    );
  }

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto rounded-2xl border border-line px-3 py-2" style={{ background: 'rgba(38,34,51,0.85)', backdropFilter: 'blur(8px)' }}>
          <p className="eyebrow" style={{ color: 'var(--own)' }}>{communityName}{demoMode && !community && ' · demo'}</p>
          <p className="text-[0.7rem] text-mist-faint">{memberCount}/{MOCK_MAX_MEMBERS} voices</p>
          {communityCode && (
            <button
              onClick={copyCode}
              title="Copy the invite code to share with others"
              className="eyebrow mt-1 rounded-full border border-line px-2 py-0.5 text-[0.6rem]"
              style={{ color: copied ? 'var(--own)' : undefined }}
            >
              {copied ? 'copied ✓' : `invite code ${communityCode} · copy`}
            </button>
          )}
          {!demoMode && community && (
            <button
              onClick={() => leaveActive()}
              className="eyebrow mt-1 block text-[0.6rem] text-mist-faint underline"
            >
              ← communities
            </button>
          )}
          {demoMode && !community && (
            <button
              onClick={() => setDemoMode(false)}
              className="eyebrow mt-1 block text-[0.6rem] text-mist-faint underline"
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
          onOpenPost={id => { setOverlay(null); setOpenPostRequest(id); }}
        />
      )}
      {overlay === 'ask' && <AskOverlay onClose={() => setOverlay(null)} />}

      <OverlayDock active={overlay} onSelect={setOverlay} />
    </main>
  );
}
