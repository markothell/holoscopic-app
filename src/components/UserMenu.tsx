'use client';

import { useState, useRef, useEffect } from 'react';
import { signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { isAuthenticated, userName, userEmail, userRole } = useAuth();
  const router = useRouter();

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
          onClick={() => router.push('/login')}
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
            {userRole === 'admin' && (
              <span style={{
                display: 'inline-block',
                marginTop: '0.35rem',
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

          {[
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
  );
}
