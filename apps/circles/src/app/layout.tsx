import type { Metadata } from 'next';
import { SessionProvider } from '@/components/SessionProvider';
import Beacon from '@/components/Beacon';
import VercelAnalytics from '@/components/VercelAnalytics';
import './globals.css';

// Type is system-resident by design for now: Iowan Old Style for display,
// Seravek for the chrome (DESIGN.md — the webfont decision is open). No
// next/font, nothing fetched.
export const metadata: Metadata = {
  title: 'Holoscopic',
  description: 'Thinking tools for community.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
        <Beacon app="circles" />
        <VercelAnalytics />
      </body>
    </html>
  );
}
