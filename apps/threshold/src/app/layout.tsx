import type { Metadata } from 'next';
import { Source_Serif_4, Inter } from 'next/font/google';
import PlayerProvider from '@/components/PlayerProviderClient';
import { SessionProvider } from '@/components/SessionProvider';
import Beacon from '@/components/Beacon';
import './globals.css';

// A reading serif for the things people wrote, a working sans for the chrome
// around them. The palette they sit on is PLAN.md §9.2, in globals.css.
const serif = Source_Serif_4({
  subsets: ['latin'],
  weight: ['400', '600'],
  style: ['normal', 'italic'],
  variable: '--font-source-serif',
  display: 'swap',
});

const sans = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
});

// One deployment serves every circle, so there is no single group to name here.
// A circle's own title is set per page in t/[urlName].
export const metadata: Metadata = {
  title: 'Threshold',
  description: 'Find where a group’s dividing line falls.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${serif.variable} ${sans.variable}`}>
        {/* ONE audio element for the whole app: two stories can never talk
            over each other, which in a ranking task makes comparison
            impossible. It also means playback survives navigation. */}
        <SessionProvider><PlayerProvider>{children}</PlayerProvider></SessionProvider>
        <Beacon app="threshold" />
      </body>
    </html>
  );
}
