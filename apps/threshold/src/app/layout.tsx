import type { Metadata } from 'next';
import { Source_Serif_4, Inter } from 'next/font/google';
import { SessionProvider } from '@/components/SessionProvider';
import Beacon from '@/components/Beacon';
import './globals.css';

// Provisional, like the rest of globals.css — a reading serif and a working
// sans so the skeleton is legible. PLAN.md §9.2 has not been answered.
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
        <SessionProvider>{children}</SessionProvider>
        <Beacon app="threshold" />
      </body>
    </html>
  );
}
