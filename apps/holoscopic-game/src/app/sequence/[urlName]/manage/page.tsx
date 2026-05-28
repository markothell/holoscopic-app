'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sequence } from '@/models/Sequence';
import { SequenceService } from '@/services/sequenceService';
import { FormattingService } from '@/utils/formatting';
import { useAuth } from '@/contexts/AuthContext';
import UserMenu from '@/components/UserMenu';
import { FrameService, FrameEntry } from '@/services/frameService';
import styles from './page.module.css';

type Tab = 'activities' | 'users';

interface MemberStat {
  userId: string;
  email: string;
  username: string;
  joinedAt: Date;
  activitiesCount: number;
  mappingsCount: number;
}

export default function ManagePage() {
  const params = useParams();
  const router = useRouter();
  const urlName = params.urlName as string;
  const { userId, isAuthenticated, isLoading: authLoading } = useAuth();

  const [sequence, setSequence] = useState<Sequence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('activities');

  const [updates, setUpdates] = useState('');
  const [savingUpdates, setSavingUpdates] = useState(false);
  const [updatesSaved, setUpdatesSaved] = useState(false);

  const [memberStats, setMemberStats] = useState<MemberStat[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);

  const [addEmailInput, setAddEmailInput] = useState('');
  const [addingEmails, setAddingEmails] = useState(false);

  const [scheduleInputs, setScheduleInputs] = useState<Record<string, string>>({});
  const [showSchedule, setShowSchedule] = useState<Record<string, boolean>>({});
  const [actingOn, setActingOn] = useState<Record<string, boolean>>({});

  const [nominateActivityId, setNominateActivityId] = useState<string | null>(null);
  const [nominateEntries, setNominateEntries] = useState<FrameEntry[]>([]);
  const [nominateLoading, setNominateLoading] = useState(false);
  const [nominateMethod, setNominateMethod] = useState<'manual' | 'top_voted' | 'top_voted_per_quadrant'>('top_voted');
  const [nominateUserId, setNominateUserId] = useState('');
  const [nominateSlot, setNominateSlot] = useState(1);
  const [nominating, setNominating] = useState(false);

  useEffect(() => {
    document.body.style.background = '#F7F4EF';
    return () => { document.body.style.background = ''; };
  }, []);

  // silent=true skips the loading spinner — used after mutations to refresh without flashing
  const loadSequence = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await SequenceService.getSequenceForManage(urlName);
      setSequence(data);
      setUpdates(data.updates || '');
    } catch {
      setError('Failed to load sequence.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [urlName]);

  useEffect(() => {
    if (!urlName || authLoading) return;
    loadSequence();
  }, [urlName, authLoading, loadSequence]);

  useEffect(() => {
    if (!loading && !authLoading && sequence && userId && sequence.createdBy !== userId) {
      router.replace(`/sequence/${urlName}`);
    }
    if (!authLoading && !isAuthenticated && !loading) {
      router.replace(`/login?callbackUrl=/sequence/${urlName}/manage`);
    }
  }, [loading, authLoading, sequence, userId, isAuthenticated, urlName, router]);

  const loadMemberStats = useCallback(async () => {
    if (!sequence) return;
    setStatsLoading(true);
    try {
      const stats = await SequenceService.getMemberStats(sequence.id);
      setMemberStats(stats);
    } catch {
      // non-fatal
    } finally {
      setStatsLoading(false);
    }
  }, [sequence]);

  useEffect(() => {
    if (tab === 'users' && sequence) loadMemberStats();
  }, [tab, sequence, loadMemberStats]);

  const handleSaveUpdates = async () => {
    if (!sequence) return;
    setSavingUpdates(true);
    try {
      await SequenceService.updateSequence(sequence.id, { updates });
      setUpdatesSaved(true);
      setTimeout(() => setUpdatesSaved(false), 2000);
    } catch {
      alert('Failed to save updates');
    } finally {
      setSavingUpdates(false);
    }
  };

  const setActing = (key: string, val: boolean) =>
    setActingOn(prev => ({ ...prev, [key]: val }));

  const handleOpen = async (activityId: string) => {
    if (!sequence) return;
    setActing(activityId, true);
    try {
      await SequenceService.openActivity(sequence.id, activityId);
      await loadSequence(true);
    } catch (e: any) {
      alert(e.message || 'Failed to open activity');
    } finally {
      setActing(activityId, false);
    }
  };

  const handleClose = async (activityId: string) => {
    if (!sequence) return;
    setActing(activityId, true);
    try {
      await SequenceService.closeActivity(sequence.id, activityId);
      await loadSequence(true);
    } catch (e: any) {
      alert(e.message || 'Failed to close activity');
    } finally {
      setActing(activityId, false);
    }
  };

  const handleReopen = async (activityId: string) => {
    if (!sequence) return;
    setActing(activityId, true);
    try {
      await SequenceService.reopenActivity(sequence.id, activityId);
      await loadSequence(true);
    } catch (e: any) {
      alert(e.message || 'Failed to reopen activity');
    } finally {
      setActing(activityId, false);
    }
  };

  const handleSchedule = async (activityId: string) => {
    if (!sequence) return;
    const dateVal = scheduleInputs[activityId];
    if (!dateVal) return;
    setActing(`sched-${activityId}`, true);
    try {
      await SequenceService.scheduleActivityClose(sequence.id, activityId, new Date(dateVal).toISOString());
      await loadSequence(true);
      setShowSchedule(prev => ({ ...prev, [activityId]: false }));
    } catch (e: any) {
      alert(e.message || 'Failed to schedule close');
    } finally {
      setActing(`sched-${activityId}`, false);
    }
  };

  const handleRoundVisibility = async (roundNumber: number, hidden: boolean) => {
    if (!sequence) return;
    setActing(`round-${roundNumber}`, true);
    try {
      await SequenceService.setRoundVisibility(sequence.id, roundNumber, hidden);
      await loadSequence(true);
    } catch {
      alert('Failed to update round visibility');
    } finally {
      setActing(`round-${roundNumber}`, false);
    }
  };

  const handleAddEmails = async () => {
    if (!sequence || !addEmailInput.trim()) return;
    const emails = addEmailInput
      .split(/[\n,;]+/)
      .map(e => e.trim().toLowerCase())
      .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (emails.length === 0) { alert('No valid emails found'); return; }
    setAddingEmails(true);
    try {
      await SequenceService.addInvitedEmails(sequence.id, emails);
      await loadSequence(true);
      setAddEmailInput('');
    } catch {
      alert('Failed to add emails');
    } finally {
      setAddingEmails(false);
    }
  };

  const handleRemoveEmail = async (email: string) => {
    if (!sequence) return;
    try {
      await SequenceService.removeInvitedEmail(sequence.id, email);
      await loadSequence(true);
    } catch {
      alert('Failed to remove email');
    }
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/sequence/${urlName}`;
    navigator.clipboard.writeText(url).then(() => alert('Link copied!'));
  };

  const openNominateModal = async (activityId: string) => {
    setNominateActivityId(activityId);
    setNominateMethod('top_voted');
    setNominateUserId('');
    setNominateSlot(1);
    setNominateLoading(true);
    try {
      const data = await FrameService.getEntries(activityId);
      setNominateEntries(data.entries);
    } catch {
      setNominateEntries([]);
    } finally {
      setNominateLoading(false);
    }
  };

  const handleNominate = async () => {
    if (!sequence || !nominateActivityId || !userId) return;
    setNominating(true);
    try {
      await FrameService.nominate(userId, {
        sequenceId: sequence.id,
        sourceActivityId: nominateActivityId,
        selectionMethod: nominateMethod,
        ...(nominateMethod === 'manual' ? { nomineeUserId: nominateUserId, entrySlotNumber: nominateSlot } : {}),
      });
      setNominateActivityId(null);
      alert('Nomination sent!');
    } catch (err: any) {
      alert(err.message || 'Failed to nominate');
    } finally {
      setNominating(false);
    }
  };

  const getActivityStatus = (seqActivity: any) => {
    const openedAt = seqActivity.openedAt ? new Date(seqActivity.openedAt) : null;
    const closedAt = seqActivity.closedAt ? new Date(seqActivity.closedAt) : null;
    const now = new Date();
    if (!openedAt) return 'not-started';
    if (closedAt && now > closedAt) return 'closed';
    if (closedAt && now <= closedAt) return 'scheduled';
    return 'open';
  };

  const getRoundVisibility = (roundNumber: number): boolean => {
    if (!sequence?.rounds) return false;
    const r = sequence.rounds.find(r => r.number === roundNumber);
    return r ? r.hidden : false;
  };

  if (loading || authLoading) return <div className={styles.loading}>Loading…</div>;
  if (error || !sequence) return <div className={styles.loading}>{error || 'Sequence not found'}</div>;

  const sorted = [...sequence.activities].sort((a, b) => a.order - b.order);
  const roundMap = new Map<number, typeof sorted>();
  sorted.forEach(a => {
    const r = (a as any).round ?? 1;
    if (!roundMap.has(r)) roundMap.set(r, []);
    roundMap.get(r)!.push(a);
  });
  const roundNumbers = Array.from(roundMap.keys()).sort((a, b) => a - b);

  const enrolledEmails = new Set(sequence.members.map(m => m.email?.toLowerCase()));
  const uninvitedEmails = (sequence.invitedEmails || []).filter(e => !enrolledEmails.has(e));

  return (
    <div className={styles.page}>
      <div className={styles.grain} />
      <div className={styles.container}>
        <nav className={styles.nav}>
          <div className={styles.navInner}>
            <Link href="/" className={styles.navHome}>
              Holo<span>scopic</span>
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <span className={styles.navLabel}>Manage</span>
              <UserMenu />
            </div>
          </div>
        </nav>

        <Link href={`/sequence/${urlName}`} className={styles.breadcrumb}>
          ← Back to sequence
        </Link>

        <div className={styles.header}>
          <h1 className={styles.title}>{sequence.title}</h1>
          <p className={styles.subtitle}>Facilitator controls</p>
        </div>

        <div className={styles.tabToggle}>
          <button
            className={`${styles.tabBtn} ${tab === 'activities' ? styles.tabBtnActive : ''}`}
            onClick={() => setTab('activities')}
          >
            Activities
          </button>
          <button
            className={`${styles.tabBtn} ${tab === 'users' ? styles.tabBtnActive : ''}`}
            onClick={() => setTab('users')}
          >
            Users
          </button>
        </div>

        {tab === 'activities' && (
          <>
            <div className={styles.card}>
              <p className={styles.cardTitle}>Updates</p>
              <textarea
                className={styles.updatesTextarea}
                value={updates}
                onChange={e => setUpdates(e.target.value)}
                rows={4}
                placeholder="Share an update with participants…"
                maxLength={5000}
              />
              <p className={styles.updatesHint}>
                Shown to participants between the CTA and activity list.
              </p>
              <button
                className={`${styles.saveBtn} ${updatesSaved ? styles.saveBtnGreen : ''}`}
                onClick={handleSaveUpdates}
                disabled={savingUpdates}
              >
                {updatesSaved ? 'Saved' : savingUpdates ? 'Saving…' : 'Save Updates'}
              </button>
            </div>

            {sequence.activities.length === 0 ? (
              <p className={styles.empty}>No activities in this sequence.</p>
            ) : (
              roundNumbers.map(roundNum => {
                const acts = roundMap.get(roundNum)!;
                const isHidden = getRoundVisibility(roundNum);
                const isRoundActing = actingOn[`round-${roundNum}`];

                return (
                  <div key={roundNum} className={styles.roundSection}>
                    <div className={styles.roundHeader}>
                      <div className={styles.roundHeaderLeft}>
                        <span className={styles.roundLabel}>Round {roundNum}</span>
                        <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: '0.6rem', color: 'var(--ink-light)', letterSpacing: '0.05em' }}>
                          {acts.length} {acts.length === 1 ? 'activity' : 'activities'}
                        </span>
                      </div>
                      <button
                        className={`${styles.visibilityToggle} ${isHidden ? styles.visibilityToggleHidden : styles.visibilityToggleVisible}`}
                        onClick={() => handleRoundVisibility(roundNum, !isHidden)}
                        disabled={isRoundActing}
                      >
                        {isHidden ? '⊘ Hidden from participants' : '◎ Visible to participants'}
                      </button>
                    </div>

                    <div className={styles.activityRows}>
                      {acts.map((seqActivity) => {
                        const activity = (seqActivity as any).activity;
                        const status = getActivityStatus(seqActivity);
                        const isActing = actingOn[seqActivity.activityId];
                        const globalIdx = sorted.indexOf(seqActivity);
                        const closedAt = seqActivity.closedAt ? new Date(seqActivity.closedAt) : null;
                        const isFutureClose = closedAt && new Date() <= closedAt;

                        return (
                          <div key={seqActivity.activityId} className={styles.activityRow}>
                            <div className={styles.activityNum}>{globalIdx + 1}</div>
                            <div className={styles.activityInfo}>
                              <span className={styles.activityTitle}>
                                {activity?.title || seqActivity.activityId}
                              </span>
                              <div className={styles.activityMeta}>
                                {seqActivity.openedAt && (
                                  <span>Opened {FormattingService.formatTimestamp(seqActivity.openedAt)}</span>
                                )}
                                {isFutureClose && (
                                  <span> · Closes {FormattingService.formatTimestamp(seqActivity.closedAt!)}</span>
                                )}
                                {status === 'closed' && closedAt && (
                                  <span> · Closed {FormattingService.formatTimestamp(seqActivity.closedAt!)}</span>
                                )}
                              </div>

                              {showSchedule[seqActivity.activityId] && (
                                <div className={styles.scheduleForm}>
                                  <input
                                    type="datetime-local"
                                    className={styles.dateInput}
                                    value={scheduleInputs[seqActivity.activityId] || ''}
                                    onChange={e => setScheduleInputs(prev => ({ ...prev, [seqActivity.activityId]: e.target.value }))}
                                  />
                                  <button
                                    className={`${styles.actionBtn} ${styles.actionBtnNeutral}`}
                                    onClick={() => handleSchedule(seqActivity.activityId)}
                                    disabled={actingOn[`sched-${seqActivity.activityId}`]}
                                  >
                                    Set
                                  </button>
                                  <button
                                    className={`${styles.actionBtn} ${styles.actionBtnNeutral}`}
                                    onClick={() => setShowSchedule(prev => ({ ...prev, [seqActivity.activityId]: false }))}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className={styles.activityControls}>
                              <span className={`${styles.badge} ${
                                status === 'open' ? styles.badgeOpen
                                : status === 'closed' ? styles.badgeClosed
                                : status === 'scheduled' ? styles.badgeScheduled
                                : styles.badgeNotStarted
                              }`}>
                                {status === 'not-started' ? 'Not started'
                                  : status === 'scheduled' ? 'Open · Scheduled close'
                                  : status}
                              </span>

                              {status === 'not-started' && (
                                <button
                                  className={`${styles.actionBtn} ${styles.actionBtnOpen}`}
                                  onClick={() => handleOpen(seqActivity.activityId)}
                                  disabled={isActing}
                                >
                                  Open
                                </button>
                              )}
                              {(status === 'open' || status === 'scheduled') && (
                                <>
                                  <button
                                    className={`${styles.actionBtn} ${styles.actionBtnClose}`}
                                    onClick={() => handleClose(seqActivity.activityId)}
                                    disabled={isActing}
                                  >
                                    Close Now
                                  </button>
                                  {!showSchedule[seqActivity.activityId] && (
                                    <button
                                      className={`${styles.actionBtn} ${styles.actionBtnNeutral}`}
                                      onClick={() => setShowSchedule(prev => ({ ...prev, [seqActivity.activityId]: true }))}
                                    >
                                      Schedule Close
                                    </button>
                                  )}
                                </>
                              )}
                              {status === 'closed' && (
                                <button
                                  className={`${styles.actionBtn} ${styles.actionBtnOpen}`}
                                  onClick={() => handleReopen(seqActivity.activityId)}
                                  disabled={isActing}
                                >
                                  Reopen
                                </button>
                              )}
                              {status !== 'not-started' && (
                                <button
                                  className={`${styles.actionBtn} ${styles.actionBtnNeutral}`}
                                  onClick={() => openNominateModal(seqActivity.activityId)}
                                >
                                  Nominate frame
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}

        {tab === 'users' && (
          <>
            <div className={styles.card}>
              <p className={styles.cardTitle}>Invite link</p>
              <button className={styles.copyLinkBtn} onClick={handleCopyLink}>
                Copy sequence link →
              </button>
              <p className={styles.cardTitle} style={{ marginTop: '1rem' }}>Add to invite list</p>
              <div className={styles.inviteRow}>
                <input
                  type="text"
                  className={styles.inviteInput}
                  value={addEmailInput}
                  onChange={e => setAddEmailInput(e.target.value)}
                  placeholder="email@example.com, or one per line"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddEmails(); } }}
                />
                <button
                  className={styles.saveBtn}
                  onClick={handleAddEmails}
                  disabled={addingEmails}
                >
                  {addingEmails ? 'Adding…' : 'Add'}
                </button>
              </div>
            </div>

            <div className={styles.card}>
              <p className={styles.cardTitle}>
                Enrolled members ({sequence.members.length})
              </p>
              {sequence.members.length === 0 ? (
                <p className={styles.empty}>No members yet.</p>
              ) : statsLoading ? (
                <p className={styles.empty}>Loading stats…</p>
              ) : (
                sequence.members.map(member => {
                  const stat = memberStats.find(s => s.userId === member.userId);
                  return (
                    <div key={member.userId} className={styles.memberRow}>
                      <div className={styles.memberEmail}>
                        {member.username || member.email || member.userId}
                        {member.username && member.email && (
                          <span style={{ color: 'var(--ink-light)', marginLeft: '0.4rem' }}>
                            {member.email}
                          </span>
                        )}
                      </div>
                      <div className={styles.memberMeta}>
                        {stat ? `${stat.activitiesCount} activities · ${stat.mappingsCount} entries` : '—'}
                      </div>
                      <div className={styles.memberMeta}>
                        Joined {FormattingService.formatTimestamp(member.joinedAt)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {uninvitedEmails.length > 0 && (
              <div className={styles.card}>
                <p className={styles.cardTitle}>
                  Invited — not yet enrolled ({uninvitedEmails.length})
                </p>
                {uninvitedEmails.map(email => (
                  <div key={email} className={styles.memberRow}>
                    <div className={styles.memberEmail}>{email}</div>
                    <button className={styles.removeBtn} onClick={() => handleRemoveEmail(email)}>
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Frame nomination modal */}
      {nominateActivityId && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div style={{ background: '#F7F4EF', borderRadius: 12, padding: '1.5rem', maxWidth: 480, width: '100%', maxHeight: '80vh', overflowY: 'auto' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0F0D0B', margin: '0 0 0.4rem 0' }}>Nominate a frame</h2>
          <p style={{ fontSize: '0.78rem', color: '#6B6560', margin: '0 0 1.25rem 0', lineHeight: 1.5 }}>
            Invite a participant to design the next activity based on their entry.
          </p>

          <div style={{ marginBottom: '1rem' }}>
            <p style={{ fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6B6560', margin: '0 0 0.5rem 0' }}>Selection method</p>
            {(['top_voted', 'top_voted_per_quadrant', 'manual'] as const).map(m => (
              <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', cursor: 'pointer', fontSize: '0.82rem', color: '#0F0D0B' }}>
                <input type="radio" name="nominateMethod" value={m} checked={nominateMethod === m} onChange={() => setNominateMethod(m)} />
                {m === 'top_voted' ? 'Top voted entry' : m === 'top_voted_per_quadrant' ? 'Top voted per quadrant (one nomination each)' : 'Manual — pick an entry'}
              </label>
            ))}
          </div>

          {nominateMethod === 'manual' && (
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6B6560', margin: '0 0 0.5rem 0' }}>Select entry</p>
              {nominateLoading ? (
                <p style={{ fontSize: '0.8rem', color: '#6B6560' }}>Loading entries…</p>
              ) : nominateEntries.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: '#6B6560' }}>No entries yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 220, overflowY: 'auto' }}>
                  {nominateEntries.map(e => {
                    const key = `${e.userId}:${e.slotNumber}`;
                    const selected = nominateUserId === e.userId && nominateSlot === e.slotNumber;
                    return (
                      <button key={key} onClick={() => { setNominateUserId(e.userId); setNominateSlot(e.slotNumber); }}
                        style={{ textAlign: 'left', padding: '0.5rem 0.75rem', borderRadius: 6, border: `1px solid ${selected ? '#C83B50' : '#D9D4CC'}`, background: selected ? 'rgba(200,59,80,0.06)' : 'white', cursor: 'pointer' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 500, color: '#0F0D0B' }}>{e.objectName || e.username}</span>
                        <span style={{ fontSize: '0.7rem', color: '#6B6560', marginLeft: '0.5rem' }}>
                          {e.username} · {e.quadrant} · {e.voteCount} vote{e.voteCount !== 1 ? 's' : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button onClick={() => setNominateActivityId(null)}
              style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.45rem 1rem', borderRadius: 999, border: '1px solid #D9D4CC', background: 'none', color: '#6B6560', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={handleNominate} disabled={nominating || (nominateMethod === 'manual' && !nominateUserId)}
              style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.45rem 1.2rem', borderRadius: 999, border: 'none', background: '#C83B50', color: '#fff', cursor: nominating ? 'wait' : 'pointer', opacity: (nominating || (nominateMethod === 'manual' && !nominateUserId)) ? 0.6 : 1 }}>
              {nominating ? 'Sending…' : 'Send nomination'}
            </button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
