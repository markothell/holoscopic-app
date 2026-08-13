import type { Metadata, Viewport } from 'next';
import { Fraunces, Space_Grotesk, IBM_Plex_Mono } from 'next/font/google';
import { AuthProvider } from '@/contexts/AuthContext';
import Beacon from '@/components/Beacon';
import VercelAnalytics from '@/components/VercelAnalytics';
import './globals.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-fraunces',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space-grotesk',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://synthesis.holoscopic.io'),
  title: 'Synthesis',
  description: 'Many private maps, tuned into one collective.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#1B1826',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${spaceGrotesk.variable} ${plexMono.variable}`}>
      <body>
        <Beacon app="synthesis" />
        <VercelAnalytics />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
