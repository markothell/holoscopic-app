'use client';

import { useState, useRef, useEffect } from 'react';
import { signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications, AppNotification } from '@/hooks/useNotifications';

function notificationHref(n: AppNotification): string {
  const validRef = n.refId && n.refId !== 'undefined' && n.refId !== 'null';
  if (n.refType === 'topic' && validRef) {
    if (n.type === 'topic_confirmed') return `/create/activity?topicId=${n.refId}`;
    if (n.type === 'inquiry_linked') return `/inquiry/${n.refId}`;
  }
  if (n.type === 'algorithm_session_ready' && n.refType === 'sequence' && n.refId) {
    return `/sequence/${n.refId}`;
  }
  if (n.type === 'frame_nominated' && n.refType === 'frame_nomination' && n.refId) {
    return `/frame/${n.refId}`;
  }
  if (n.type === 'activity_closed') return '/interview';
  return '/';
}

function BellIcon({ unreadCount, notifications, onMarkRead, onMarkAllRead }: {
  unreadCount: number;
  notifications: AppNotification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: '0.4rem', display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span style={{ position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: '50%', background: 'var(--accent)', color: '#fff', fontSize: '0.55rem', fontFamily: 'var(--font-dm-mono), monospace', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position: 'absolute', right: 0, marginTop: '0.5rem', width: '18rem', maxWidth: 'calc(100vw - 1rem)', background: '#F7F4EF', borderRadius: 8, boxShadow: '0 4px 24px rgba(15,13,11,0.12)', border: '1px solid #D9D4CC', zIndex: 1200 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 1rem', borderBottom: '1px solid #D9D4CC' }}>
            <span style={{ fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#0F0D0B' }}>Notifications</span>
            {unreadCount > 0 && (
              <button onClick={onMarkAllRead} style={{ fontSize: '0.55rem', fontFamily: 'var(--font-dm-mono), monospace', color: '#6B6560', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.08em' }}>
                Mark all read
              </button>
            )}
          </div>

          {/* Inbox model: only unread shows; reading (click) or Mark-all-read
              clears the list. History stays in the DB. */}
          {notifications.filter(n => !n.read).length === 0 ? (
            <p style={{ padding: '1.25rem 1rem', fontSize: '0.75rem', color: '#6B6560', margin: 0, textAlign: 'center' }}>You&apos;re all caught up</p>
          ) : (
            <div style={{ maxHeight: '20rem', overflowY: 'auto' }}>
              {notifications.filter(n => !n.read).map(n => (
                <button
                  key={n.id}
                  onClick={() => {
                    onMarkRead(n.id);
                    setOpen(false);
                    router.push(notificationHref(n));
                  }}
                  style={{ width: '100%', textAlign: 'left', padding: '0.75rem 1rem', background: 'rgba(200,59,80,0.04)', border: 'none', borderBottom: '1px solid #D9D4CC', cursor: 'pointer', display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}
                >
                  <span style={{ marginTop: 6, width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.78rem', color: '#0F0D0B', lineHeight: 1.45 }}>{n.message}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { isAuthenticated, userName, userEmail, userRole, userId, holonBalance, socket } = useAuth();
  const router = useRouter();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications(userId, socket);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/' });
  };

  if (!isAuthenticated) {
    return (
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <button
          onClick={() => router.push(`/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`)}
          style={{
            fontFamily: 'var(--font-dm-mono), monospace',
            fontSize: '0.62rem',
            fontWeight: 300,
            letterSpacing: '0.15em',
            textTransform: 'uppercase' as const,
            color: '#6B6560',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0.5rem 0.75rem',
            transition: 'color 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#C83B50')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#6B6560')}
        >
          Login
        </button>
        <button
          onClick={() => router.push('/waitlist')}
          style={{
            fontFamily: 'var(--font-dm-mono), monospace',
            fontSize: '0.62rem',
            fontWeight: 300,
            letterSpacing: '0.15em',
            textTransform: 'uppercase' as const,
            color: '#C83B50',
            background: 'none',
            border: '1px solid #C83B50',
            borderRadius: '999px',
            cursor: 'pointer',
            padding: '0.4rem 1rem',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#C83B50';
            e.currentTarget.style.color = '#fff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'none';
            e.currentTarget.style.color = '#C83B50';
          }}
        >
          Sign Up
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
      <BellIcon unreadCount={unreadCount} notifications={notifications} onMarkRead={markRead} onMarkAllRead={markAllRead} />
    <div style={{ position: 'relative' }} ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.4rem 0.6rem',
          borderRadius: '8px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          transition: 'background 0.2s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
      >
        <div style={{
          width: '2rem',
          height: '2rem',
          borderRadius: '50%',
          background: '#C83B50',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-barlow), sans-serif',
          fontWeight: 700,
          fontSize: '0.75rem',
          textTransform: 'uppercase' as const,
        }}>
          {userName ? userName[0].toUpperCase() : userEmail?.[0].toUpperCase() || 'U'}
        </div>
        <svg
          style={{
            width: '0.75rem',
            height: '0.75rem',
            color: '#6B6560',
            transition: 'transform 0.2s',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          right: 0,
          marginTop: '0.5rem',
          width: '14rem',
          background: '#F7F4EF',
          borderRadius: '8px',
          boxShadow: '0 4px 24px rgba(15, 13, 11, 0.12)',
          border: '1px solid #D9D4CC',
          padding: '0.25rem 0',
          zIndex: 1100,
        }}>
          <div style={{
            padding: '0.75rem 1rem',
            borderBottom: '1px solid #D9D4CC',
          }}>
            <p style={{
              fontFamily: 'var(--font-cormorant), Georgia, serif',
              fontSize: '0.95rem',
              fontWeight: 600,
              color: '#0F0D0B',
              margin: 0,
            }}>{userName || 'User'}</p>
            <p style={{
              fontFamily: 'var(--font-dm-mono), monospace',
              fontSize: '0.55rem',
              fontWeight: 300,
              letterSpacing: '0.08em',
              color: '#6B6560',
              margin: '0.15rem 0 0 0',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap' as const,
            }}>{userEmail}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem', flexWrap: 'wrap' as const }}>
              {holonBalance !== null && (
                <span style={{
                  display: 'inline-block',
                  padding: '0.15rem 0.5rem',
                  fontFamily: 'var(--font-dm-mono), monospace',
                  fontSize: '0.5rem',
                  fontWeight: 300,
                  letterSpacing: '0.12em',
                  background: 'rgba(52, 211, 153, 0.12)',
                  color: '#059669',
                  borderRadius: '999px',
                }}>
                  {holonBalance} H
                </span>
              )}
              {userRole === 'admin' && (
                <span style={{
                  display: 'inline-block',
                  padding: '0.15rem 0.5rem',
                  fontFamily: 'var(--font-dm-mono), monospace',
                  fontSize: '0.5rem',
                  fontWeight: 300,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase' as const,
                  background: 'rgba(200, 59, 80, 0.1)',
                  color: '#C83B50',
                  borderRadius: '999px',
                }}>
                  Admin
                </span>
              )}
            </div>
          </div>

          {[
            { label: 'Profile', path: `/profile/${userId}` },
            { label: 'Dashboard', path: '/dashboard' },
            ...(userRole === 'admin' ? [{ label: 'Admin', path: '/admin' }] : []),
            { label: 'Create', path: '/create' },
            { label: 'Settings', path: '/settings' },
          ].map((item) => (
            <button
              key={item.path}
              onClick={() => {
                router.push(item.path);
                setIsOpen(false);
              }}
              style={{
                width: '100%',
                textAlign: 'left' as const,
                padding: '0.6rem 1rem',
                fontFamily: 'var(--font-dm-mono), monospace',
                fontSize: '0.6rem',
                fontWeight: 300,
                letterSpacing: '0.12em',
                textTransform: 'uppercase' as const,
                color: '#0F0D0B',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0,0,0,0.04)';
                e.currentTarget.style.color = '#C83B50';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none';
                e.currentTarget.style.color = '#0F0D0B';
              }}
            >
              {item.label}
            </button>
          ))}

          <div style={{ borderTop: '1px solid #D9D4CC', marginTop: '0.25rem', paddingTop: '0.25rem' }}>
            <button
              onClick={handleSignOut}
              style={{
                width: '100%',
                textAlign: 'left' as const,
                padding: '0.6rem 1rem',
                fontFamily: 'var(--font-dm-mono), monospace',
                fontSize: '0.6rem',
                fontWeight: 300,
                letterSpacing: '0.12em',
                textTransform: 'uppercase' as const,
                color: '#C83B50',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(200, 59, 80, 0.06)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
